import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service.js';

const normalizePath = (path: string) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');

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
    });
    next();
  }
}
