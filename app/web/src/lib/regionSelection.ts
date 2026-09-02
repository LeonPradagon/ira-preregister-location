export type RegionOption = { code: string; name: string; postalCode?: string | null };

export const findRegionOption = (options: RegionOption[], value: string) =>
  options.find((option) => option.name.trim().toLowerCase() === value.trim().toLowerCase());

export const regionOptionValue = (option: RegionOption) => option.name.trim();
