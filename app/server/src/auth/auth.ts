import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import { authAccounts, authSessions, authUsers, authVerifications } from '../db/schema/index.js';
import {
  AUTH_ANONYMOUS_ACTOR_ID,
  findAuthActor,
  findAuthActorByEmail,
  isAuthFailureResponse,
  recordAuthAudit,
} from './auth-audit.js';

type AuthAfterHookContext = {
  path?: string;
  body?: unknown;
  context: { returned?: unknown };
  request?: Request;
  method?: string;
};

// Better Auth resolves its tables by these canonical model keys. The database
// schema uses prefixed exports to keep auth tables distinct from domain tables.
const betterAuthSchema = {
  user: authUsers,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: betterAuthSchema }),
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: '/v1/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    ...(process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],
  emailAndPassword: { enabled: true },
  hooks: {
    after: async (rawContext) => {
      const context = rawContext as unknown as AuthAfterHookContext;
      if (context.path !== '/sign-in/email' || !isAuthFailureResponse(context.context.returned)) return {};

      const body = context.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const actor = email ? await findAuthActorByEmail(email) : undefined;
      await recordAuthAudit({
        action: 'LOGIN_FAILED',
        actorUserId: actor?.id ?? AUTH_ANONYMOUS_ACTOR_ID,
        actorName: actor?.name ?? 'Unknown account',
        entityId: actor?.id ?? 'unknown',
        context,
        details: { outcome: 'FAILED', email: email || null, reason: 'INVALID_CREDENTIALS' },
      });
      return {};
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          if (!context?.path?.startsWith('/sign-in/')) return;
          const actor = await findAuthActor(session.userId);
          await recordAuthAudit({
            action: 'LOGIN_SUCCESS',
            actorUserId: session.userId,
            actorName: actor?.name ?? actor?.email ?? 'Unknown account',
            entityId: session.id,
            context,
            details: { outcome: 'SUCCESS', email: actor?.email ?? null, expiresAt: session.expiresAt.toISOString() },
          });
        },
      },
      delete: {
        after: async (session, context) => {
          const actor = await findAuthActor(session.userId);
          await recordAuthAudit({
            action: context?.path === '/sign-out' ? 'LOGOUT' : 'SESSION_REVOKED',
            actorUserId: session.userId,
            actorName: actor?.name ?? actor?.email ?? 'Unknown account',
            entityId: session.id,
            context,
            details: { outcome: 'COMPLETED', email: actor?.email ?? null },
          });
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 15,
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: true, defaultValue: 'VIEWER', input: false },
      department: { type: 'string', required: false, input: false },
    },
  },
});

export type Auth = typeof auth;
