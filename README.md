# IRA Preregist

Monorepo verifikasi alamat dan lokasi customer. Admin mengimpor data, mengirim link WhatsApp lewat campaign, lalu customer mengonfirmasi alamat dan mengirim sampel GPS. Backend menyimpan hasil validasi, reminder, audit, dan pekerjaan asynchronous.

Struktur aplikasi tetap:

```text
app/
  web/       React, Vite, Tailwind CSS, Leaflet
  server/    NestJS, Better Auth, Drizzle, PostgreSQL/PostGIS, BullMQ
packages/    Ruang untuk shared package jika diperlukan
scripts/     Utilitas development dan laporan
deploy/     Konfigurasi Nginx dan opsi deployment terpisah
```

## Deploy dengan Docker Compose

Prasyarat: Docker Engine/Desktop dengan Linux containers dan Docker Compose 2.24 atau lebih baru. Node.js di host tidak diperlukan untuk deployment.

1. Salin konfigurasi dari root repository:

   ```powershell
   Copy-Item .env.example .env
   ```

   Linux/macOS: `cp .env.example .env`.

2. Edit `.env`: isi `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (minimal 32 karakter acak), `SEED_ADMIN_EMAIL`, dan `SEED_ADMIN_PASSWORD`. Untuk password database gunakan karakter yang aman dalam URL, misalnya string hex acak, karena Compose menyusun `DATABASE_URL` dari nilai tersebut.

   Untuk uji di komputer sendiri, URL contoh sudah memakai `http://localhost:8080`. Untuk server publik, ubah **keduanya**, `WEB_ORIGIN` dan `BETTER_AUTH_URL`, menjadi domain HTTPS aplikasi, misalnya `https://preregist.example.com`. Arahkan reverse proxy HTTPS ke `WEB_PORT` (default `8080`). Pertahankan `VITE_API_URL=/v1` agar browser memakai domain yang sama. GPS browser memerlukan HTTPS atau localhost.

3. Jalankan seluruh stack:

   ```bash
   docker compose up --build -d
   docker compose ps -a
   ```

Buka `http://localhost:8080` atau domain yang dikonfigurasi, lalu login dengan akun `SEED_ADMIN_*`. Tidak perlu menjalankan migration atau seed manual untuk instalasi baru.

Compose menjalankan PostgreSQL/PostGIS, Redis, migration, bootstrap admin, API, API gateway, empat worker, dan web Nginx. API/worker menunggu migration dan bootstrap berhasil; `migrate` dan `seed` berstatus **Exited (0)** setelah selesai. Bootstrap hanya membuat admin yang belum ada, sehingga deploy ulang tidak mengganti password atau role akun yang sudah ada.

| Akses | Default |
| --- | --- |
| Web dan API melalui satu origin | `http://localhost:8080`, `http://localhost:8080/v1/health` |
| API gateway langsung, jika diperlukan | `http://localhost:3000/v1/health` |
| PostgreSQL dan Redis | Hanya network internal Docker |

Database, Redis, dan file import disimpan dalam named volume. `.env` tidak disalin ke image. `DATABASE_URL`, `DATABASE_SSL=false`, `REDIS_URL`, dan lokasi penyimpanan import diatur otomatis untuk service internal. Provider WhatsApp default `disabled`; aktifkan Mekari setelah credential, channel, dan template siap.

```bash
# Status, diagnosis, dan update aplikasi
docker compose ps -a
docker compose logs --tail=100 migrate seed api
docker compose logs -f messaging-worker import-worker
docker compose up --build -d

# Berhenti tanpa menghapus data
docker compose down
```

Jangan memakai `down -v` pada data yang masih diperlukan. Panduan backup, upgrade dari deployment lama, dan deployment frontend/backend terpisah ada di [deploy/README.md](deploy/README.md).

## Development lokal

Gunakan Node.js 22 dan npm dari **root repository**. Satu `package-lock.json` menjadi sumber versi dependency untuk web, server, dan Docker.

```powershell
npm ci
Copy-Item app/server/.env.example app/server/.env
Copy-Item app/web/.env.example app/web/.env
npm run infra:up
npm run db:migrate
npm run db:seed
npm run dev:server
```

Jalankan `npm run dev` dan `npm run dev:worker` pada terminal terpisah. Frontend tersedia di `http://localhost:5173`, API di `http://localhost:3000`, PostgreSQL di `localhost:5433`, dan Redis di `localhost:6379`. Dengan `app/server/.env.example`, akun development default adalah `admin@surge.com` / `admin123`; ganti nilai `SEED_ADMIN_*` sebelum dipakai di lingkungan bersama.

`docker-compose.dev.yaml` menjalankan dependency lokal. `npm run infra:worker` tersedia jika worker ingin dijalankan di Docker; untuk upload asynchronous gunakan API dan worker dengan direktori `IMPORT_STORAGE_DIR` yang sama. Cara paling sederhana untuk debugging import lokal adalah menjalankan keduanya di host. Perintah backend membuat `.env` lokal dari contoh bila belum tersedia. Jangan menimpa `.env` yang sudah berisi konfigurasi Anda.

Link undangan/reminder worker memakai `WEB_ORIGIN` dari `app/server/.env`. Saat worker dijalankan di host, perubahan tunnel akan dibaca saat job berikutnya. Saat worker dijalankan di Docker, jalankan ulang `npm run infra:worker` setelah mengubah env agar container dibuat ulang. Untuk tunnel yang sama, set `WEB_ORIGIN` dan `BETTER_AUTH_URL` ke origin publik yang sesuai.

Smoke check health dan login lokal: `./scripts/local-smoke.ps1`. Skrip menjalankan migration/seed lokal, sehingga gunakan hanya pada database development; skrip tidak mengirim undangan ke customer.

## Maintenance kode

```bash
npm run format        # Rapikan format kode
npm run format:check  # Periksa format tanpa mengubah file
npm run lint          # TypeScript, termasuk import/variabel tidak terpakai
npm test              # Test frontend dan backend
npm run build         # Build kedua aplikasi
```

Kode UI berada di `app/web/src/components`, state/API di `context` dan `lib`. Backend memisahkan controller/service per modul di `app/server/src/modules`, provider di `integrations`, konfigurasi di `config`, dan database di `db`. Nama antrean BullMQ disatukan di `app/server/src/common/queue-names.ts` agar producer dan worker konsisten.

Migration SQL bernomor dijalankan berurutan dan dicatat di `app_migrations`. Baseline aplikasi adalah `0000_core.sql`; metadata Drizzle tetap dipertahankan untuk `npm run db:generate`. Setelah generate, periksa SQL dan urutan nomor sebelum deploy. Jangan mengedit migration yang sudah diterapkan. Migration wilayah dan kode pos sudah dibundel sehingga instalasi tidak perlu mengunduh data wilayah.

## Alur bisnis dan konfigurasi

- **Customer dan alamat:** import `.xlsx`/`.csv` dari menu pelanggan, maksimal 50 MB/file. Import menormalisasi nomor ke E.164, meng-upsert source ID, dan menyimpan metadata BTS/coverage. Pekerjaan besar diproses import worker.
- **Campaign:** pilih customer eligible atau filter seluruh customer; worker mematerialisasi target per batch dan mengirim sesuai jadwal. Batas harian, rate pesan per detik, dan cooldown nomor dapat diatur dari menu Check Rules. Batas harian tetap maksimal 10.000.
- **Verifikasi:** link `/v/:token` berisi opaque token. Customer mengonfirmasi data, memberi izin lokasi, dan mengirim sampel GPS. Server menjalankan validation engine dan menentukan status; alamat baru berstatus `PROPOSED` sampai validasi selesai.
- **Reminder:** customer memilih tanggal/jam. Worker mengikuti `REMINDER_TIMEZONE`, batas percobaan, dan masa berlaku link; link baru menggantikan link sebelumnya.
- **Akses:** Better Auth dan role `SUPER_ADMIN`, `ADMIN`, `REVIEWER`, `VIEWER`. Pengelolaan pengguna tersedia bagi super admin.

Aturan lokasi tersedia di Validation Settings dan environment: `GPS_MAX_ACCURACY_METERS`, `HOME_RADIUS_METERS`, `STREET_MATCH_THRESHOLD`, `ADDRESS_SCORE_THRESHOLD`, dan `ENABLE_AUTO_APPROVAL`. Persetujuan otomatis memerlukan konfirmasi data dan skor alamat minimal 90%; hasil yang belum memenuhi syarat ditahan untuk pemeriksaan.

Untuk Mekari/Qontak, isi `WHATSAPP_PROVIDER=mekari`, `WHATSAPP_BASE_URL`, credential HMAC, channel integration ID, dan template ID undangan/reminder. Nama serta parameter template harus sesuai konfigurasi Qontak yang sudah disetujui. Webhook delivery: `POST /v1/webhooks/whatsapp/status` dengan secret webhook. Opt-out aktif selalu memblokir pengiriman. Metadata opt-in yang tersedia tetap disimpan; aplikasi tidak meminta konfirmasi opt-in WhatsApp tambahan.

Geocoding memakai provider HTTP atau fallback Nominatim sesuai `GEOCODING_*` dan `OSM_NOMINATIM_*`. Atur user agent dengan kontak operator. Provider production yang belum dikonfigurasi tidak menghasilkan pengiriman atau koordinat palsu.

## Endpoint dan referensi

Semua endpoint menggunakan prefix `/v1`:

- Health: `/health`, `/health/live`, `/health/ready`.
- Auth: `/api/auth/*`.
- Admin: `/admin/customers`, `/admin/import-jobs`, `/admin/campaigns`, `/admin/verifications`, `/admin/reminders`, `/admin/users`, `/admin/audit-logs`.
- Customer: `/public/verifications/:token`, beserta `/customer-confirmation`, `/consent`, `/location`, `/address-status`, `/address-change`, `/wait-for-home`.

Importer CLI: `npm --workspace app/server run import:prereg -- /path/to/file.xlsx`.

Lihat [PRD](PRD_IRA_Preregist_v0.6.md), [PRD_COMPLIANCE.md](PRD_COMPLIANCE.md), dan [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) untuk requirement dan pekerjaan lanjutan. Dokumen PRD adalah referensi rancangan; perintah deployment aktif mengikuti README ini.
