export interface CoordinateAuditCandidate {
  customerStatus: string | null | undefined;
  referenceSource: string | null | undefined;
  coordinateAuditStatus: string | null | undefined;
  hasReferenceLocation: boolean;
}

export const shouldAuditImportedCoordinate = (candidate: CoordinateAuditCandidate): boolean =>
  candidate.customerStatus !== 'VERIFIED' &&
  candidate.referenceSource === 'PREREG_IMPORT' &&
  candidate.coordinateAuditStatus === 'PENDING' &&
  candidate.hasReferenceLocation;

export const shouldAutoVerifyCoordinateAudit = (coordinateAuditStatus: string): boolean =>
  coordinateAuditStatus === 'MATCHED';
