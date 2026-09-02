import { randomUUID } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customerAddresses, customers, integrationOutbox, locationCaptures, reminders, validationResults, verificationSessions, auditLogs } from '../../db/schema/index.js';
import { AddressChangeInput, AddressLookupInput, GpsSample, PublicVerificationContext } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { GeocodingPort, GeocodingResult } from '../../integrations/geocoding/geocoding.port.js';
import { decideValidation, AddressEvidence, ReverseGeocodeEvidence } from '../validation/engine.js';
import { assertTransition } from './state-machine.js';
import { isReminderScheduledBeforeSessionExpiry, nextReminderNumber, ReminderPreference, scheduleReminderInTimezone, spreadReminderTimes } from '../reminders/reminder.policy.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { parseVerificationToken, verifyVerificationToken } from './verification-token.js';
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
    const parsed = parseVerificationToken(token);
    if (!parsed) throw new NotFoundError('Verification link is invalid or expired');
    const [row] = await db
      .select({
        session: verificationSessions,
        customer: customers,
        address: customerAddresses,
        reminder: reminders,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .leftJoin(reminders, eq(reminders.tokenId, verificationSessions.tokenId))
      .where(and(
        eq(verificationSessions.tokenId, parsed.tokenId),
        isNull(verificationSessions.revokedAt),
        gt(verificationSessions.expiresAt, now()),
        isNull(reminders.tokenInvalidatedAt),
        or(isNull(reminders.tokenExpiresAt), gt(reminders.tokenExpiresAt, now())),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Verification link is invalid or expired');
    if (!row.session.tokenHash || !(await verifyVerificationToken(token, row.session.tokenHash))) throw new NotFoundError('Verification link is invalid or expired');
    return row;
  }

  async open(token: string): Promise<PublicVerificationContext> {
    const row = await this.findByToken(token);
    if (!row.session.openedAt) {
      const timestamp = now();
      await db.transaction(async (tx) => {
        await tx.update(verificationSessions).set({ openedAt: timestamp, verificationStatus: 'LINK_OPENED', updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
        await tx.insert(auditLogs).values({ actorUserId: 'customer-token', actorName: 'Customer', action: 'LINK_OPENED', entityType: 'VERIFICATION_SESSION', entityId: row.session.id, before: { status: row.session.verificationStatus }, after: { status: 'LINK_OPENED' }, timestamp });
      });
    }
    return {
      session: {
        id: row.session.id,
        status: row.session.openedAt ? row.session.verificationStatus : 'LINK_OPENED',
        expiresAt: row.session.expiresAt.toISOString(),
        linkExpiresAt: row.reminder?.tokenExpiresAt?.toISOString() ?? row.session.expiresAt.toISOString(),
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
    const timestamp = now();
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({ consentAt: timestamp, verificationStatus: 'GPS_CAPTURING', updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({ actorUserId: 'customer-token', actorName: 'Customer', action: 'CONSENT_GIVEN', entityType: 'VERIFICATION_SESSION', entityId: row.session.id, before: { status: row.session.verificationStatus }, after: { status: 'GPS_CAPTURING' }, timestamp });
    });
    return { status: 'GPS_CAPTURING' };
  }

  async submitLocation(token: string, samples: GpsSample[]) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    if (row.session.customerConfirmationStatus !== 'CONFIRMED' || !row.session.consentAt) throw new DomainError('Confirmation and consent are required before location capture');
    if (row.session.attemptCount >= config.MAX_LOCATION_ATTEMPTS) throw new DomainError('Maximum GPS attempts reached', 409, 'ATTEMPT_LIMIT_REACHED');
    const bestSample = [...samples].sort((left, right) => left.accuracyMeters - right.accuracyMeters)[0];
    let geocode: ReverseGeocodeEvidence;
    let geocodingAvailable = true;
    try {
      geocode = await this.geocoding.reverse(bestSample.latitude, bestSample.longitude);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      if (row.session.verificationMode === 'SIMULATION') {
        // E2E simulation still exercises the real GPS/radius/accuracy pipeline
        // when no external reverse-geocoding provider is configured.
        geocode = {
          province: row.address.province,
          city: row.address.city,
          district: row.address.district,
          subdistrict: row.address.subdistrict,
          street: row.address.street,
          houseNumber: row.address.houseNumber,
          postalCode: row.address.postalCode,
          formattedAddress: row.address.rawAddress,
        };
      } else {
        // Live sessions fail closed: capture the GPS but route it to manual
        // review instead of returning 503 or treating it as address proof.
        geocodingAvailable = false;
        geocode = { province: '', city: '', district: '', subdistrict: '', street: '', formattedAddress: '' };
      }
    }
    const decision = decideValidation(samples, {
      id: row.address.id, province: row.address.province, city: row.address.city, district: row.address.district,
      subdistrict: row.address.subdistrict, street: row.address.street, houseNumber: row.address.houseNumber, postalCode: row.address.postalCode,
      referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude), referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude),
      referencePrecision: row.address.referencePrecision as AddressEvidence['referencePrecision'],
    }, geocode, {
      gpsMaxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS,
      homeRadiusMeters: config.HOME_RADIUS_METERS,
      streetMatchThreshold: config.STREET_MATCH_THRESHOLD,
      addressScoreThreshold: config.ADDRESS_SCORE_THRESHOLD,
    });
    if (!geocodingAvailable) {
      decision.result = 'MANUAL_REVIEW';
      decision.reasonCodes = [...decision.reasonCodes, 'GEOCODING_UNAVAILABLE', 'MANUAL_REVIEW_REQUIRED'];
    }
    if (decision.result === 'LOCATION_VALID' && config.ENABLE_MANUAL_REVIEW) {
      // A passing engine result is evidence for Ops, not the final customer
      // decision. Address/customer records change only after reviewer approval.
      decision.result = 'MANUAL_REVIEW';
      decision.reasonCodes = [
        ...decision.reasonCodes.filter((reasonCode) => reasonCode !== 'LOCATION_VALID'),
        'AUTOMATED_VALIDATION_PASSED',
        'MANUAL_REVIEW_REQUIRED',
      ];
    }
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
        distanceToReferenceMeters: decision.distanceFromReferenceMeters == null ? null : decision.distanceFromReferenceMeters.toFixed(2), addressScore: decision.addressScore.toFixed(3),
        result: decision.result, reasonCodes: decision.reasonCodes, reverseGeocode: decision.reverseGeocode,
        referencePrecision: decision.referencePrecision, engineVersion: '1.1.0', configVersion: 'env',
        capturedLatitude: decision.bestSample.latitude.toFixed(7), capturedLongitude: decision.bestSample.longitude.toFixed(7),
        referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude).toFixed(7), referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude).toFixed(7), createdAt: timestamp,
      });
      await tx.update(verificationSessions).set({
        attemptCount: row.session.attemptCount + 1, verificationStatus: nextStatus,
        locationVerifiedAt: decision.result === 'LOCATION_VALID' ? timestamp : null,
        completedAt: decision.result === 'LOCATION_VALID' ? timestamp : null, updatedAt: timestamp,
      }).where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Validation Engine', action: 'LOCATION_VALIDATION_COMPLETED', entityType: 'VALIDATION', entityId: resultId, after: { result: decision.result, reasonCodes: decision.reasonCodes, accuracyMeters: decision.bestSample.accuracyMeters, distanceMeters: decision.distanceFromReferenceMeters, addressScore: decision.addressScore }, timestamp });
      if (decision.result === 'LOW_GPS_ACCURACY') await tx.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Validation Engine', action: 'GPS_ACCURACY_REJECTED', entityType: 'VALIDATION', entityId: resultId, after: { accuracyMeters: decision.bestSample.accuracyMeters, threshold: config.GPS_MAX_ACCURACY_METERS }, timestamp });
      if (decision.result === 'LOCATION_MISMATCH') await tx.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Validation Engine', action: 'HOME_VALIDATION_FAILED', entityType: 'VALIDATION', entityId: resultId, after: { distanceMeters: decision.distanceFromReferenceMeters, radiusMeters: config.HOME_RADIUS_METERS, reasonCodes: decision.reasonCodes }, timestamp });
      if (decision.result === 'LOCATION_VALID') {
        await tx.update(customerAddresses).set({ addressStatus: 'SUPERSEDED', addressType: 'HISTORICAL', isActive: false, validTo: timestamp, updatedAt: timestamp }).where(and(eq(customerAddresses.customerId, row.customer.id), eq(customerAddresses.isActive, true), ne(customerAddresses.id, row.address.id)));
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

  async waitForHome(token: string, preference?: ReminderPreference, scheduledAtInput?: string, reminderUntilAtInput?: string) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    const max = config.MAX_REMINDERS_PER_SESSION;
    if (!config.ENABLE_REMINDERS || row.session.reminderCount >= max) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    const reminderNumber = nextReminderNumber(row.session.reminderCount, max);
    if (!reminderNumber) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    const currentTime = now();
    const scheduledAt = scheduledAtInput ? new Date(scheduledAtInput) : scheduleReminderInTimezone(preference ?? 'DEFAULT', currentTime, process.env.REMINDER_TIMEZONE ?? 'Asia/Jakarta');
    const reminderUntilAt = reminderUntilAtInput ? new Date(reminderUntilAtInput) : null;
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= currentTime) throw new DomainError('Reminder time must be in the future', 422, 'REMINDER_TIME_INVALID');
    if (!reminderUntilAt || Number.isNaN(reminderUntilAt.getTime()) || reminderUntilAt <= scheduledAt) throw new DomainError('Reminder end time must be after the first reminder', 422, 'REMINDER_RANGE_INVALID');
    if (!isReminderScheduledBeforeSessionExpiry(scheduledAt, row.session.expiresAt)) throw new DomainError('Reminder time must be before the verification session expires', 422, 'REMINDER_TIME_EXCEEDS_SESSION');
    if (!isReminderScheduledBeforeSessionExpiry(reminderUntilAt, row.session.expiresAt)) throw new DomainError('Reminder end time must be before the verification session expires', 422, 'REMINDER_TIME_EXCEEDS_SESSION');
    const reminderTimes = spreadReminderTimes(scheduledAt, reminderUntilAt, max - row.session.reminderCount);
    const finalReminderNumber = row.session.reminderCount + reminderTimes.length;
    const nextStatus = finalReminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      const timestamp = now();
      await tx.insert(reminders).values(reminderTimes.map((time, index) => {
        const reminderNumber = row.session.reminderCount + index + 1;
        return { id: randomUUID(), sessionId: row.session.id, reminderNumber, channel: 'WHATSAPP', scheduledAt: time, status: 'SCHEDULED', messageText: `Halo ${row.customer.name}, pengingat ${reminderNumber} dari ${max}. Tautan baru berlaku maksimal ${config.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`, retryCount: 0, createdAt: timestamp };
      }));
      await tx.update(verificationSessions).set({ reminderCount: finalReminderNumber, verificationStatus: nextStatus, updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({ actorUserId: 'customer-token', actorName: 'Customer', action: 'WAITING_FOR_HOME_SELECTED', entityType: 'VERIFICATION_SESSION', entityId: row.session.id, after: { preference: preference ?? 'CUSTOM', reminderCount: finalReminderNumber, scheduledAt: scheduledAt.toISOString(), reminderUntilAt: reminderUntilAt.toISOString() }, timestamp });
      await tx.insert(auditLogs).values(reminderTimes.map((time, index) => ({ actorUserId: 'system', actorName: 'Reminder Scheduler', action: 'REMINDER_SCHEDULED', entityType: 'REMINDER', entityId: row.session.id, after: { reminderNumber: row.session.reminderCount + index + 1, scheduledAt: time.toISOString(), reminderUntilAt: reminderUntilAt.toISOString() }, timestamp })));
    });
    return { status: nextStatus, reminderNumber: finalReminderNumber, reminderCount: finalReminderNumber, scheduledAt: scheduledAt.toISOString(), reminderUntilAt: reminderUntilAt.toISOString() };
  }

  async addressStatus(token: string, sameAddress: boolean) {
    const row = await this.findByToken(token);
    const nextStatus = sameAddress ? 'GPS_CAPTURING' : 'ADDRESS_EDITING';
    if (!row.session.consentAt) throw new DomainError('Location consent is required before confirming the address', 409, 'CONSENT_REQUIRED');
    assertTransition(row.session.verificationStatus, nextStatus);
    const timestamp = now();
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({ verificationStatus: nextStatus, updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
      if (!sameAddress) await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token', actorName: 'Customer', action: sameAddress ? 'ADDRESS_CONFIRMED_CURRENT' : 'ADDRESS_CHANGE_STARTED',
        entityType: 'VERIFICATION_SESSION', entityId: row.session.id,
        before: { status: row.session.verificationStatus, addressId: row.address.id },
        after: { status: nextStatus, sameAddress }, timestamp,
      });
    });
    return { status: nextStatus, sameAddress };
  }

  async changeAddress(token: string, input: AddressChangeInput) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    if (!config.ENABLE_ADDRESS_EDIT) throw new DomainError('Address edit is disabled', 409);
    if (row.session.verificationStatus !== 'ADDRESS_EDITING') assertTransition(row.session.verificationStatus, 'ADDRESS_EDITING');
    assertTransition('ADDRESS_EDITING', 'ADDRESS_PROPOSED');
    const houseNumber = input.houseNumber.trim();
    let geocode: GeocodingResult | null = null;
    try {
      geocode = await this.geocoding.forward(input);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
    }
    const timestamp = now();
    const addressId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({ actorUserId: 'customer-token', actorName: 'Customer', action: 'ADDRESS_CHANGE_STARTED', entityType: 'VERIFICATION_SESSION', entityId: row.session.id, before: { addressId: row.address.id, status: row.session.verificationStatus }, after: { status: 'ADDRESS_EDITING' }, timestamp });
      await tx.update(customerAddresses).set({ addressStatus: 'SUPERSEDED', isActive: false, validTo: timestamp, updatedAt: timestamp }).where(and(eq(customerAddresses.customerId, row.customer.id), eq(customerAddresses.addressType, 'PROPOSED'), eq(customerAddresses.isActive, true)));
      await tx.insert(customerAddresses).values({ ...input, houseNumber, id: addressId, customerId: row.customer.id, addressType: 'PROPOSED', addressStatus: 'PROPOSED', rawAddress: [input.street, `No. ${houseNumber}`, input.block && `Blok ${input.block}`, input.addressDetail, input.landmark && `Patokan: ${input.landmark}`, input.subdistrict, input.district, input.city, input.province, input.postalCode].filter(Boolean).join(', '), referenceLocation: geocode ? { latitude: geocode.latitude, longitude: geocode.longitude } : null, referenceSource: geocode ? 'GEOCODED' : 'CUSTOMER_PROPOSED', referencePrecision: geocode?.precision ?? 'UNKNOWN', referenceConfidence: geocode?.confidence.toFixed(3) ?? '0.000', geocodingProvider: geocode?.provider ?? null, providerPlaceId: geocode?.providerPlaceId ?? null, geocodedAt: geocode ? timestamp : null, isActive: true, isVerified: false, validFrom: timestamp, createdAt: timestamp, updatedAt: timestamp });
      await tx.update(verificationSessions).set({ currentAddressId: addressId, verificationStatus: 'ADDRESS_PROPOSED', updatedAt: timestamp }).where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({ actorUserId: 'customer-token', actorName: 'Customer', action: 'ADDRESS_PROPOSED', entityType: 'ADDRESS', entityId: addressId, after: { sessionId: row.session.id, status: 'PROPOSED' }, timestamp });
    });
    return { id: addressId, status: 'PROPOSED' };
  }

  async lookupAddress(token: string, input: AddressLookupInput) {
    await this.findByToken(token);
    const result = await this.geocoding.forward(input);
    return { postalCode: result.postalCode ?? null, formattedAddress: result.formattedAddress };
  }
}
