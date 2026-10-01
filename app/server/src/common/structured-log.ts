const sensitiveKey = /authorization|password|secret|token|api.?key|credential|cookie/i;
const sensitiveQueryParameter = /([?&](?:access[_-]?token|refresh[_-]?token|token|secret|password|api[_-]?key|key)=)[^&#\s]*/gi;
const verificationLinkPath = /(\/v1\/public\/verifications\/)[^/?\s]+/gi;
const bearerCredential = /\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi;

export function redactLogValue(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return value
      .replace(sensitiveQueryParameter, '$1[REDACTED]')
      .replace(verificationLinkPath, '$1[REDACTED]')
      .replace(bearerCredential, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactLogValue(childValue, childKey)]));
  }
  return value;
}

export const logEvent = (level: 'info' | 'error', event: string, fields: Record<string, unknown> = {}) => {
  const payload = redactLogValue({ timestamp: new Date().toISOString(), level, event, ...fields });
  (level === 'error' ? console.error : console.info)(JSON.stringify(payload));
};
