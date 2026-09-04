export interface ListCursor {
  value: string;
  id: string;
}

export const encodeListCursor = (value: Date | string, id: string) => Buffer.from(JSON.stringify({ value: value instanceof Date ? value.toISOString() : value, id }), 'utf8').toString('base64url');

export const decodeListCursor = (cursor?: string | null): ListCursor | null => {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ListCursor>;
    return typeof decoded.value === 'string' && Number.isFinite(Date.parse(decoded.value)) && typeof decoded.id === 'string' && decoded.id.length <= 128 ? decoded as ListCursor : null;
  } catch { return null; }
};
