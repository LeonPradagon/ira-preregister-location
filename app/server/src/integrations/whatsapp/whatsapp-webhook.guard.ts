import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const REPLAY_TTL_SECONDS = 10 * 60;

export interface WhatsAppWebhookHeaders {
  secret?: string;
  timestamp?: string;
  eventId?: string;
  signature?: string;
}

export async function claimWhatsAppWebhookEvent(
  store: Pick<Redis, 'set'>,
  eventId: string,
): Promise<boolean> {
  const eventHash = createHash('sha256').update(eventId).digest('hex');
  const result = await store.set(`webhook:whatsapp:replay:${eventHash}`, '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
  return result === 'OK';
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function isFreshWebhookTimestamp(timestamp: string, now = Date.now()): boolean {
  if (!/^\d{10,13}$/.test(timestamp)) return false;
  const value = Number(timestamp);
  const milliseconds = timestamp.length === 10 ? value * 1000 : value;
  return Number.isSafeInteger(value) && Math.abs(now - milliseconds) <= MAX_CLOCK_SKEW_MS;
}

export function createWhatsAppWebhookSignature(secret: string, timestamp: string, eventId: string, body: Buffer): string {
  return createHmac('sha256', secret).update(timestamp).update('.').update(eventId).update('.').update(body).digest('hex');
}

export function validateWhatsAppWebhookRequest(
  headers: WhatsAppWebhookHeaders,
  body: Buffer | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!body || !secret || !headers.secret || !headers.timestamp || !headers.eventId || !headers.signature) return false;
  if (!constantTimeEqual(headers.secret, secret) || !isFreshWebhookTimestamp(headers.timestamp, now)) return false;
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(headers.eventId)) return false;
  const signature = headers.signature.replace(/^sha256=/i, '');
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return constantTimeEqual(
    signature.toLowerCase(),
    createWhatsAppWebhookSignature(secret, headers.timestamp, headers.eventId, body),
  );
}

@Injectable()
export class WhatsAppWebhookGuard implements CanActivate, OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  }).on('error', () => undefined);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? '';
    const headers: WhatsAppWebhookHeaders = {
      secret: request.header('x-whatsapp-webhook-secret'),
      timestamp: request.header('x-whatsapp-webhook-timestamp'),
      eventId: request.header('x-whatsapp-webhook-id'),
      signature: request.header('x-whatsapp-webhook-signature'),
    };
    if (!validateWhatsAppWebhookRequest(headers, request.rawBody, secret)) throw new UnauthorizedException();

    let isNewEvent: boolean;
    try {
      isNewEvent = await claimWhatsAppWebhookEvent(this.redis, headers.eventId!);
    } catch {
      throw new ServiceUnavailableException('Webhook replay protection temporarily unavailable');
    }
    if (!isNewEvent) throw new UnauthorizedException();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
