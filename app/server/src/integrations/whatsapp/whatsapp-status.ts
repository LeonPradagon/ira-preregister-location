export type WhatsAppCustomerStatus =
  | 'VALID_FORMAT'
  | 'FORMAT_INVALID'
  | 'NOT_CHECKED'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'NOT_ON_WHATSAPP';

/**
 * Qontak/WhatsApp does not use one stable error shape across every account.
 * Keep the automatic classification conservative: a customer is marked as
 * NOT_ON_WHATSAPP only when the provider error explicitly says so, or when an
 * operator has configured a provider error code known to mean that outcome.
 */
export const classifyWhatsAppFailure = (input: { error?: string; errorCode?: string }): 'FAILED' | 'NOT_ON_WHATSAPP' => {
  const configuredCodes = (process.env.WHATSAPP_NOT_ON_WHATSAPP_ERROR_CODES ?? '')
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
  const errorCode = input.errorCode?.trim().toLowerCase();
  if (errorCode && configuredCodes.includes(errorCode)) return 'NOT_ON_WHATSAPP';

  const normalizedError = (input.error ?? '').toLowerCase().replace(/[._-]+/g, ' ');
  const explicitNotRegisteredPhrases = [
    'not a whatsapp user',
    'not a whatsapp account',
    'not registered on whatsapp',
    'not registered in whatsapp',
    'phone number is not registered',
    'recipient is not a whatsapp',
    'does not have a whatsapp account',
    'bukan pengguna whatsapp',
    'nomor tidak terdaftar di whatsapp',
    'nomor tidak terdaftar pada whatsapp',
  ];
  return explicitNotRegisteredPhrases.some((phrase) => normalizedError.includes(phrase))
    ? 'NOT_ON_WHATSAPP'
    : 'FAILED';
};

export const formatWhatsAppProviderError = (input: { error?: string; errorCode?: string }) => {
  const error = input.error?.trim();
  const errorCode = input.errorCode?.trim();
  if (errorCode && error && !error.includes(errorCode)) return `[${errorCode}] ${error}`.slice(0, 500);
  return (error || (errorCode ? `[${errorCode}]` : 'PROVIDER_REPORTED_FAILURE')).slice(0, 500);
};
