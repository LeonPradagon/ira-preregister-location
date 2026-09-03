const compactRegionName = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const displayProvinceName = (value: string): string => {
  const name = compactRegionName(value);
  return /^(?:daerah khusus ibukota|dki) jakarta$/i.test(name) ? 'DKI Jakarta' : name;
};
