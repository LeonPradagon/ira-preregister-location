import { describe, expect, it } from 'vitest';
import { renderWhatsAppTemplate } from '../../../src/integrations/whatsapp/whatsapp.templates.js';

describe('WhatsApp templates', () => {
  it('renders a professional Indonesian invitation with IRA identity and unique link', () => {
    const message = renderWhatsAppTemplate('INVITATION', 'Budi Santoso', 'https://example.test/v/unique-token');
    expect(message).toContain('kami dari IRA (Internet Rakyat)');
    expect(message).toContain('data yang pernah Kakak daftarkan sebelumnya');
    expect(message).toContain('melanjutkan proses pemasangan internet dengan mengklik tautan berikut');
    expect(message).toContain('Budi Santoso');
    expect(message).toContain('https://example.test/v/unique-token');
    expect(message).toContain('sudah berada di rumah atau alamat yang akan dipasang internet');
    expect(message).toContain('mohon jangan dibagikan kepada orang lain');
  });
});
