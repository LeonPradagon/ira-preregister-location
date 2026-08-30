import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '../auth/auth.js';
import { db, pool } from './client.js';
import { authUsers, customerAddresses, customers, integrationConfigs, validationConfigs } from './schema/index.js';

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'AdminLocalPassword123!';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Local Super Admin';
const customerExternalId = 'CUST-LOCAL-001';

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

  let [customer] = await db.select().from(customers).where(eq(customers.externalId, customerExternalId)).limit(1);
  if (!customer) {
    [customer] = await db.insert(customers).values({ id: randomUUID(), externalId: customerExternalId, name: 'Customer Local Demo', phoneE164: '+628111111111', status: 'ACTIVE' }).returning();
  }
  if (!customer) throw new Error('Unable to create seeded customer');
  const [address] = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customer.id)).limit(1);
  if (!address) {
    await db.insert(customerAddresses).values({
      id: randomUUID(), customerId: customer.id, addressType: 'MASTER', addressStatus: 'ACTIVE',
      rawAddress: 'Jl. Ir H Juanda No. 10, Dago, Coblong, Bandung, Jawa Barat 40135',
      province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago', postalCode: '40135',
      street: 'Jl. Ir H Juanda', houseNumber: '10', referenceLocation: { latitude: -6.884, longitude: 107.613 },
      referenceSource: 'MASTER_COORDINATE', referencePrecision: 'HOUSE', referenceConfidence: '1.000',
      isActive: true, isVerified: false, validFrom: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
  }
  await db.insert(integrationConfigs).values([
    { id: randomUUID(), key: 'IRA_COVERAGE', enabled: false, name: 'IRA Coverage', description: 'Optional coverage eligibility integration', status: 'PORT_READY_DISABLED' },
    { id: randomUUID(), key: 'TICKETING', enabled: false, name: 'Ticketing', description: 'Optional installation ticket integration', status: 'PORT_READY_DISABLED' },
  ]).onConflictDoNothing({ target: integrationConfigs.key });
  const [config] = await db.select().from(validationConfigs).limit(1);
  if (!config) {
    await db.insert(validationConfigs).values({
      configVersion: 'config-initial',
      configValues: {
        GPS_MAX_ACCURACY_METERS: Number(process.env.GPS_MAX_ACCURACY_METERS ?? 30),
        HOME_RADIUS_METERS: Number(process.env.HOME_RADIUS_METERS ?? 50),
        STREET_MATCH_THRESHOLD: Number(process.env.STREET_MATCH_THRESHOLD ?? 0.9),
        ADDRESS_SCORE_THRESHOLD: Number(process.env.ADDRESS_SCORE_THRESHOLD ?? 0.9),
        MAX_LOCATION_ATTEMPTS: Number(process.env.MAX_LOCATION_ATTEMPTS ?? 5),
        MAX_REMINDERS_PER_SESSION: Number(process.env.MAX_REMINDERS_PER_SESSION ?? 3),
        COORDINATE_DISPLAY_DECIMALS: Number(process.env.COORDINATE_DISPLAY_DECIMALS ?? 6),
        VERIFICATION_TOKEN_TTL_DAYS: Number(process.env.VERIFICATION_TOKEN_TTL_DAYS ?? 7),
        REMINDER_DEFAULT_1_HOURS: Number(process.env.REMINDER_DEFAULT_1_HOURS ?? 2),
        REMINDER_DEFAULT_2_HOURS: Number(process.env.REMINDER_DEFAULT_2_HOURS ?? 24),
        REMINDER_DEFAULT_3_HOURS: Number(process.env.REMINDER_DEFAULT_3_HOURS ?? 24),
        ENABLE_CUSTOMER_OTP: process.env.ENABLE_CUSTOMER_OTP === 'true',
        ENABLE_IRA_COVERAGE: process.env.ENABLE_IRA_COVERAGE === 'true',
        ENABLE_TICKETING: process.env.ENABLE_TICKETING === 'true',
        ENABLE_MANUAL_REVIEW: process.env.ENABLE_MANUAL_REVIEW !== 'false',
        ENABLE_ADDRESS_EDIT: process.env.ENABLE_ADDRESS_EDIT !== 'false',
        ENABLE_REMINDERS: process.env.ENABLE_REMINDERS !== 'false',
      },
    });
  }
  console.info(JSON.stringify({ adminEmail, adminPassword, customerExternalId, status: 'seeded' }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
