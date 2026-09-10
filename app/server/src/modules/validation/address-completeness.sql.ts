import { sql, type SQL } from 'drizzle-orm';

const allowedAliases = new Set(['campaign_address']);
const requiredColumns = ['province', 'city', 'district', 'subdistrict', 'street'];
const placeholderValues = "('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')";

/**
 * SQL counterpart of isAddressIncomplete() for paginated customer/campaign queries.
 * The alias is deliberately allow-listed because it is interpolated as an identifier.
 */
export const incompleteAddressSql = (alias: string): SQL => {
  if (!allowedAliases.has(alias)) throw new Error(`Unsupported address SQL alias: ${alias}`);
  const missingOrPlaceholder = requiredColumns
    .map(
      (column) =>
        `NULLIF(BTRIM(${alias}.${column}), '') IS NULL OR LOWER(BTRIM(${alias}.${column})) IN ${placeholderValues}`,
    )
    .join(' OR ');
  const plusCode = `LOWER(BTRIM(${alias}.street)) ~ '^[23456789cfghjmpqrvwx]{4,8}\\+[23456789cfghjmpqrvwx]{2,4}$'`;
  return sql.raw(`(${missingOrPlaceholder} OR ${plusCode})`);
};

/**
 * A customer also needs a location verification campaign when the address is
 * complete but the admin has not supplied a reference coordinate yet.
 */
export const campaignEligibleAddressSql = (alias: string): SQL => {
  if (!allowedAliases.has(alias)) throw new Error(`Unsupported address SQL alias: ${alias}`);
  return sql`(${incompleteAddressSql(alias)} OR ${sql.raw(`${alias}.reference_location IS NULL`)})`;
};
