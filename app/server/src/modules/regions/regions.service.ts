import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { administrativeRegions, regionPostalCodes } from '../../db/schema/index.js';

export interface RegionOption {
  code: string;
  name: string;
  postalCode?: string | null;
}

type RegionPayload = { data?: Array<{ code?: unknown; name?: unknown }> };

@Injectable()
export class RegionsService {
  private readonly baseUrl = 'https://wilayah.web.id/api';
  private readonly cache = new Map<string, { expiresAt: number; data: RegionOption[] }>();

  private async listLocal(level: number, parentCode?: string): Promise<RegionOption[] | null> {
    try {
      const regions = await db.select({ code: administrativeRegions.code, name: administrativeRegions.name })
        .from(administrativeRegions)
        .where(parentCode ? and(eq(administrativeRegions.level, level), eq(administrativeRegions.parentCode, parentCode)) : and(eq(administrativeRegions.level, level), isNull(administrativeRegions.parentCode)))
        .orderBy(administrativeRegions.name);
      if (!regions.length) return [];
      if (level !== 4) return regions;
      const postalRows = await db.select().from(regionPostalCodes).where(inArray(regionPostalCodes.regionCode, regions.map((region) => region.code)));
      const postalByCode = new Map(postalRows.map((row) => [row.regionCode, row.postalCode]));
      return regions.map((region) => ({ ...region, postalCode: postalByCode.get(region.code) ?? null }));
    } catch {
      return null;
    }
  }

  private async list(path: string, level: number, parentCode?: string): Promise<RegionOption[]> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const local = await this.listLocal(level, parentCode);
    if (local?.length) {
      this.cache.set(path, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, data: local });
      return local;
    }
    try {
      const response = await fetch(`${this.baseUrl}/${path}?limit=1000`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Region provider returned ${response.status}`);
      const payload = await response.json() as RegionPayload;
      const data = Array.isArray(payload.data)
        ? payload.data
          .filter((item) => typeof item.code === 'string' && typeof item.name === 'string')
          .map((item) => ({ code: item.code as string, name: item.name as string }))
        : [];
      this.cache.set(path, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, data });
      return data;
    } catch {
      throw new ServiceUnavailableException('Data wilayah sedang tidak tersedia');
    }
  }

  provinces() { return this.list('provinces', 1); }
  regencies(provinceCode: string) { return this.list(`regencies/${encodeURIComponent(provinceCode)}`, 2, provinceCode); }
  districts(regencyCode: string) { return this.list(`districts/${encodeURIComponent(regencyCode)}`, 3, regencyCode); }
  villages(districtCode: string) { return this.list(`villages/${encodeURIComponent(districtCode)}`, 4, districtCode); }
}
