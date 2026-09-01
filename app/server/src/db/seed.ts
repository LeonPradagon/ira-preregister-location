import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { auth } from '../auth/auth.js';
import { db, pool } from './client.js';
import { authUsers } from './schema/index.js';

const admins = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'AdminLocalPassword123!',
    name: process.env.SEED_ADMIN_NAME ?? 'Local Super Admin',
  },
  {
    email: process.env.SEED_ADMIN_2_EMAIL,
    password: process.env.SEED_ADMIN_2_PASSWORD,
    name: process.env.SEED_ADMIN_2_NAME ?? 'Local Super Admin 2',
  },
].filter((admin): admin is { email: string; password: string; name: string } => {
  const configured = Boolean(admin.email) || Boolean(admin.password);
  if (configured && (!admin.email || !admin.password)) {
    throw new Error('SEED_ADMIN_2_EMAIL and SEED_ADMIN_2_PASSWORD must be set together');
  }
  return Boolean(admin.email && admin.password);
});

const main = async () => {
  const seededEmails: string[] = [];
  const authContext = await auth.$context;

  for (const adminConfig of admins) {
    let [admin] = await db.select().from(authUsers).where(eq(authUsers.email, adminConfig.email)).limit(1);
    if (!admin) {
      const result = await auth.api.signUpEmail({ body: {
        name: adminConfig.name,
        email: adminConfig.email,
        password: adminConfig.password,
      } });
      if (!result.user) throw new Error(`Better Auth did not return the seeded user for ${adminConfig.email}`);
      [admin] = await db.select().from(authUsers).where(eq(authUsers.id, result.user.id)).limit(1);
    }
    if (!admin) throw new Error(`Unable to load seeded admin ${adminConfig.email}`);
    await db.update(authUsers).set({ role: 'SUPER_ADMIN', department: 'Operations', updatedAt: new Date() }).where(eq(authUsers.id, admin.id));

    // A failed/interrupted seed can leave the Better Auth user row without
    // its credential account. Repair it so the seed remains idempotent.
    const credentialPasswordHash = await authContext.password.hash(adminConfig.password);
    const credentialAccount = await authContext.internalAdapter.findCredentialAccount(admin.id);
    if (!credentialAccount) {
      await authContext.internalAdapter.createAccount({
        userId: admin.id,
        providerId: 'credential',
        issuer: 'local:credential',
        accountId: admin.id,
        password: credentialPasswordHash,
      });
    } else {
      await authContext.internalAdapter.updatePassword(admin.id, credentialPasswordHash);
    }
    seededEmails.push(adminConfig.email);
  }

  console.info(JSON.stringify({ adminEmails: seededEmails, status: 'login-users-ready' }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
