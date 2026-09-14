import { afterEach, describe, expect, it } from 'vitest';
import { classifyWhatsAppFailure, formatWhatsAppProviderError } from '../../../src/integrations/whatsapp/whatsapp-status.js';

afterEach(() => {
  delete process.env.WHATSAPP_NOT_ON_WHATSAPP_ERROR_CODES;
});

describe('WhatsApp provider failure classification', () => {
  it('classifies an explicit provider message as not registered', () => {
    expect(classifyWhatsAppFailure({ error: 'Recipient is not a WhatsApp user' })).toBe('NOT_ON_WHATSAPP');
  });

  it('does not turn an unspecified provider failure into a registration claim', () => {
    expect(classifyWhatsAppFailure({ error: 'Template parameter format does not match' })).toBe('FAILED');
  });

  it('supports provider error codes configured by the operator', () => {
    process.env.WHATSAPP_NOT_ON_WHATSAPP_ERROR_CODES = '131026, recipient_not_found';
    expect(classifyWhatsAppFailure({ errorCode: '131026', error: 'Message undeliverable' })).toBe('NOT_ON_WHATSAPP');
  });

  it('keeps the provider code with the stored error text', () => {
    expect(formatWhatsAppProviderError({ errorCode: '131026', error: 'Message undeliverable' })).toBe(
      '[131026] Message undeliverable',
    );
  });
});
