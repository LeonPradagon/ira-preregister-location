export interface ListCursor {
  value: string;
  id: string;
}

export interface CustomerNameCursor {
  name: string;
  id: string;
}

export interface CoverageCandidateCursor {
  priority: number;
  locationVerifiedAt: string | null;
  id: string;
}

export const encodeListCursor = (value: Date | string, id: string) =>
  Buffer.from(JSON.stringify({ value: value instanceof Date ? value.toISOString() : value, id }), 'utf8').toString(
    'base64url',
  );

export const decodeListCursor = (cursor?: string | null): ListCursor | null => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ListCursor>;
    return typeof decoded.value === 'string' &&
      Number.isFinite(Date.parse(decoded.value)) &&
      typeof decoded.id === 'string' &&
      decoded.id.length <= 128
      ? (decoded as ListCursor)
      : null;
  } catch {
    return null;
  }
};

export const encodeCustomerNameCursor = (name: string, id: string) =>
  Buffer.from(JSON.stringify({ name, id }), 'utf8').toString('base64url');

export const decodeCustomerNameCursor = (cursor?: string | null): CustomerNameCursor | null => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CustomerNameCursor>;
    return typeof decoded.name === 'string' &&
      decoded.name.length <= 255 &&
      typeof decoded.id === 'string' &&
      decoded.id.length <= 128
      ? (decoded as CustomerNameCursor)
      : null;
  } catch {
    return null;
  }
};

export const encodeCoverageCandidateCursor = (priority: number, locationVerifiedAt: Date | null, id: string) =>
  Buffer.from(
    JSON.stringify({ priority, locationVerifiedAt: locationVerifiedAt?.toISOString() ?? null, id }),
    'utf8',
  ).toString('base64url');

export const decodeCoverageCandidateCursor = (cursor?: string | null): CoverageCandidateCursor | null => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CoverageCandidateCursor>;
    return Number.isInteger(decoded.priority) &&
      decoded.priority! >= 0 &&
      decoded.priority! <= 4 &&
      (decoded.locationVerifiedAt === null ||
        (typeof decoded.locationVerifiedAt === 'string' && Number.isFinite(Date.parse(decoded.locationVerifiedAt)))) &&
      typeof decoded.id === 'string' &&
      decoded.id.length <= 128
      ? (decoded as CoverageCandidateCursor)
      : null;
  } catch {
    return null;
  }
};
