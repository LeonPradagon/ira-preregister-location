export const logEvent = (level: 'info' | 'error', event: string, fields: Record<string, unknown> = {}) => {
  const payload = { timestamp: new Date().toISOString(), level, event, ...fields };
  (level === 'error' ? console.error : console.info)(JSON.stringify(payload));
};
