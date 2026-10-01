import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { provisionRuntimeDatabaseRole } from '../../src/db/provision-runtime-role.js';

const makePool = (existingRole = false) => {
  const statements: string[] = [];
  const query = vi.fn(async (statement: string) => {
    statements.push(statement);
    if (statement.startsWith('SELECT current_user')) {
      return { rows: [{ role_name: 'ira_preregist_owner', database_name: 'ira_preregist' }] };
    }
    if (statement.startsWith('SELECT 1 FROM pg_catalog.pg_roles')) {
      return { rows: existingRole ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pick<Pool, 'query'>, statements, query };
};

const rolePassword = 'a'.repeat(64);

describe('runtime database role provisioning', () => {
  it('creates a non-superuser role with only application DML and temp-table grants', async () => {
    const { pool, statements } = makePool();

    await provisionRuntimeDatabaseRole(pool, 'ira_preregist_app', rolePassword);

    expect(statements[2]).toContain('CREATE ROLE "ira_preregist_app"');
    expect(statements[2]).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
    expect(statements).toContain('GRANT CONNECT, TEMPORARY ON DATABASE "ira_preregist" TO "ira_preregist_app"');
    expect(statements.some((statement) => statement.includes('GRANT CREATE'))).toBe(false);
    expect(statements.some((statement) => statement.includes('ALTER DEFAULT PRIVILEGES'))).toBe(true);
  });

  it('rotates password and reasserts non-superuser flags for existing application roles', async () => {
    const { pool, statements } = makePool(true);

    await provisionRuntimeDatabaseRole(pool, 'ira_preregist_app', rolePassword);

    expect(statements[2]).toContain('ALTER ROLE "ira_preregist_app"');
    expect(statements[2]).toContain('NOSUPERUSER');
  });

  it('rejects unsafe role names, short secrets, and reuse of the migration role', async () => {
    const { pool, query } = makePool();

    await expect(provisionRuntimeDatabaseRole(pool, 'app"; DROP ROLE owner;--', rolePassword)).rejects.toThrow(
      /valid PostgreSQL role name/i,
    );
    await expect(provisionRuntimeDatabaseRole(pool, 'app_user', 'short')).rejects.toThrow(/at least 32/i);
    await expect(provisionRuntimeDatabaseRole(pool, 'ira_preregist_owner', rolePassword)).rejects.toThrow(/must be different/i);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
