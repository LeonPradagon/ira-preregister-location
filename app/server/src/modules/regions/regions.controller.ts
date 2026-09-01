import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { RegionsService } from './regions.service.js';

const regionCode = (value: string) => {
  if (!/^\d+(?:\.\d+)*$/.test(value)) throw new BadRequestException('Kode wilayah tidak valid');
  return value;
};

@Controller('public/regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get('provinces') provinces() { return this.regions.provinces(); }
  @Get('regencies/:provinceCode') regencies(@Param('provinceCode') provinceCode: string) { return this.regions.regencies(regionCode(provinceCode)); }
  @Get('districts/:regencyCode') districts(@Param('regencyCode') regencyCode: string) { return this.regions.districts(regionCode(regencyCode)); }
  @Get('villages/:districtCode') villages(@Param('districtCode') districtCode: string) { return this.regions.villages(regionCode(districtCode)); }
}
