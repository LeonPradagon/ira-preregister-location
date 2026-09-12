import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { auditLogs, authUsers } from '../db/schema/index.js';
import { logEvent } from '../common/structured-log.js';

export const AUTH_ANONYMOUS_ACTOR_ID = 'anonymous';

type AuthRequestContext = {
  path?: string;
  method?: string;
  request?: Request;
} | null | undefined;

type AuthAuditInput = {
  action: string;
  actorUserId: string;
  actorName: string;
  entityId: string;
  context?: AuthRequestContext;
  details?: Record<string, unknown>;
};

const requestHeader = (request: Request | undefined, name: string) => request?.headers.get(name) || null;

const clientIp = (request: Request | undefined) => {
  if (!request) return null;
  return (
    requestHeader(request, 'cf-connecting-ip') ??
    requestHeader(request, 'x-real-ip') ??
    requestHeader(request, 'x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
};

export const authAuditDetails = (context: AuthRequestContext, details: Record<string, unknown> = {}) => ({
  ...details,
  path: context?.path ?? null,
  method: context?.method ?? context?.request?.method ?? null,
  ipAddress: clientIp(context?.request),
  userAgent: requestHeader(context?.request, 'user-agent'),
  correlationId: requestHeader(context?.request, 'x-correlation-id'),
});

export const recordAuthAudit = async ({
  action,
  actorUserId,
  actorName,
  entityId,
  context,
  details,
}: AuthAuditInput) => {
  try {
    await db.insert(auditLogs).values({
      actorUserId,
      actorName,
      action,
      entityType: 'AUTH',
      entityId,
      after: authAuditDetails(context, details),
      timestamp: new Date(),
    });
  } catch (error) {
    // Authentication must not fail because an audit insert is temporarily unavailable.
    logEvent('error', 'auth.audit_write_failed', {
      action,
      actorUserId,
      entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const findAuthActor = async (userId: string) => {
  const [user] = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return user;
};

export const findAuthActorByEmail = async (email: string) => {
  const [user] = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);
  return user;
};

export const isAuthFailureResponse = (response: unknown) => {
  if (!response || typeof response !== 'object' || !('statusCode' in response)) return false;
  const statusCode = response.statusCode;
  return typeof statusCode === 'number' && statusCode >= 400;
};
