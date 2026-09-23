import { sql, type SQL } from 'drizzle-orm';

type CoverageOwner = 'customer' | 'address' | 'session';
type CoverageField = 'status' | 'completed_at' | 'created_at';

export function latestFwaCoverageValue(owner: CoverageOwner, field: 'status'): SQL<string | null>;
export function latestFwaCoverageValue(owner: CoverageOwner, field: 'completed_at' | 'created_at'): SQL<Date | null>;
export function latestFwaCoverageValue(owner: CoverageOwner, field: CoverageField): SQL<string | Date | null> {
  const ownerId =
    owner === 'customer'
      ? sql.raw('"customers"."id"')
      : owner === 'address'
        ? sql.raw('"customer_addresses"."id"')
        : sql.raw('"verification_sessions"."id"');
  const ownerKey =
    owner === 'customer'
      ? sql.raw('customer_id')
      : owner === 'address'
        ? sql.raw('address_id')
        : sql.raw('verification_session_id');
  const selectedField = sql.raw(field);

  return sql<string | Date | null>`(
    select latest_check.${selectedField} from coverage_checks latest_check
    where latest_check.${ownerKey} = ${ownerId} and latest_check.provider_key = 'FWA'
    order by latest_check.created_at desc, latest_check.id desc limit 1
  )`;
}
