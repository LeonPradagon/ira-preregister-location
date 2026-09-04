export interface AutoApprovalPolicyInput {
  result: string;
  addressScore: number;
  customerConfirmationStatus: string;
  enableManualReview: boolean;
  enableAutoApproval: boolean;
  threshold: number;
}

/**
 * Manual review is the primary mode switch. When it is off, a valid,
 * customer-confirmed result can be approved automatically, but never below
 * the hard 90% score floor.
 */
export function shouldAutoApprove(input: AutoApprovalPolicyInput): boolean {
  return (!input.enableManualReview || input.enableAutoApproval)
    && input.customerConfirmationStatus === 'CONFIRMED'
    && input.result === 'LOCATION_VALID'
    && input.addressScore >= Math.max(0.9, input.threshold);
}
