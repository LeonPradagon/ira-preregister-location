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
  WAITING_FOR_HOME: 'Menunggu di lokasi',
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
  REFERENCE_LOCATION_MISSING: 'Titik alamat belum tersedia',
  REFERENCE_LOCATION_NOT_PRECISE: 'Titik alamat belum cukup tepat',
  AUTOMATED_VALIDATION_PASSED: 'Pemeriksaan awal sesuai',
  HOME_RADIUS_EXCEEDED: 'Lokasi terlalu jauh dari alamat',
  PROVINCE_MISMATCH: 'Provinsi tidak sesuai',
  CITY_MISMATCH: 'Kota atau kabupaten tidak sesuai',
  DISTRICT_MISMATCH: 'Kecamatan tidak sesuai',
  SUBDISTRICT_MISMATCH: 'Kelurahan atau desa tidak sesuai',
  STREET_MISMATCH: 'Nama jalan tidak sesuai',
  HOUSE_NUMBER_MISMATCH: 'Nomor rumah tidak sesuai',
  ADDRESS_INCOMPLETE: 'Alamat belum lengkap',
};

const auditLabels: Record<string, string> = {
  CUSTOMER_CREATED: 'Pelanggan ditambahkan', CUSTOMER_UPDATED: 'Data pelanggan diperbarui', CUSTOMER_DEACTIVATED: 'Pelanggan dinonaktifkan',
  ADDRESS_CREATED: 'Alamat ditambahkan', ADDRESS_UPDATED: 'Alamat diperbarui', ADDRESS_PROPOSED: 'Alamat baru diajukan',
  VERIFICATION_CREATED: 'Pemeriksaan dibuat', VERIFICATION_STARTED: 'Pemeriksaan dimulai', LOCATION_CAPTURED: 'Lokasi diterima',
  LOCATION_VALID: 'Lokasi dinyatakan sesuai', MANUAL_REVIEW: 'Pemeriksaan tambahan dilakukan', REMINDER_SCHEDULED: 'Pengingat dijadwalkan',
  REMINDER_SENT: 'Pengingat dikirim', CAMPAIGN_CREATED: 'Pengiriman dibuat', CAMPAIGN_STARTED: 'Pengiriman dimulai', LOGIN: 'Masuk ke akun', LOGOUT: 'Keluar dari akun',
};

const auditEntityLabels: Record<string, string> = {
  VERIFICATION_SESSION: 'Pemeriksaan', VALIDATION: 'Pemeriksaan lokasi', CUSTOMER: 'Pelanggan', ADDRESS: 'Alamat', REMINDER: 'Pengingat', REVIEW: 'Peninjauan', AUTH: 'Akses akun',
};

export const userFriendlyStatus = (status: string | null | undefined): string =>
  status ? labels[status] ?? 'Status belum diketahui' : 'Belum ada status';

export const userFriendlyReason = (reason: string): string =>
  reasonLabels[reason] ?? 'Ada hal yang perlu diperiksa';

export const userFriendlyAuditAction = (action: string): string => auditLabels[action] ?? 'Aktivitas diperbarui';
export const userFriendlyAuditEntity = (entity: string): string => auditEntityLabels[entity] ?? 'Data';
