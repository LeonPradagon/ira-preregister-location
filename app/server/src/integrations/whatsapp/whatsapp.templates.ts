export type WhatsAppTemplateKind = 'INVITATION' | 'REMINDER';

const defaults: Record<WhatsAppTemplateKind, { name: string }> = {
  INVITATION: { name: 'ira_preregist_invitation' },
  REMINDER: { name: 'ira_preregist_reminder' },
};

export function getWhatsAppTemplate(kind: WhatsAppTemplateKind) {
  const prefix = kind === 'INVITATION' ? 'INVITATION' : 'REMINDER';
  return {
    name: process.env[`WHATSAPP_${prefix}_TEMPLATE_NAME`] || defaults[kind].name,
    messageTemplateId: process.env[`WHATSAPP_${prefix}_TEMPLATE_ID`] || process.env.WHATSAPP_MESSAGE_TEMPLATE_ID,
    parameterNames: (
      process.env[`WHATSAPP_${prefix}_TEMPLATE_PARAMETER_NAMES`] ||
      process.env.WHATSAPP_TEMPLATE_PARAMETER_NAMES ||
      'name,link'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    // WhatsApp blast ditujukan untuk customer Indonesia; bahasa UI admin tidak mengubah bahasa pesan.
    language: 'id',
  };
}

export function renderWhatsAppTemplate(
  kind: WhatsAppTemplateKind,
  customerName: string,
  verificationLink: string,
): string {
  if (kind === 'INVITATION') {
    return `Halo ${customerName}, kami dari IRA (Internet Rakyat).\n\nTerkait data yang pernah Kakak daftarkan sebelumnya, mohon kesediaannya untuk melanjutkan proses pemasangan internet dengan mengklik tautan berikut:\n${verificationLink}\n\nSilakan klik tautan tersebut saat sudah berada di rumah atau alamat yang akan dipasang internet. Tautan ini khusus untuk Kakak, jadi mohon jangan dibagikan kepada orang lain.`;
  }
  return `Halo ${customerName}, kami dari IRA (Internet Rakyat).\n\nProses verifikasi alamat pemasangan Anda belum selesai. Mohon lanjutkan melalui tautan berikut saat Anda berada di alamat pemasangan:\n${verificationLink}\n\nTautan ini bersifat pribadi dan tidak boleh dibagikan.`;
}
