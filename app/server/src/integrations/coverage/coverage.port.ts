export type CoveragePoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type CoverageStatus = 'COVERED' | 'UNCOVERED';

export type CoverageResult = CoveragePoint & {
  status: CoverageStatus;
};

export abstract class CoveragePort {
  abstract checkCoverage(points: CoveragePoint[]): Promise<CoverageResult[]>;
}
