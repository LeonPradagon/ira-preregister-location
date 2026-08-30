export interface VerifiedLocationEvent {
  eventId: string;
  eventType: 'location.verified.v1';
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string;
  customer: { externalId: string; name?: string };
  verifiedAddress: { addressId: string; fullAddress?: string };
  verifiedLocation: { latitude: number; longitude: number; accuracyMeters: number; verifiedAt: string };
}

export interface IraCoveragePort {
  check(input: { latitude: number; longitude: number }): Promise<{ covered: boolean; status: string }>;
}

export interface TicketingPort {
  create(input: VerifiedLocationEvent): Promise<{ ticketId: string; status: string }>;
}

export class DisabledIraCoverageAdapter implements IraCoveragePort {
  async check(): Promise<{ covered: boolean; status: string }> {
    return { covered: false, status: 'DISABLED' };
  }
}

export class DisabledTicketingAdapter implements TicketingPort {
  async create(): Promise<{ ticketId: string; status: string }> {
    return { ticketId: '', status: 'DISABLED' };
  }
}
