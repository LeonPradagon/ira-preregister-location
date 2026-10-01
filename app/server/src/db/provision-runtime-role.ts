import type { Pool } from 'pg';

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export async function provisionRuntimeDatabaseRole(
  pool: Pick<Pool, 'query'>,
  roleName: string,
  password: string,
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(roleName)) {
    throw new Error('APP_DATABASE_USER must be a valid PostgreSQL role name.');
  }
  if (password.length < 32) throw new Error('APP_DATABASE_PASSWORD must contain at least 32 characters.');

  const [{ rows: identityRows }, { rows: existingRoleRows }] = await Promise.all([
    pool.query('SELECT current_user AS role_name, current_database() AS database_name'),
    pool.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [roleName]),
  ]);
  const migrationRole = String(identityRows[0]?.role_name ?? '');
  const databaseName = String(identityRows[0]?.database_name ?? '');
  if (!migrationRole || !databaseName) throw new Error('Unable to identify migration database role.');
  if (migrationRole === roleName) throw new Error('Migration role and runtime role must be different.');

  const runtimeIdentifier = quoteIdentifier(roleName);
  const passwordLiteral = quoteLiteral(password);
  const roleStatement = existingRoleRows.length
    ? `ALTER ROLE ${runtimeIdentifier} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${passwordLiteral}`
    : `CREATE ROLE ${runtimeIdentifier} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${passwordLiteral}`;
  await pool.query(roleStatement);

  const databaseIdentifier = quoteIdentifier(databaseName);
  const migrationIdentifier = quoteIdentifier(migrationRole);
  await pool.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${databaseIdentifier} TO ${runtimeIdentifier}`);
  await pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${runtimeIdentifier}`);
  await pool.query(`REVOKE CREATE ON SCHEMA public FROM ${runtimeIdentifier}`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtimeIdentifier}`);
  await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${runtimeIdentifier}`);
  await pool.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrationIdentifier} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtimeIdentifier}`,
  );
  await pool.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${migrationIdentifier} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${runtimeIdentifier}`,
  );
}
