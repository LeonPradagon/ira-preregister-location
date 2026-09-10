const houseNumberPattern = /\b(?:no|nomor)\.?\s*([0-9]+[a-z]?(?:[/-][a-z0-9]+)*)/i;
const apartmentContextPattern =
  /\b(?:apartemen|apartment|apart[e]?ment|rusun(?:awa)?|condominium|kondominium|residence|residensi|tower|gedung|flat)\b/i;

const extractHouseNumber = (address) => address.match(houseNumberPattern)?.[1] ?? null;

const plusCodePattern =
  /[23456789cfghjmpqrvwx]{4,8}\+(?:[23456789cfghjmpqrvwx]{3}\d|[23456789cfghjmpqrvwx]{4})(?=$|[\s,])|[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}/i;
const isPlusCode = (value) => Boolean(value?.trim() && plusCodePattern.test(value));
const removePlusCode = (value) => value.replace(plusCodePattern, ' ').replace(/\s+/g, ' ').trim();

const isAdministrativePart = (value) =>
  /^(rt\.?|rw\.?|kec\.?|kecamatan|kel\.?|kelurahan|desa|kab\.?|kabupaten|kota|jawa|indonesia)\b/i.test(
    value.trim(),
  );
const isStreetPrefixOnly = (value) => /^(jl\.?|jalan|jln\.?|gg\.?|gang|komplek|komp\.?)$/i.test(value.trim());
const explicitStreetPattern = /^(jl\.?|jalan|jln\.?|gg\.?|gang|komplek|komp\.?|kampung|kp\.?|dusun)\b/i;
const ruralLocalityPattern =
  /\b(?:kampung|kp\.?|dusun|blok|kav(?:ling)?|komplek|komp\.?|perumahan|lingkungan)\b[^,]*?(?=\s+(?:rt|rw|kec\.?|kecamatan|desa|kel\.?|kelurahan|kab\.?|kabupaten|kota|provinsi|jawa|indonesia)\b|,|$)/i;

const extractRuralLocality = (value) => value.match(ruralLocalityPattern)?.[0].trim() ?? null;

/**
 * Derive a usable street/locality for both formal urban and rural Indonesian
 * addresses. Rural addresses commonly identify a location by block, dusun,
 * kampung, kavling, or housing complex instead of a named street.
 */
export const streetFromAddress = (address) => {
  const parts = address
    .split(',')
    .map((part) => removePlusCode(part))
    .filter(Boolean);
  return (
    parts.find(
      (part) =>
        !isPlusCode(part) &&
        !isStreetPrefixOnly(part) &&
        explicitStreetPattern.test(part),
    ) ??
    parts.map(extractRuralLocality).find(Boolean) ??
    parts.find(
      (part) =>
        !isPlusCode(part) &&
        !isStreetPrefixOnly(part) &&
        !isAdministrativePart(part) &&
        !/^rt\.?\s*\d|^rw\.?\s*\d/i.test(part),
    ) ??
    'UNKNOWN'
  ).slice(0, 255);
};

/**
 * Derive a house number from the main address, with an apartment-aware
 * fallback for unit numbers stored in the landmark/address-reference field.
 */
export const houseNumberFromAddress = (address, addressReference = '') => {
  const directNumber = extractHouseNumber(address);
  if (directNumber) return directNumber;

  const combinedAddress = `${address} ${addressReference}`;
  if (!apartmentContextPattern.test(combinedAddress)) return 'UNKNOWN';
  return extractHouseNumber(addressReference) ?? 'UNKNOWN';
};
