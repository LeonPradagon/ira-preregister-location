import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customerAddresses, customers, integrationOutbox, locationCaptures, reminders, validationResults, verificationSessions, auditLogs } from '../../db/schema/index.js';
import { AddressChangeInput, GpsSample, PublicVerificationContext } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { GeocodingPort } from '../../integrations/geocoding/geocoding.port.js';
import { decideValidation, AddressEvidence } from '../validation/engine.js';
import { assertTransition } from './state-machine.js';
import { nextReminderNumber, ReminderPreference, scheduleReminder } from '../reminders/reminder.policy.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date();

function maskName(value: string): string {
  return value.split(/\s+/).map((part) => `${part.slice(0, 2)}${'*'.repeat(Math.max(2, part.length - 2))}`).join(' ');
}

function maskPhone(value: string): string {
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function maskAddress(address: { street: string; subdistrict: string; district: string; city: string; province: string }): string {
  return `${address.street} **, ${address.subdistrict}, ${address.district}, ${address.city}, ${address.province}`;
}

@Injectable()
export class VerificationService {
  constructor(
    @Inject(GeocodingPort) private readonly geocoding: GeocodingPort,
    private readonly validationConfig: ValidationConfigService,
  ) {}

  private async findByToken(token: string) {
    if (!token || token.length < 32) throw new NotFoundError('Verification link is invalid or expired');
    const [row] = await db
      .select({
        session: verificationSessions,
        customer: customers,
        address: customerAddresses,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(and(eq(verificationSessions.tokenHash, sha256(token)), isNull(verificationSessions.revokedAt), gt(verificationSessions.expiresAt, now())))
      .limit(1);
    if (!row) throw new NotFoundError('Verification link is invalid or expired');
    return row;
  }

  async open(token: string): Promise<PublicVerificationContext> {
    const row = await this.findByToken(token);
    if (!row.session.openedAt) {
      await db.update(verificationSessions).set({ openedAt: now(), verificationStatus: 'LINK_OPENED', updatedAt: now() }).where(eq(verificationSessions.id, row.session.id));
    }
    return {
      session: {
        id: row.session.id,
        status: row.session.openedAt ? row.session.verificationStatus : 'LINK_OPENED',
        expiresAt: row.session.expiresAt.toISOString(),
        customerConfirmationStatus: row.session.customerConfirmationStatus,
        reminderCount: row.session.reminderCount,
      },
      customer: { id: row.customer.id, name: maskName(row.customer.name), phoneE164: maskPhone(row.customer.phoneE164) },
      address: {
        id: row.address.id,
        rawAddress: maskAddress(row.address),
        province: row.address.province,
        city: row.address.city,
        district: row.address.district,
        subdistrict: row.address.subdistrict,
        street: `${row.address.street} **`,
        houseNumber: '**',
        referencePrecision: row.address.referencePrecision,
      },
    };
  }

  async confirm(token: string, confirmed: boolean) {
    const row = await this.findByToken(token);
    const timestamp = now();
    const nextStatus = confirmed ? 'CONSENTED' : 'CUSTOMER_DATA_MISMATCH';
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({
        customerConfirmationStatus: confirmed ? 'CONFIRMED' : 'MISMATCH',
        verificationStatus: nextStatus,
        customerConfirmedAt: timestamp,
        updatedAt: timestamp,
      }).where(eq(verificationSessions.id, row.session.id));
      if (!confirmed) {
        await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
      }
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token', actorName: 'Customer', action: confirmed ? 'CUSTOMER_CONFIRMED' : 'CUSTOMER_DATA_MISMATCH',
        entityType: 'VERIFICATION_SESSION', entityId: row.session.id, before: { status: row.session.verificationStatus }, after: { confirmed },
        reason: confirmed ? 'Customer confirmed masked data' : 'Customer reported data mismatch', timestamp,
      });
    });
    return { status: confirmed ? 'CONSENTED' : 'CUSTOMER_DATA_MISMATCH' };
  }

  async consent(token: string) {
    const row = await this.findByToken(token);
    if (row.session.customerConfirmationStatus !== 'CONFIRMED') throw new DomainError('Customer confirmation is required first');
    assertTransition(row.session.verificationStatus, 'GPS_CAPTURING');
    await db.update(verificationSessions).set({ consentAt: now(), verificationStatus: 'GPS_CAPTURING', updatedAt: now() }).where(eq(verificationSessions.id, row.session.id));
    return { status: 'GPS_CAPTURING' };
  }

  async submitLocation(token: string, samples: GpsSample[]) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    if (row.session.customerConfirmationStatus !== 'CONFIRMED' || !row.session.consentAt) throw new DomainError('Confirmation and consent are required before location capture');
    if (row.session.attemptCount >= config.MAX_LOCATION_ATTEMPTS) throw new DomainError('Maximum GPS attempts reached', 409, 'ATTEMPT_LIMIT_REACHED');
    const geocode = await this.geocoding.reverse(samples[0].latitude, samples[0].longitude);
    if (row.referenceLatitude == null || row.referenceLongitude == null) throw new DomainError('Reference location is not precise enough', 422, 'REFERENCE_LOCATION_NOT_PRECISE');
    const decision = decideValidation(samples, {
      id: row.address.id, province: row.address.province, city: row.address.city, district: row.address.district,
      subdistrict: row.address.subdistrict, street: row.address.street, houseNumber: row.address.houseNumber,
      referenceLatitude: Number(row.referenceLatitude), referenceLongitude: Number(row.referenceLongitude),
      referencePrecision: row.address.referencePrecision as AddressEvidence['referencePrecision'],
    }, geocode, {
      gpsMaxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS,
      homeRadiusMeters: config.HOME_RADIUS_METERS,
      streetMatchThreshold: config.STREET_MATCH_THRESHOLD,
      addressScoreThreshold: config.ADDRESS_SCORE_THRESHOLD,
    });
    const captureId = randomUUID();
    const resultId = randomUUID();
    const timestamp = now();
    const nextStatus = decision.result === 'LOCATION_VALID' ? 'LOCATION_VALID' : decision.result;
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx.insert(locationCaptures).values({
        id: captureId,
        sessionId: row.session.id,
        location: { latitude: decision.bestSample.latitude, longitude: decision.bestSample.longitude },
        latitude: decision.bestSample.latitude.toFixed(7), longitude: decision.bestSample.longitude.toFixed(7),
        accuracyMeters: decision.bestSample.accuracyMeters.toFixed(2), sampleCount: samples.length,
        bestAccuracyMeters: Math.min(...samples.map((sample) => sample.accuracyMeters)).toFixed(2), samples,
        deviceTimestamp: new Date(decision.bestSample.capturedAt), serverTimestamp: timestamp, createdAt: timestamp,
      });
      await tx.insert(validationResults).values({
        id: resultId, sessionId: row.session.id, captureId, addressId: row.address.id,
        provinceMatch: decision.provinceMatch, cityMatch: decision.cityMatch, districtMatch: decision.districtMatch,
        subdistrictMatch: decision.subdistrictMatch, streetScore: decision.streetScore.toFixed(3),
        houseNumberMatch: decision.houseNumberMatch, gpsAccuracyMeters: decision.bestSample.accuracyMeters.toFixed(2),
        distanceToReferenceMeters: decision.distanceFromReferenceMeters.toFixed(2), addressScore: decision.addressScore.toFixed(3),
        result: decision.result, reasonCodes: decision.reasonCodes, reverseGeocode: decision.reverseGeocode,
        referencePrecision: decision.referencePrecision, engineVersion: '1.0.0', configVersion: 'env',
        capturedLatitude: decision.bestSample.latitude.toFixed(7), capturedLongitude: decision.bestSample.longitude.toFixed(7),
        referenceLatitude: Number(row.referenceLatitude).toFixed(7), referenceLongitude: Number(row.referenceLongitude).toFixed(7), createdAt: timestamp,
      });
      await tx.update(verificationSessions).set({
        attemptCount: row.session.attemptCount + 1, verificationStatus: nextStatus,
        locationVerifiedAt: decision.result === 'LOCATION_VALID' ? timestamp : null,
        completedAt: decision.result === 'LOCATION_VALID' ? timestamp : null, updatedAt: timestamp,
      }).where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Validation Engine', action: 'LOCATION_VALIDATION_COMPLETED', entityType: 'VALIDATION', entityId: resultId, after: decision, timestamp });
      if (decision.result === 'LOCATION_VALID') {
        await tx.update(customerAddresses).set({ isVerified: true, addressStatus: 'VERIFIED', addressType: 'VERIFIED_INSTALLATION', updatedAt: timestamp }).where(eq(customerAddresses.id, row.address.id));
        await tx.update(customers).set({ status: 'VERIFIED', updatedAt: timestamp }).where(eq(customers.id, row.customer.id));
        await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
        const eventId = randomUUID();
        await tx.insert(integrationOutbox).values({
          id: randomUUID(), eventId, eventType: 'location.verified.v1', aggregateType: 'VERIFICATION_SESSION', aggregateId: row.session.id,
          correlationId: row.session.id, idempotencyKey: `location-verified:${row.session.id}`,
          payload: { eventId, eventType: 'location.verified.v1', occurredAt: timestamp.toISOString(), correlationId: row.session.id, idempotencyKey: `location-verified:${row.session.id}`, customer: { externalId: row.customer.externalId, name: row.customer.name }, verifiedAddress: { addressId: row.address.id, fullAddress: row.address.rawAddress }, verifiedLocation: { latitude: decision.bestSample.latitude, longitude: decision.bestSample.longitude, accuracyMeters: decision.bestSample.accuracyMeters, verifiedAt: timestamp.toISOString() } },
          status: 'PENDING', attemptCount: 0, createdAt: timestamp, updatedAt: timestamp,
        }).onConflictDoNothing({ target: integrationOutbox.idempotencyKey });
      }
    });
    return { id: resultId, ...decision, capturedLocation: { ...decision.bestSample, coordinateText: `${decision.bestSample.latitude.toFixed(6)}, ${decision.bestSample.longitude.toFixed(6)}`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${decision.bestSample.latitude},${decision.bestSample.longitude}` } };
  }

  async waitForHome(token: string, preference: ReminderPreference) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    const max = config.MAX_REMINDERS_PER_SESSION;
    if (!config.ENABLE_REMINDERS || row.session.reminderCount >= max) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    const reminderNumber = nextReminderNumber(row.session.reminderCount, max);
    if (!reminderNumber) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    const scheduledAt = scheduleReminder(preference);
    const nextStatus = reminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx.insert(reminders).values({ id: randomUUID(), sessionId: row.session.id, reminderNumber, channel: 'WHATSAPP', scheduledAt, status: 'SCHEDULED', messageText: `Verifikasi lokasi: ${process.env.WEB_ORIGIN}/v/${token}`, retryCount: 0, createdAt: now() });
      await tx.update(verificationSessions).set({ reminderCount: reminderNumber, verificationStatus: nextStatus, updatedAt: now() }).where(eq(verificationSessions.id, row.session.id));
    });
    return { status: reminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME', reminderNumber };
  }

  async changeAddress(token: string, input: AddressChangeInput) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    if (!config.ENABLE_ADDRESS_EDIT) throw new DomainError('Address edit is disabled', 409);
    if (row.session.verificationStatus !== 'ADDRESS_EDITING') assertTransition(row.session.verificationStatus, 'ADDRESS_EDITING');
    assertTransition('ADDRESS_EDITING', 'ADDRESS_PROPOSED');
    const geocode = await this.geocoding.forward(input);
    const timestamp = now();
    const addressId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.update(customerAddresses).set({ addressStatus: 'SUPERSEDED', isActive: false, validTo: timestamp, updatedAt: timestamp }).where(and(eq(customerAddresses.customerId, row.customer.id), eq(customerAddresses.addressType, 'PROPOSED'), eq(customerAddresses.isActive, true)));
      await tx.insert(customerAddresses).values({ ...input, id: addressId, customerId: row.customer.id, addressType: 'PROPOSED', addressStatus: 'PROPOSED', rawAddress: [input.street, `No. ${input.houseNumber}`, input.block && `Blok ${input.block}`, input.subdistrict, input.district, input.city, input.province, input.postalCode].filter(Boolean).join(', '), referenceLocation: { latitude: geocode.latitude, longitude: geocode.longitude }, referenceSource: 'GEOCODED', referencePrecision: geocode.precision, referenceConfidence: geocode.confidence.toFixed(3), geocodingProvider: geocode.provider, providerPlaceId: geocode.providerPlaceId, geocodedAt: timestamp, isActive: true, isVerified: false, validFrom: timestamp, createdAt: timestamp, updatedAt: timestamp });
      await tx.update(verificationSessions).set({ currentAddressId: addressId, verificationStatus: 'ADDRESS_PROPOSED', updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
    });
    return { id: addressId, status: 'PROPOSED' };
  }
}
