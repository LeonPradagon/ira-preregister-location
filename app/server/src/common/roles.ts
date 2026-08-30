import { SetMetadata } from '@nestjs/common';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'VIEWER';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

export const CAPABILITIES = {
  createVerification: ['SUPER_ADMIN', 'ADMIN'],
  sendVerification: ['SUPER_ADMIN', 'ADMIN'],
  manualReview: ['SUPER_ADMIN', 'ADMIN', 'REVIEWER'],
  changeValidationConfig: ['SUPER_ADMIN'],
  view: ['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER'],
} as const;
