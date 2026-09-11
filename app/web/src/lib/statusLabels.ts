const labels: Record<string, string> = {
  ACTIVE: 'Aktif',
  PENDING_INSTALLATION: 'Menunggu pemasangan',
  SUSPENDED: 'Ditangguhkan',
  VERIFIED: 'Terverifikasi',
  CREATED: 'Belum dimulai',
  MESSAGE_SENT: 'Undangan terkirim',
  LINK_OPENED: 'Tautan dibuka',
  CONSENTED: 'Menunggu izin lokasi',
  GPS_CAPTURING: 'Sedang mengambil lokasi',
  LOCATION_VALID: 'Lokasi sesuai',
  LOW_GPS_ACCURACY: 'Sinyal lokasi kurang akurat',
  LOCATION_MISMATCH: 'Lokasi tidak sesuai',
  CUSTOMER_DATA_MISMATCH: 'Data tidak sesuai',
  MANUAL_REVIEW: 'Perlu diperiksa tim',
  WAITING_FOR_HOME: 'Belum di rumah / perlu coba lagi',
  ADDRESS_EDITING: 'Sedang mengubah alamat',
  ADDRESS_PROPOSED: 'Alamat baru diajukan',
  REMINDER_LIMIT_REACHED: 'Batas pengingat tercapai',
  EXPIRED: 'Tautan kedaluwarsa',
  SCHEDULED: 'Menunggu dikirim',
  PROCESSING: 'Sedang diproses',
  SENT: 'Terkirim',
  DELIVERED: 'Terkirim',
  READ: 'Sudah dibaca',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
  PENDING: 'Menunggu diproses',
  PUBLISHED: 'Sudah diteruskan',
};

const reasonLabels: Record<string, string> = {
  LOCATION_VALID: 'Lokasi sesuai',
  LOW_GPS_ACCURACY: 'Sinyal lokasi kurang akurat',
  MANUAL_REVIEW_REQUIRED: 'Perlu diperiksa oleh tim',
  GPS_SAMPLE_INCONSISTENT: 'Titik lokasi belum konsisten',
  WAITING_FOR_HOME: 'Belum di rumah / perlu coba lagi',
  REFERENCE_LOCATION_MISSING: 'Titik alamat belum tersedia',
  REFERENCE_LOCATION_NOT_PRECISE: 'Titik alamat belum cukup tepat',
  AUTOMATED_VALIDATION_PASSED: 'Pemeriksaan awal sesuai',
  AUTO_APPROVED: 'Disetujui otomatis',
  HOME_RADIUS_EXCEEDED: 'Lokasi terlalu jauh dari alamat',
  PROVINCE_MISMATCH: 'Provinsi tidak sesuai',
  CITY_MISMATCH: 'Kota atau kabupaten tidak sesuai',
  DISTRICT_MISMATCH: 'Kecamatan tidak sesuai',
  SUBDISTRICT_MISMATCH: 'Kelurahan atau desa tidak sesuai',
  STREET_MISMATCH: 'Nama jalan tidak sesuai',
  STREET_VARIATION: 'Nama jalan mirip, tetapi penulisannya berbeda',
  HOUSE_NUMBER_MISMATCH: 'Nomor rumah tidak sesuai',
  ADDRESS_INCOMPLETE: 'Alamat belum lengkap',
};

const auditLabels: Record<string, string> = {
  CUSTOMER_CREATED: 'Customer created',
  CUSTOMER_UPDATED: 'Customer updated',
  CUSTOMER_DEACTIVATED: 'Customer deactivated',
  ADDRESS_CREATED: 'Address created',
  ADDRESS_UPDATED: 'Address updated',
  ADDRESS_PROPOSED: 'New address proposed',
  VERIFICATION_CREATED: 'Verification created',
  VERIFICATION_STARTED: 'Verification started',
  VERIFICATION_SIMULATION_CREATED: 'Verification simulation created',
  VERIFICATION_REVOKED: 'Verification revoked',
  VERIFICATION_CYCLE_RESTARTED: 'Verification cycle restarted',
  LOCATION_CAPTURED: 'Location captured',
  LOCATION_VALID: 'Location matched',
  LOCATION_VALIDATION_COMPLETED: 'Location check completed',
  LOCATION_AUTO_APPROVED: 'Location auto-approved',
  GPS_ACCURACY_REJECTED: 'GPS accuracy rejected',
  HOME_VALIDATION_FAILED: 'Home-distance check failed',
  MANUAL_REVIEW: 'Manual review completed',
  MANUAL_REVIEW_APPROVED: 'Manual review approved',
  MANUAL_REVIEW_REJECTED: 'Manual review rejected',
  CUSTOMER_DELETED: 'Customer permanently deleted',
  CUSTOMER_IMPORT_COMPLETED: 'Customer import completed',
  REMINDER_SCHEDULED: 'Reminder scheduled',
  REMINDER_SENT: 'Reminder sent',
  REMINDER_LINK_OPENED: 'Reminder link opened',
  REMINDER_FAILED: 'Reminder failed',
  CAMPAIGN_CREATED: 'Message campaign created',
  CAMPAIGN_STARTED: 'Message campaign started',
  CAMPAIGN_TARGETS_MATERIALIZED: 'Campaign targets prepared',
  CAMPAIGN_INVITATION_SENT: 'Campaign invitation sent',
  CAMPAIGN_INVITATION_FAILED: 'Campaign invitation failed',
  CONFIG_UPDATED: 'Validation rules updated',
  INVITATION_RESENT: 'Invitation resent',
  WHATSAPP_OPTED_OUT: 'WhatsApp messages stopped',
  WHATSAPP_SEND_BLOCKED: 'WhatsApp delivery blocked',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
};

const auditEntityLabels: Record<string, string> = {
  VERIFICATION_SESSION: 'Verification',
  VALIDATION: 'Location check',
  CUSTOMER: 'Customer',
  ADDRESS: 'Address',
  REMINDER: 'Reminder',
  REVIEW: 'Review',
  CONFIG: 'Validation rules',
  CAMPAIGN: 'Message campaign',
  CAMPAIGN_ITEM: 'Campaign item',
  DELIVERY: 'WhatsApp message',
  AUTH: 'Account access',
};

export const userFriendlyStatus = (status: string | null | undefined): string =>
  status ? (labels[status] ?? 'Status belum diketahui') : 'Belum ada status';

export const userFriendlyReason = (reason: string): string => reasonLabels[reason] ?? 'Ada hal yang perlu diperiksa';

export const userFriendlyAuditAction = (action: string): string => {
  const knownLabel = auditLabels[action];
  if (knownLabel) return knownLabel;
  const fallbackLabel = action
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return fallbackLabel || 'Activity recorded';
};
export const userFriendlyAuditEntity = (entity: string): string => auditEntityLabels[entity] ?? 'Data';
