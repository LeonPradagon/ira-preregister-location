import { describe, expect, it } from 'vitest';
import { renderWhatsAppTemplate } from '../../../src/integrations/whatsapp/whatsapp.templates.js';

describe('WhatsApp templates', () => {
  it('renders a professional Indonesian invitation with IRA identity and unique link', () => {
    const message = renderWhatsAppTemplate('INVITATION', 'Budi Santoso', 'https://example.test/v/unique-token');
    expect(message).toContain('kami dari IRA (Internet Rakyat)');
    expect(message).toContain('Budi Santoso');
    expect(message).toContain('https://example.test/v/unique-token');
    expect(message).toContain('tidak boleh dibagikan');
  });
});
