export function canReplaceAddress(addressType: string | null | undefined, addressIncomplete: boolean): boolean {
  const normalizedAddressType = String(addressType || '')
    .trim()
    .toUpperCase();
  return normalizedAddressType !== 'PROPOSED' || addressIncomplete;
}

export function requiresLocationConsentForAddressStatus(sameAddress: boolean): boolean {
  return sameAddress;
}
