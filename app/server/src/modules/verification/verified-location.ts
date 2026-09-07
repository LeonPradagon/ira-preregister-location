export function buildVerifiedAddressReference(latitude: number, longitude: number) {
  return {
    referenceLocation: { latitude, longitude },
    referenceSource: 'MASTER_COORDINATE' as const,
    referencePrecision: 'HOUSE' as const,
    referenceConfidence: '0.980',
  };
}
