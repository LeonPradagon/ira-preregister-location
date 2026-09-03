export type RegionOption = { code: string; name: string; postalCode?: string | null };

const canonicalRegionName = (value: string) => value.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').replace(/^daerah khusus ibukota jakarta$/, 'dki jakarta');

export const findRegionOption = (options: RegionOption[], value: string) =>
  options.find((option) => canonicalRegionName(option.name) === canonicalRegionName(value));

export const regionOptionValue = (option: RegionOption) => /^daerah khusus ibukota jakarta$/i.test(option.name.trim()) ? 'DKI Jakarta' : option.name.trim();
