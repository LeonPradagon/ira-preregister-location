import { randomUUID } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  customerAddresses,
  customers,
  integrationOutbox,
  locationCaptures,
  reminders,
  validationResults,
  verificationSessions,
  auditLogs,
} from '../../db/schema/index.js';
import {
  AddressChangeInput,
  AddressLookupInput,
  GpsSample,
  PublicVerificationContext,
} from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { GeocodingPort, GeocodingResult } from '../../integrations/geocoding/geocoding.port.js';
import { decideValidation, AddressEvidence, ReverseGeocodeEvidence, isAddressIncomplete } from '../validation/engine.js';
import { assertTransition } from './state-machine.js';
import {
  isReminderScheduledBeforeSessionExpiry,
  isReminderLinkFirstOpen,
  isReusableCancelledReminder,
  canScheduleReminderFromLink,
  reminderCountAfterOpeningLink,
  nextReminderNumber,
  ReminderPreference,
  scheduleReminderInTimezone,
} from '../reminders/reminder.policy.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { parseVerificationToken, verifyVerificationToken } from './verification-token.js';
import { applyApprovalPolicy, getCoordinateMatchScore } from './approval-policy.js';
import { buildVerifiedAddressReference } from './verified-location.js';
import { canReplaceAddress, requiresLocationConsentForAddressStatus } from './address-change.policy.js';
const now = () => new Date();

function maskPhone(value: string): string {
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function assertAddressCorrectionComplete(address: Parameters<typeof isAddressIncomplete>[0]) {
  if (isAddressIncomplete(address))
    throw new DomainError(
      'Please correct the registered address before continuing the location verification.',
      409,
      'ADDRESS_CORRECTION_REQUIRED',
    );
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
      .where(
        and(
          eq(verificationSessions.tokenId, parsed.tokenId),
          isNull(verificationSessions.revokedAt),
          gt(verificationSessions.expiresAt, now()),
          isNull(reminders.tokenInvalidatedAt),
          or(isNull(reminders.tokenExpiresAt), gt(reminders.tokenExpiresAt, now())),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Verification link is invalid or expired');
    if (!row.session.tokenHash || !(await verifyVerificationToken(token, row.session.tokenHash)))
      throw new NotFoundError('Verification link is invalid or expired');
    return row;
  }

  async open(token: string): Promise<PublicVerificationContext> {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    const [lastValidation] = await db
      .select({
        result: validationResults.result,
        reasonCodes: validationResults.reasonCodes,
        provinceMatch: validationResults.provinceMatch,
        cityMatch: validationResults.cityMatch,
        districtMatch: validationResults.districtMatch,
        subdistrictMatch: validationResults.subdistrictMatch,
        streetScore: validationResults.streetScore,
        houseNumberMatch: validationResults.houseNumberMatch,
        reverseGeocode: validationResults.reverseGeocode,
      })
      .from(validationResults)
      .where(
        and(
          eq(validationResults.sessionId, row.session.id),
          eq(validationResults.addressId, row.address.id),
        ),
      )
      .orderBy(desc(validationResults.createdAt))
      .limit(1);
    const reminder = row.reminder;
    const firstReminderOpen = Boolean(reminder && isReminderLinkFirstOpen(reminder.openedAt));
    const effectiveReminderCount = firstReminderOpen
      ? reminderCountAfterOpeningLink(row.session.reminderCount, reminder!.reminderNumber)
      : row.session.reminderCount;
    const canScheduleReminder =
      !reminder || canScheduleReminderFromLink(effectiveReminderCount, reminder.reminderNumber);
    if (!row.session.openedAt || firstReminderOpen) {
      const timestamp = now();
      await db.transaction(async (tx) => {
        if (!row.session.openedAt) {
          await tx
            .update(verificationSessions)
            .set({ openedAt: timestamp, verificationStatus: 'LINK_OPENED', updatedAt: timestamp })
        .where(eq(verificationSessions.id, row.session.id));
            await tx.insert(auditLogs).values({
            actorUserId: 'customer-token',
            actorName: 'Customer',
            action: 'LINK_OPENED',
            entityType: 'VERIFICATION_SESSION',
            entityId: row.session.id,
            before: { status: row.session.verificationStatus },
            after: { status: 'LINK_OPENED' },
            timestamp,
          });
        }
        if (reminder && firstReminderOpen) {
          await tx
            .update(reminders)
            .set({ status: 'CANCELLED' })
            .where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
          await tx
            .update(reminders)
            .set({ openedAt: timestamp })
            .where(eq(reminders.id, reminder.id));
          await tx.insert(auditLogs).values({
            actorUserId: 'customer-token',
            actorName: 'Customer',
            action: 'REMINDER_LINK_OPENED',
            entityType: 'REMINDER',
            entityId: reminder.id,
            after: {
              reminderNumber: reminder.reminderNumber,
              futureRemindersCancelled: true,
              reminderCountBefore: row.session.reminderCount,
              reminderCountAfter: effectiveReminderCount,
            },
            timestamp,
          });
          if (row.session.attemptCount > 0 || row.session.reminderCount !== effectiveReminderCount) {
            await tx
              .update(verificationSessions)
              .set({
                attemptCount: 0,
                reminderCount: effectiveReminderCount,
                updatedAt: timestamp,
              })
              .where(eq(verificationSessions.id, row.session.id));
            await tx.insert(auditLogs).values({
              actorUserId: 'customer-token',
              actorName: 'Customer',
              action: 'GPS_ATTEMPT_WINDOW_RESET',
              entityType: 'VERIFICATION_SESSION',
              entityId: row.session.id,
              after: { reminderNumber: reminder.reminderNumber, attemptCount: 0 },
              timestamp,
            });
          }
        }
      });
    }
    return {
      session: {
        id: row.session.id,
        status: row.session.openedAt ? row.session.verificationStatus : 'LINK_OPENED',
        expiresAt: row.session.expiresAt.toISOString(),
        linkExpiresAt: row.reminder?.tokenExpiresAt?.toISOString() ?? row.session.expiresAt.toISOString(),
        customerConfirmationStatus: row.session.customerConfirmationStatus,
        reminderCount: effectiveReminderCount,
        attemptCount: row.reminder ? 0 : row.session.attemptCount,
        maxAttempts: Math.min(3, config.MAX_LOCATION_ATTEMPTS),
        maxReminders: config.MAX_REMINDERS_PER_SESSION,
        isReminderLink: Boolean(row.reminder),
        canScheduleReminder,
      },
      customer: { id: row.customer.id, name: row.customer.name, phoneE164: maskPhone(row.customer.phoneE164) },
      address: {
        id: row.address.id,
        addressType: row.address.addressType,
        rawAddress: row.address.rawAddress,
        province: row.address.province,
        city: row.address.city,
        district: row.address.district,
        subdistrict: row.address.subdistrict,
        postalCode: row.address.postalCode,
        street: row.address.street,
        houseNumber: row.address.houseNumber,
        rt: row.address.rt,
        rw: row.address.rw,
        building: row.address.building,
        block: row.address.block,
        unit: row.address.unit,
        addressDetail: row.address.addressDetail,
        landmark: row.address.landmark,
        referencePrecision: row.address.referencePrecision,
        requiresCorrection: isAddressIncomplete(row.address),
      },
      lastValidationResult: lastValidation
        ? {
            result: lastValidation.result,
            reasonCodes: Array.isArray(lastValidation.reasonCodes)
              ? lastValidation.reasonCodes.filter((code): code is string => typeof code === 'string')
              : [],
            provinceMatch: lastValidation.provinceMatch,
            cityMatch: lastValidation.cityMatch,
            districtMatch: lastValidation.districtMatch,
            subdistrictMatch: lastValidation.subdistrictMatch,
            streetScore: Number(lastValidation.streetScore),
            houseNumberMatch: lastValidation.houseNumberMatch,
            reverseGeocode: lastValidation.reverseGeocode as {
              province: string;
              city: string;
              district: string;
              subdistrict: string;
              street: string;
              houseNumber?: string;
              postalCode?: string;
              formattedAddress: string;
            },
          }
        : undefined,
    };
  }

  async confirm(token: string, confirmed: boolean) {
    const row = await this.findByToken(token);
    if (confirmed) assertAddressCorrectionComplete(row.address);
    const timestamp = now();
    const nextStatus = confirmed ? 'CONSENTED' : 'CUSTOMER_DATA_MISMATCH';
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx
        .update(verificationSessions)
        .set({
          customerConfirmationStatus: confirmed ? 'CONFIRMED' : 'MISMATCH',
          verificationStatus: nextStatus,
          customerConfirmedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(verificationSessions.id, row.session.id));
      if (!confirmed) {
        await tx
          .update(reminders)
          .set({ status: 'CANCELLED' })
          .where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
      }
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: confirmed ? 'CUSTOMER_CONFIRMED' : 'CUSTOMER_DATA_MISMATCH',
        entityType: 'VERIFICATION_SESSION',
        entityId: row.session.id,
        before: { status: row.session.verificationStatus },
        after: { confirmed },
        reason: confirmed ? 'Customer confirmed registered data' : 'Customer reported data mismatch',
        timestamp,
      });
    });
    return { status: confirmed ? 'CONSENTED' : 'CUSTOMER_DATA_MISMATCH' };
  }

  async consent(token: string) {
    const row = await this.findByToken(token);
    assertAddressCorrectionComplete(row.address);
    if (row.session.customerConfirmationStatus !== 'CONFIRMED')
      throw new DomainError('Customer confirmation is required first');
    assertTransition(row.session.verificationStatus, 'GPS_CAPTURING');
    const timestamp = now();
    await db.transaction(async (tx) => {
      await tx
        .update(verificationSessions)
        .set({ consentAt: timestamp, verificationStatus: 'GPS_CAPTURING', updatedAt: timestamp })
        .where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: 'CONSENT_GIVEN',
        entityType: 'VERIFICATION_SESSION',
        entityId: row.session.id,
        before: { status: row.session.verificationStatus },
        after: { status: 'GPS_CAPTURING' },
        timestamp,
      });
    });
    return { status: 'GPS_CAPTURING' };
  }

  async submitLocation(token: string, samples: GpsSample[]) {
    const row = await this.findByToken(token);
    assertAddressCorrectionComplete(row.address);
    const config = await this.validationConfig.get();
    if (row.session.customerConfirmationStatus !== 'CONFIRMED' || !row.session.consentAt)
      throw new DomainError('Confirmation and consent are required before location capture');
    const maxLocationAttempts = Math.min(3, config.MAX_LOCATION_ATTEMPTS);
    if (row.session.attemptCount >= maxLocationAttempts)
      throw new DomainError('Maximum GPS attempts reached. Please choose a reminder.', 409, 'ATTEMPT_LIMIT_REACHED');
    const bestSample = [...samples].sort((left, right) => left.accuracyMeters - right.accuracyMeters)[0];
    let geocode: ReverseGeocodeEvidence;
    let geocodingAvailable = true;
    try {
      geocode = await this.geocoding.reverse(bestSample.latitude, bestSample.longitude);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      if (row.session.verificationMode === 'SIMULATION') {
        // Never copy the master address into device data: the simulation
        // coordinate may intentionally be somewhere else. Treat unavailable
        // reverse-geocoding as unavailable evidence instead of a false match.
        geocodingAvailable = false;
        geocode = { province: '', city: '', district: '', subdistrict: '', street: '', formattedAddress: '' };
      } else {
        // Live sessions fail closed: capture the GPS but route it to manual
        // review instead of returning 503 or treating it as address proof.
        geocodingAvailable = false;
        geocode = { province: '', city: '', district: '', subdistrict: '', street: '', formattedAddress: '' };
      }
    }
    const decision = decideValidation(
      samples,
      {
        id: row.address.id,
        province: row.address.province,
        city: row.address.city,
        district: row.address.district,
        subdistrict: row.address.subdistrict,
        street: row.address.street,
        houseNumber: row.address.houseNumber,
        postalCode: row.address.postalCode,
        referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude),
        referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude),
        referencePrecision: row.address.referencePrecision as AddressEvidence['referencePrecision'],
      },
      geocode,
      {
        gpsMaxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS,
        homeRadiusMeters: config.HOME_RADIUS_METERS,
        streetMatchThreshold: config.STREET_MATCH_THRESHOLD,
        streetSoftMatchThreshold: config.STREET_SOFT_MATCH_THRESHOLD,
        addressScoreThreshold: config.ADDRESS_SCORE_THRESHOLD,
      },
    );
    const coordinateMatchScore = getCoordinateMatchScore({
      geocodingAvailable,
      referencePrecision: decision.referencePrecision,
      distanceFromReferenceMeters: decision.distanceFromReferenceMeters,
      homeRadiusMeters: config.HOME_RADIUS_METERS,
      gpsAccuracyMeters: decision.bestSample.accuracyMeters,
      gpsMaxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS,
      sampleSpreadMeters: decision.sampleSpreadMeters,
    });
    if (coordinateMatchScore >= 0.9) {
      decision.result = 'LOCATION_VALID';
      decision.addressScore = Math.max(decision.addressScore, coordinateMatchScore);
      decision.reasonCodes = ['COORDINATE_MATCHED', 'GEOCODING_UNAVAILABLE', 'LOCATION_VALID'];
    } else if (
      !geocodingAvailable &&
      decision.result !== 'WAITING_FOR_HOME' &&
      !(
        decision.result === 'LOCATION_MISMATCH' &&
        decision.distanceFromReferenceMeters != null &&
        decision.distanceFromReferenceMeters > config.HOME_RADIUS_METERS
      )
    ) {
      decision.result = 'MANUAL_REVIEW';
      decision.reasonCodes = [...decision.reasonCodes, 'GEOCODING_UNAVAILABLE', 'MANUAL_REVIEW_REQUIRED'];
    } else if (!geocodingAvailable) {
      decision.reasonCodes = [...decision.reasonCodes, 'GEOCODING_UNAVAILABLE'];
    }
    const autoApprovalThreshold = Math.max(0.9, config.AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD);
    const approvalDecision = applyApprovalPolicy({
      result: decision.result,
      addressScore: decision.addressScore,
      coordinateMatchScore,
      customerConfirmationStatus: row.session.customerConfirmationStatus,
      enableAutoApproval: config.ENABLE_AUTO_APPROVAL,
      threshold: autoApprovalThreshold,
      reasonCodes: decision.reasonCodes,
    });
    const autoApprovalEligible = approvalDecision.autoApproved;
    decision.result = approvalDecision.result as typeof decision.result;
    decision.reasonCodes = approvalDecision.reasonCodes;
    const captureId = randomUUID();
    const resultId = randomUUID();
    const timestamp = now();
    const nextAttemptCount = row.session.attemptCount + 1;
    const attemptLimitReached = nextAttemptCount >= maxLocationAttempts;
    const forceReminder = attemptLimitReached && decision.result !== 'LOCATION_VALID';
    const reminderLimitReached = row.session.reminderCount >= config.MAX_REMINDERS_PER_SESSION;
    if (forceReminder) decision.reasonCodes = [...decision.reasonCodes, 'GPS_ATTEMPT_LIMIT_REACHED'];
    const nextStatus = forceReminder
      ? reminderLimitReached
        ? 'REMINDER_LIMIT_REACHED'
        : 'REMINDER_REQUIRED'
      : decision.result === 'LOCATION_VALID'
        ? 'LOCATION_VALID'
        : decision.result;
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx.insert(locationCaptures).values({
        id: captureId,
        sessionId: row.session.id,
        location: { latitude: decision.bestSample.latitude, longitude: decision.bestSample.longitude },
        latitude: decision.bestSample.latitude.toFixed(7),
        longitude: decision.bestSample.longitude.toFixed(7),
        accuracyMeters: decision.bestSample.accuracyMeters.toFixed(2),
        sampleCount: samples.length,
        bestAccuracyMeters: Math.min(...samples.map((sample) => sample.accuracyMeters)).toFixed(2),
        samples,
        deviceTimestamp: new Date(decision.bestSample.capturedAt),
        serverTimestamp: timestamp,
        createdAt: timestamp,
      });
      await tx.insert(validationResults).values({
        id: resultId,
        sessionId: row.session.id,
        captureId,
        addressId: row.address.id,
        provinceMatch: decision.provinceMatch,
        cityMatch: decision.cityMatch,
        districtMatch: decision.districtMatch,
        subdistrictMatch: decision.subdistrictMatch,
        streetScore: decision.streetScore.toFixed(3),
        houseNumberMatch: decision.houseNumberMatch,
        gpsAccuracyMeters: decision.bestSample.accuracyMeters.toFixed(2),
        distanceToReferenceMeters:
          decision.distanceFromReferenceMeters == null ? null : decision.distanceFromReferenceMeters.toFixed(2),
        addressScore: decision.addressScore.toFixed(3),
        result: decision.result,
        reasonCodes: decision.reasonCodes,
        reverseGeocode: decision.reverseGeocode,
        referencePrecision: decision.referencePrecision,
        engineVersion: '1.1.0',
        configVersion: 'env',
        capturedLatitude: decision.bestSample.latitude.toFixed(7),
        capturedLongitude: decision.bestSample.longitude.toFixed(7),
        referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude).toFixed(7),
        referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude).toFixed(7),
        createdAt: timestamp,
      });
      await tx
        .update(verificationSessions)
        .set({
          attemptCount: nextAttemptCount,
          verificationStatus: nextStatus,
          locationVerifiedAt: decision.result === 'LOCATION_VALID' ? timestamp : null,
          completedAt: decision.result === 'LOCATION_VALID' ? timestamp : null,
          updatedAt: timestamp,
        })
        .where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorUserId: 'system',
        actorName: 'Validation Engine',
        action: 'LOCATION_VALIDATION_COMPLETED',
        entityType: 'VALIDATION',
        entityId: resultId,
        after: {
          result: decision.result,
          reasonCodes: decision.reasonCodes,
          accuracyMeters: decision.bestSample.accuracyMeters,
          distanceMeters: decision.distanceFromReferenceMeters,
          addressScore: decision.addressScore,
        },
        timestamp,
      });
      if (autoApprovalEligible)
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Validation Engine',
          action: 'LOCATION_AUTO_APPROVED',
          entityType: 'VERIFICATION_SESSION',
          entityId: row.session.id,
          after: {
            result: decision.result,
            addressScore: decision.addressScore,
            threshold: autoApprovalThreshold,
            customerConfirmationStatus: row.session.customerConfirmationStatus,
          },
          reason: 'Customer data confirmed and validation score met the automatic approval threshold',
          timestamp,
        });
      if (decision.result === 'WAITING_FOR_HOME' || decision.result === 'LOW_GPS_ACCURACY')
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Validation Engine',
          action: 'GPS_ACCURACY_REJECTED',
          entityType: 'VALIDATION',
          entityId: resultId,
          after: {
            accuracyMeters: decision.bestSample.accuracyMeters,
            threshold: config.GPS_MAX_ACCURACY_METERS,
            result: decision.result,
            reasonCodes: decision.reasonCodes,
          },
          timestamp,
        });
      if (decision.result === 'LOCATION_MISMATCH')
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Validation Engine',
          action: 'HOME_VALIDATION_FAILED',
          entityType: 'VALIDATION',
          entityId: resultId,
          after: {
            distanceMeters: decision.distanceFromReferenceMeters,
            radiusMeters: config.HOME_RADIUS_METERS,
            reasonCodes: decision.reasonCodes,
          },
          timestamp,
        });
      if (forceReminder)
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Validation Engine',
          action: 'GPS_ATTEMPT_LIMIT_REACHED',
          entityType: 'VERIFICATION_SESSION',
          entityId: row.session.id,
          after: {
            attemptCount: nextAttemptCount,
            maxAttempts: maxLocationAttempts,
            reminderCount: row.session.reminderCount,
            maxReminders: config.MAX_REMINDERS_PER_SESSION,
            nextAction: reminderLimitReached ? 'ADMIN_RESTART_OR_REVIEW' : 'SELECT_REMINDER',
          },
          timestamp,
        });
      if (decision.result === 'LOCATION_VALID') {
        await tx
          .update(customerAddresses)
          .set({
            addressStatus: 'SUPERSEDED',
            addressType: 'HISTORICAL',
            isActive: false,
            validTo: timestamp,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(customerAddresses.customerId, row.customer.id),
              eq(customerAddresses.isActive, true),
              ne(customerAddresses.id, row.address.id),
            ),
          );
        await tx
          .update(customerAddresses)
          .set({
            ...buildVerifiedAddressReference(decision.bestSample.latitude, decision.bestSample.longitude),
            isVerified: true,
            addressStatus: 'VERIFIED',
            addressType: 'VERIFIED_INSTALLATION',
            updatedAt: timestamp,
          })
          .where(eq(customerAddresses.id, row.address.id));
        await tx
          .update(customers)
          .set({ status: 'VERIFIED', updatedAt: timestamp })
          .where(eq(customers.id, row.customer.id));
        await tx
          .update(reminders)
          .set({ status: 'CANCELLED' })
          .where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
        const eventId = randomUUID();
        await tx
          .insert(integrationOutbox)
          .values({
            id: randomUUID(),
            eventId,
            eventType: 'location.verified.v1',
            aggregateType: 'VERIFICATION_SESSION',
            aggregateId: row.session.id,
            correlationId: row.session.id,
            idempotencyKey: `location-verified:${row.session.id}`,
            payload: {
              eventId,
              eventType: 'location.verified.v1',
              occurredAt: timestamp.toISOString(),
              correlationId: row.session.id,
              idempotencyKey: `location-verified:${row.session.id}`,
              customer: { externalId: row.customer.externalId, name: row.customer.name },
              verifiedAddress: { addressId: row.address.id, fullAddress: row.address.rawAddress },
              verifiedLocation: {
                latitude: decision.bestSample.latitude,
                longitude: decision.bestSample.longitude,
                accuracyMeters: decision.bestSample.accuracyMeters,
                verifiedAt: timestamp.toISOString(),
              },
            },
            status: 'PENDING',
            attemptCount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing({ target: integrationOutbox.idempotencyKey });
      }
    });
    return {
      id: resultId,
      status: nextStatus,
      attemptCount: nextAttemptCount,
      maxAttempts: maxLocationAttempts,
      ...decision,
      capturedLocation: {
        ...decision.bestSample,
        coordinateText: `${decision.bestSample.latitude.toFixed(6)}, ${decision.bestSample.longitude.toFixed(6)}`,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${decision.bestSample.latitude},${decision.bestSample.longitude}`,
      },
    };
  }

  async waitForHome(
    token: string,
    preference?: ReminderPreference,
    scheduledAtInput?: string,
    _reminderUntilAtInput?: string,
  ) {
    const row = await this.findByToken(token);
    const config = await this.validationConfig.get();
    const max = config.MAX_REMINDERS_PER_SESSION;
    if (!config.ENABLE_REMINDERS || row.session.reminderCount >= max)
      throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    if (row.reminder && !canScheduleReminderFromLink(row.session.reminderCount, row.reminder.reminderNumber))
      throw new DomainError(
        'A reminder has already been selected from this link',
        409,
        'REMINDER_ALREADY_SELECTED',
      );
    const reminderNumber = nextReminderNumber(row.session.reminderCount, max);
    if (!reminderNumber) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');
    const currentTime = now();
    const scheduledAt = scheduledAtInput
      ? new Date(scheduledAtInput)
      : scheduleReminderInTimezone(
          preference ?? 'DEFAULT',
          currentTime,
          process.env.REMINDER_TIMEZONE ?? 'Asia/Jakarta',
        );
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= currentTime)
      throw new DomainError('Reminder time must be in the future', 422, 'REMINDER_TIME_INVALID');
    if (!isReminderScheduledBeforeSessionExpiry(scheduledAt, row.session.expiresAt))
      throw new DomainError(
        'Reminder time must be before the verification session expires',
        422,
        'REMINDER_TIME_EXCEEDS_SESSION',
      );
    // A customer action schedules exactly one next reminder. If the reminder
    // link is not opened, the worker creates the next one automatically.
    const reminderTimes = [scheduledAt];
    const effectiveReminderUntilAt = scheduledAt;
    const finalReminderNumber = row.session.reminderCount + 1;
    const nextStatus = finalReminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(row.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      const timestamp = now();
      const [existingReminder] = await tx
        .select({
          id: reminders.id,
          status: reminders.status,
          sentAt: reminders.sentAt,
          tokenId: reminders.tokenId,
        })
        .from(reminders)
        .where(
          and(eq(reminders.sessionId, row.session.id), eq(reminders.reminderNumber, finalReminderNumber)),
        )
        .limit(1);
      const reminderMessage = `Halo ${row.customer.name}, pengingat ${finalReminderNumber} dari ${max}. Tautan baru berlaku maksimal ${config.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`;
      const reuseCancelledReminder = Boolean(
        existingReminder &&
          isReusableCancelledReminder(existingReminder.status, existingReminder.sentAt, existingReminder.tokenId),
      );

      if (existingReminder && !reuseCancelledReminder) {
        throw new DomainError('Reminder slot has already been used', 409, 'REMINDER_SLOT_ALREADY_USED');
      }

      if (reuseCancelledReminder) {
        await tx
          .update(reminders)
          .set({
            channel: 'WHATSAPP',
            scheduledAt,
            sentAt: null,
            openedAt: null,
            tokenId: null,
            tokenHash: null,
            tokenExpiresAt: null,
            tokenInvalidatedAt: null,
            status: 'SCHEDULED',
            messageText: reminderMessage,
            providerMessageId: null,
            retryCount: 0,
          })
          .where(eq(reminders.id, existingReminder.id));
      } else {
        await tx.insert(reminders).values({
          id: randomUUID(),
          sessionId: row.session.id,
          reminderNumber: finalReminderNumber,
          channel: 'WHATSAPP',
          scheduledAt,
          status: 'SCHEDULED',
          messageText: reminderMessage,
          retryCount: 0,
          createdAt: timestamp,
        });
      }
      await tx
        .update(verificationSessions)
        .set({ reminderCount: finalReminderNumber, verificationStatus: nextStatus, updatedAt: timestamp })
        .where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: 'WAITING_FOR_HOME_SELECTED',
        entityType: 'VERIFICATION_SESSION',
        entityId: row.session.id,
        after: {
          preference: preference ?? 'CUSTOM',
          reminderCount: finalReminderNumber,
          scheduledAt: scheduledAt.toISOString(),
          reminderUntilAt: effectiveReminderUntilAt.toISOString(),
          automaticSchedule: false,
          reusedCancelledReminder: reuseCancelledReminder,
        },
        timestamp,
      });
      await tx.insert(auditLogs).values(
        reminderTimes.map((time, index) => ({
          actorUserId: 'system',
          actorName: 'Reminder Scheduler',
          action: 'REMINDER_SCHEDULED',
          entityType: 'REMINDER',
          entityId: row.session.id,
          after: {
            reminderNumber: row.session.reminderCount + index + 1,
            scheduledAt: time.toISOString(),
            reminderUntilAt: effectiveReminderUntilAt.toISOString(),
            automaticSchedule: false,
            reusedCancelledReminder: reuseCancelledReminder,
          },
          timestamp,
        })),
      );
    });
    return {
      status: nextStatus,
      reminderNumber: finalReminderNumber,
      reminderCount: finalReminderNumber,
      scheduledAt: scheduledAt.toISOString(),
      reminderUntilAt: effectiveReminderUntilAt.toISOString(),
    };
  }

  async addressStatus(token: string, sameAddress: boolean) {
    const row = await this.findByToken(token);
    if (sameAddress) assertAddressCorrectionComplete(row.address);
    const config = await this.validationConfig.get();
    if (sameAddress && row.session.attemptCount >= Math.min(3, config.MAX_LOCATION_ATTEMPTS) && !row.reminder)
      throw new DomainError('Please choose a reminder before trying GPS again.', 409, 'REMINDER_REQUIRED');
    if (!sameAddress && !canReplaceAddress(row.address.addressType, isAddressIncomplete(row.address))) {
      throw new DomainError(
        'The address can only be changed once. Please contact IRA Customer Service for further changes.',
        409,
        'ADDRESS_CHANGE_LIMIT_REACHED',
      );
    }
    const nextStatus = sameAddress ? 'GPS_CAPTURING' : 'ADDRESS_EDITING';
    if (requiresLocationConsentForAddressStatus(sameAddress) && !row.session.consentAt)
      throw new DomainError('Location consent is required before confirming the address', 409, 'CONSENT_REQUIRED');
    assertTransition(row.session.verificationStatus, nextStatus);
    const timestamp = now();
    await db.transaction(async (tx) => {
      await tx
        .update(verificationSessions)
        .set({ verificationStatus: nextStatus, updatedAt: timestamp })
        .where(eq(verificationSessions.id, row.session.id));
      if (!sameAddress)
        await tx
          .update(reminders)
          .set({ status: 'CANCELLED' })
          .where(and(eq(reminders.sessionId, row.session.id), eq(reminders.status, 'SCHEDULED')));
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: sameAddress ? 'ADDRESS_CONFIRMED_CURRENT' : 'ADDRESS_CHANGE_STARTED',
        entityType: 'VERIFICATION_SESSION',
        entityId: row.session.id,
        before: { status: row.session.verificationStatus, addressId: row.address.id },
        after: { status: nextStatus, sameAddress },
        timestamp,
      });
    });
    return { status: nextStatus, sameAddress };
  }

  async changeAddress(token: string, input: AddressChangeInput) {
    const row = await this.findByToken(token);
    assertAddressCorrectionComplete(input);
    const config = await this.validationConfig.get();
    if (!config.ENABLE_ADDRESS_EDIT) throw new DomainError('Address edit is disabled', 409);
    if (!canReplaceAddress(row.address.addressType, isAddressIncomplete(row.address))) {
      throw new DomainError(
        'The address can only be changed once. Please contact IRA Customer Service for further changes.',
        409,
        'ADDRESS_CHANGE_LIMIT_REACHED',
      );
    }
    if (row.session.verificationStatus !== 'ADDRESS_EDITING')
      assertTransition(row.session.verificationStatus, 'ADDRESS_EDITING');
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
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: 'ADDRESS_CHANGE_STARTED',
        entityType: 'VERIFICATION_SESSION',
        entityId: row.session.id,
        before: { addressId: row.address.id, status: row.session.verificationStatus },
        after: { status: 'ADDRESS_EDITING' },
        timestamp,
      });
      await tx
        .update(customerAddresses)
        .set({ addressStatus: 'SUPERSEDED', isActive: false, validTo: timestamp, updatedAt: timestamp })
        .where(
          and(
            eq(customerAddresses.customerId, row.customer.id),
            eq(customerAddresses.addressType, 'PROPOSED'),
            eq(customerAddresses.isActive, true),
          ),
        );
      await tx.insert(customerAddresses).values({
        ...input,
        houseNumber,
        id: addressId,
        customerId: row.customer.id,
        addressType: 'PROPOSED',
        addressStatus: 'PROPOSED',
        rawAddress: [
          input.street,
          houseNumber && `No. ${houseNumber}`,
          input.block && `Blok ${input.block}`,
          input.addressDetail,
          input.landmark && `Patokan: ${input.landmark}`,
          input.subdistrict,
          input.district,
          input.city,
          input.province,
          input.postalCode,
        ]
          .filter(Boolean)
          .join(', '),
        referenceLocation: geocode ? { latitude: geocode.latitude, longitude: geocode.longitude } : null,
        referenceSource: geocode ? 'GEOCODED' : 'CUSTOMER_PROPOSED',
        referencePrecision: geocode?.precision ?? 'UNKNOWN',
        referenceConfidence: geocode?.confidence.toFixed(3) ?? '0.000',
        geocodingProvider: geocode?.provider ?? null,
        providerPlaceId: geocode?.providerPlaceId ?? null,
        geocodedAt: geocode ? timestamp : null,
        isActive: true,
        isVerified: false,
        validFrom: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await tx
        .update(verificationSessions)
        .set({ currentAddressId: addressId, verificationStatus: 'ADDRESS_PROPOSED', updatedAt: timestamp })
        .where(eq(verificationSessions.id, row.session.id));
      await tx.insert(auditLogs).values({
        actorUserId: 'customer-token',
        actorName: 'Customer',
        action: 'ADDRESS_PROPOSED',
        entityType: 'ADDRESS',
        entityId: addressId,
        after: { sessionId: row.session.id, status: 'PROPOSED' },
        timestamp,
      });
    });
    return { id: addressId, status: 'PROPOSED' };
  }

  async lookupAddress(token: string, input: AddressLookupInput) {
    await this.findByToken(token);
    const result = await this.geocoding.forward(input);
    return { postalCode: result.postalCode ?? null, formattedAddress: result.formattedAddress };
  }
}
