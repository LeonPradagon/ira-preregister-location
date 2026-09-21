import type { CoverageResult, CoverageStatus } from '../../integrations/coverage/coverage.port.js';

export type CoverageEligibilityInput = {
  verificationStatus: string;
  addressVerified: boolean;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
};

export const isCoverageEligible = (input: CoverageEligibilityInput): boolean =>
  input.verificationStatus === 'LOCATION_VALID' &&
  input.addressVerified &&
  input.latitude != null &&
  input.longitude != null &&
  Number.isFinite(input.latitude) &&
  Number.isFinite(input.longitude);

export const normalizeCoverageStatus = (value: unknown): CoverageStatus => {
  if (value === 'COVERED' || value === 'UNCOVERED') return value;
  throw new Error(`Unsupported coverage status: ${String(value)}`);
};

export const isCoverageResult = (value: unknown): value is CoverageResult => {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<CoverageResult>;
  return (
    typeof result.id === 'string' &&
    typeof result.latitude === 'number' &&
    Number.isFinite(result.latitude) &&
    typeof result.longitude === 'number' &&
    Number.isFinite(result.longitude) &&
    (result.status === 'COVERED' || result.status === 'UNCOVERED')
  );
};
