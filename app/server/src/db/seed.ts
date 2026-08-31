import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { auth } from '../auth/auth.js';
import { db, pool } from './client.js';
import { authUsers } from './schema/index.js';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'AdminLocalPassword123!';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Local Super Admin';

const main = async () => {
  let [admin] = await db.select().from(authUsers).where(eq(authUsers.email, adminEmail)).limit(1);
  if (!admin) {
    const result = await auth.api.signUpEmail({ body: { name: adminName, email: adminEmail, password: adminPassword } });
    if (!result.user) throw new Error('Better Auth did not return the seeded user');
    [admin] = await db.select().from(authUsers).where(eq(authUsers.id, result.user.id)).limit(1);
  }
  if (!admin) throw new Error('Unable to load seeded admin');
  await db.update(authUsers).set({ role: 'SUPER_ADMIN', department: 'Operations', updatedAt: new Date() }).where(eq(authUsers.id, admin.id));

  // A failed/ interrupted first seed can leave the Better Auth user row
  // without its credential account. Repair it so the seed remains usable and
  // idempotent instead of requiring manual SQL or a destructive reset.
  const authContext = await auth.$context;
  const credentialPasswordHash = await authContext.password.hash(adminPassword);
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

  console.info(JSON.stringify({ adminEmail, status: 'login-user-ready' }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
