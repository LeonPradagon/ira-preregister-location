import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import { authAccounts, authSessions, authUsers, authVerifications } from '../db/schema/index.js';

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
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ],
  emailAndPassword: { enabled: true },
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
