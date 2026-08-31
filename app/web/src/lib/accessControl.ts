import { AdminRole } from '../types';

export type AdminCapability =
  | 'manageCustomers'
  | 'createVerification'
  | 'sendVerification'
  | 'manualReview'
  | 'changeValidationConfig'
  | 'view';

const CAPABILITIES: Record<AdminCapability, readonly AdminRole[]> = {
  manageCustomers: ['SUPER_ADMIN', 'ADMIN'],
  view: ['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER'],
  createVerification: ['SUPER_ADMIN', 'ADMIN'],
  sendVerification: ['SUPER_ADMIN', 'ADMIN'],
  manualReview: ['SUPER_ADMIN', 'ADMIN', 'REVIEWER'],
  changeValidationConfig: ['SUPER_ADMIN'],
};

export function hasCapability(role: AdminRole | undefined, capability: AdminCapability): boolean {
  return !!role && CAPABILITIES[capability].includes(role);
}

export function assertCapability(role: AdminRole | undefined, capability: AdminCapability): void {
  if (!hasCapability(role, capability)) {
    throw new Error(`Role tidak memiliki izin: ${capability}`);
  }
}
