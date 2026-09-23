import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema/index.js';
import { MetricsService } from './metrics.service.js';
import { AUTH_ANONYMOUS_ACTOR_ID } from '../auth/auth-audit.js';
import type { RequestAdmin } from './request-user.js';

const normalizePath = (path: string) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');

export const shouldRecordAuditResponse = (path: string, method: string, statusCode: number) =>
  path.startsWith('/v1/') &&
  (statusCode >= 400 ||
    ((!['GET', 'HEAD', 'OPTIONS'].includes(method)) &&
      (path.startsWith('/v1/admin/') || path.startsWith('/v1/api/auth/'))));

@Injectable()
export class RequestMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = performance.now();
    response.once('finish', () => {
      const durationMs = performance.now() - startedAt;
      const route = normalizePath(request.path);
      this.metrics.increment(`http_requests_total.${request.method}.${route}.${response.statusCode}`);
      this.metrics.observe(`http_request_duration_ms.${request.method}.${route}`, durationMs);
      if (response.statusCode >= 500) this.metrics.increment('http_errors_total.5xx');
      else if (response.statusCode >= 400) this.metrics.increment('http_errors_total.4xx');
      void this.recordAuditResponse(request, response).catch((error) => {
        console.error('Failed to record HTTP audit status', error);
      });
    });
    next();
  }

  private async recordAuditResponse(request: Request, response: Response) {
    if (!request.path.startsWith('/v1/')) return;

    const isAuth = request.path.startsWith('/v1/api/auth/');
    if (!shouldRecordAuditResponse(request.path, request.method, response.statusCode)) return;

    const correlationId = request.header('x-correlation-id');
    if (isAuth && correlationId) {
      const updated = await db
        .update(auditLogs)
        .set({
          after: sql`coalesce(${auditLogs.after}, '{}'::jsonb) || jsonb_build_object('httpStatusCode', ${response.statusCode}::integer)`,
        })
        .where(and(eq(auditLogs.entityType, 'AUTH'), sql`${auditLogs.after} ->> 'correlationId' = ${correlationId}`))
        .returning({ id: auditLogs.id });
      if (updated.length) return;
    }

    const admin = (request as Request & { admin?: RequestAdmin }).admin;
    await db.insert(auditLogs).values({
      actorUserId: admin?.id ?? AUTH_ANONYMOUS_ACTOR_ID,
      actorName: admin?.name ?? 'Unknown account',
      action: 'HTTP_RESPONSE',
      entityType: 'HTTP_REQUEST',
      entityId: request.path,
      after: {
        method: request.method,
        path: request.path,
        httpStatusCode: response.statusCode,
        correlationId,
      },
      timestamp: new Date(),
    });
  }
}
