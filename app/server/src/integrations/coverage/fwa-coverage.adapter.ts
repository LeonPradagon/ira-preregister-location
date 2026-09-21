import axios, { type AxiosRequestConfig } from 'axios';
import type { CoveragePort, CoveragePoint, CoverageResult } from './coverage.port.js';
import { normalizeCoverageStatus } from '../../modules/coverage/coverage.policy.js';

type FwaResponse = {
  id?: string | null;
  latitude?: number;
  longitude?: number;
  coverage_status?: string;
};

type FwaBatchResponse = { results?: FwaResponse[] };

export type CoverageHttpClient = {
  request<T = unknown>(config: AxiosRequestConfig): Promise<{ data: T }>;
};

const mapResult = (point: CoveragePoint, response: FwaResponse): CoverageResult => ({
  id: point.id,
  latitude: Number(response.latitude ?? point.latitude),
  longitude: Number(response.longitude ?? point.longitude),
  status: normalizeCoverageStatus(response.coverage_status),
});

export class FwaCoverageAdapter implements CoveragePort {
  constructor(
    private readonly client: CoverageHttpClient = axios,
    private readonly baseUrl = process.env.FWA_COVERAGE_BASE_URL ?? '',
    private readonly apiKey = process.env.FWA_COVERAGE_API_KEY ?? '',
    private readonly timeoutMs = Number(process.env.FWA_COVERAGE_TIMEOUT_MS ?? 10000),
  ) {}

  async checkCoverage(points: CoveragePoint[]): Promise<CoverageResult[]> {
    if (!points.length) return [];
    const config = {
      headers: { 'X-External-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      timeout: this.timeoutMs,
    };
    if (points.length === 1) {
      const point = points[0];
      const response = await this.client.request<FwaResponse>({
        method: 'POST',
        url: `${this.baseUrl}/api/v1/integrations/coverage/check`,
        data: point,
        ...config,
      });
      return [mapResult(point, response.data)];
    }

    const response = await this.client.request<FwaBatchResponse>({
      method: 'POST',
      url: `${this.baseUrl}/api/v1/integrations/coverage/check-batch`,
      data: { items: points },
      ...config,
    });
    const results = response.data.results ?? [];
    const resultById = new Map(results.filter((item) => item.id).map((item) => [item.id!, item]));
    return points.map((point, index) => mapResult(point, resultById.get(point.id) ?? results[index] ?? {}));
  }
}
