# IRA Preregist

Monorepo untuk platform verifikasi lokasi customer berdasarkan PRD v0.6. Aplikasi ini mengirim link unik melalui WhatsApp Business, menerima bukti lokasi GPS dari customer, lalu memperbarui status verifikasi alamat berdasarkan hasil validasi backend.

Struktur utama:

- `app/web`: React/Vite UI API-only untuk Admin dan customer `/v/:token`.
- `app/server`: NestJS API, Better Auth, Drizzle/PostgreSQL/PostGIS, state machine, validation engine, outbox, dan worker BullMQ.
- `packages`: reserved untuk shared contracts/adapters lintas aplikasi.

## Tech stack dan arsitektur

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Leaflet, dan Lucide React. UI bersifat API-only; halaman customer tersedia di `/v/:token`.
- **Backend:** Node.js 22, NestJS 11, Zod, Better Auth, RBAC, serta correlation ID.
- **Database:** PostgreSQL 16 + PostGIS melalui Drizzle ORM untuk customer, alamat, koordinat, sesi, reminder, campaign, audit, dan outbox.
- **Asynchronous processing:** Redis 7 + BullMQ untuk campaign blast, reminder, rate limit, retry, idempotency, dan worker terpisah.
- **Security:** bcrypt untuk password dan secret token, opaque token `tokenId.secret`, secure cookie, CORS, serta sanitasi session/log.
- **Integrasi:** adapter HTTP WhatsApp Business dan geocoding. Adapter disabled digunakan bila provider production belum dikonfigurasi.
- **Deployment:** Docker Compose untuk backend/worker/database/Redis dan Nginx untuk static frontend.

Alur teknis singkat:

```text
Browser Admin/Customer -> NestJS API (/v) -> PostgreSQL/PostGIS
                                      \-> Redis/BullMQ -> Worker -> WhatsApp Business
                                      \-> Geocoding provider dan integration outbox
```

## Cara kerja aplikasi

1. Admin mengimpor customer dan alamat master melalui Excel/CSV atau menambahkan satu customer melalui UI.
2. Menu **Campaign Blast** mengambil kandidat secara server-side dengan filter alamat `UNVERIFIED`. Admin dapat memilih sebagian customer atau **Pilih semua eligible** tanpa mengirim jutaan ID ke browser/API.
3. Campaign menyimpan filter dan materialisasi target dilakukan asynchronous oleh worker per batch (`CAMPAIGN_MATERIALIZATION_BATCH_SIZE`). Window default 7 hari tetap tunduk pada daily quota dan rate limit provider.
4. Worker mengirim approved WhatsApp template dengan link unik. Raw token hanya dibuat saat link dikirim dan database hanya menyimpan token ID/hash.
5. Customer membuka link, melihat konteks alamat yang dimasking, mengonfirmasi konteks data/alamat, memberi izin lokasi browser, lalu mengirim 3–5 sampel GPS.
6. Backend memilih sampel dengan akurasi terbaik dan membandingkannya dengan koordinat/alamat referensi menggunakan aturan validasi. Jika valid, alamat diberi `isVerified=true` dan customer menjadi `VERIFIED`.
7. Jika customer belum berada di rumah, customer memilih reminder. Jika alamat berubah, alamat baru disimpan sebagai `PROPOSED` dan wajib lolos verifikasi GPS sebelum alamat lama menjadi historis.

Konfirmasi data/alamat dan izin GPS tetap diperlukan untuk validasi lokasi. Yang tidak lagi diminta oleh aplikasi adalah konfirmasi opt-in WhatsApp tambahan; customer tanpa `whatsappOptInAt` tetap eligible sesuai kebijakan bisnis, sedangkan opt-out aktif selalu memblokir pengiriman.

## Menjalankan

Docker hanya menjalankan dependency dan worker. Frontend/API tetap dijalankan langsung dari host:

```bash
npm install
npm run infra:up
npm run db:migrate
npm run db:seed
npm run infra:worker
```

Development Compose memakai PostgreSQL host port `5433` agar tidak bentrok dengan instalasi PostgreSQL Windows yang umum memakai `5432`. Ubah `$env:POSTGRES_PORT` dan `DATABASE_URL` di `app/server/.env` bersama-sama bila ingin memakai port lain.

Perintah backend akan membuat `app/server/.env` dari `.env.example` jika file tersebut belum ada. Untuk mode production, isi secret dan endpoint provider sendiri; jangan memakai nilai lokal.

Import batch preregistrasi XLSX dijalankan eksplisit setelah migration:

```bash
npm --workspace app/server run import:prereg -- /absolute/path/to/prereg_non_customer_part_001.xlsx
```

Importer memproses batch secara transaksional/idempoten dan streaming per baris, menormalisasi nomor ke E.164, menyimpan customer sebagai `PENDING_INSTALLATION`, tidak mengisi WhatsApp opt-in, dan menyimpan field BTS/coverage tambahan pada `source_metadata`. Upload web ditulis ke file sementara, bukan ditahan sebagai buffer API. Kode pos yang tidak ada di sumber memakai sentinel `00000`; koordinat sumber diberi precision konservatif `STREET` sampai ada metadata precision/provider.

Import customer juga tersedia dari UI melalui menu **Pelanggan & Alamat → Import Excel / CSV**. Upload mendukung `.xlsx` dan `.csv` dengan header report yang sama (`id`, `full_name`, `effective_phone_number`, `effective_address`, `address_reference`, koordinat, wilayah, `created_at`, dan field BTS/coverage), maksimal 50 MB per file. Gunakan beberapa file batch untuk data besar; source ID yang sudah ada akan diperbarui secara idempotent. Import tidak mengubah WhatsApp opt-in.

Akun seed lokal default: `admin@example.com` / `AdminLocalPassword123!`. Ganti dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` sebelum menjalankan seed jika diperlukan. Seed hanya menyiapkan user login; customer/alamat demo tidak dibuat sehingga data asli dapat diimport terpisah.

Terminal terpisah untuk aplikasi:

```powershell
# terminal backend
npm run dev:server

# terminal frontend
npm run dev
```

Worker dijalankan di Docker pada alur hybrid di atas. `npm run dev:worker` tetap tersedia jika ingin menjalankan worker langsung dari host untuk debugging.

Untuk deployment, Compose dipisah agar lifecycle web dan backend dapat dirilis independen. Lihat [deploy/README.md](deploy/README.md), [docker-compose.backend.yml](deploy/docker-compose.backend.yml), dan [docker-compose.frontend.yml](deploy/docker-compose.frontend.yml).

Setelah backend hidup, smoke check PowerShell berikut memvalidasi database, migration, seed, worker, dan `/v1/health` (tidak menghapus volume database):

```powershell
./scripts/local-smoke.ps1
```

Jalankan `./scripts/local-smoke.ps1 -SkipApiCheck` bila hanya ingin memvalidasi database, migration, seed, dan worker sebelum API host dinyalakan.

API tersedia di `http://localhost:3000`, web di `http://localhost:5173`, PostgreSQL di `localhost:5433`, dan Redis di `localhost:6379`.

Link verifikasi menggunakan format opaque `tokenId.secret`. Database hanya menyimpan `tokenId` dan bcrypt hash dari secret; secret mentah hanya hidup saat link dibuat/dikirim. Atur `VERIFICATION_TOKEN_BCRYPT_ROUNDS` (default `12`) sesuai kapasitas worker.

Login UI selalu menggunakan Better Auth melalui API. Gunakan akun seed `admin@example.com` dengan password `AdminLocalPassword123!` atau nilai `SEED_ADMIN_*` yang Anda tentukan sendiri.

## Campaign blast

Admin dapat membuat campaign dari customer belum terverifikasi melalui pilihan per halaman atau filter seluruh eligible. API tidak membuat satu transaksi besar: worker melakukan materialisasi target per `batchSize`, membuat token hanya saat item akan dikirim, lalu mengatur jadwal sepanjang `sendWindowDays`. Status item mencakup `PENDING`, `PROCESSING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `PROVIDER_UNAVAILABLE`, dan `OPTED_OUT`.

Link reminder meminta customer mengonfirmasi apakah masih tinggal di alamat yang sama. Jika alamat berubah, alamat baru berstatus `PROPOSED` sampai lolos validasi GPS. Pilihan reminder tersedia sebagai 1 jam lagi, malam ini, atau besok pagi dan dijadwalkan backend memakai `REMINDER_TIMEZONE`.

## WhatsApp anti-spam guardrails

Mode operasional saat ini menganggap customer hasil import eligible untuk campaign/reminder selama tidak memiliki opt-out aktif, sesuai keputusan bisnis bahwa dasar persetujuan sudah tersedia di luar aplikasi. Customer dapat berhenti melalui keyword `STOP`, `UNSUBSCRIBE`, `BERHENTI`, atau opt-out Admin; setelah itu seluruh campaign/reminder diblokir. Blast dan reminder dikirim sebagai approved template melalui adapter provider, bukan free-form text. Status `whatsappOptInAt` tetap disimpan bila tersedia sebagai metadata historis, tetapi bukan lagi syarat pengiriman.

Default pacing dibuat konservatif: maksimal 2 pesan/detik, cooldown 60 menit per nomor, quota global 10.000 pesan per UTC day, dan circuit breaker membuka jeda 15 menit bila error provider mencapai 30% setelah minimal 50 percobaan. Nilai tersebut adalah guardrail internal, bukan jaminan bebas ban; sebelum produksi tetap perlu memastikan dasar hukum/persetujuan bisnis, template approval Meta, pilot bertahap, webhook delivery/quality monitoring, dan runbook pause. Provider `mekari` sengaja masuk mode disabled sampai adapter, endpoint, credential, template, dan kontrak webhook Qontak dikonfirmasi.

## Deployment production langkah demi langkah

Deployment production menggunakan dua Compose project agar frontend dan backend dapat dirilis terpisah.

### 1. Siapkan server dan secret

Prasyarat production:

- Docker Engine dan Docker Compose.
- Domain publik untuk frontend dan API.
- HTTPS/TLS pada reverse proxy atau load balancer.
- PostgreSQL/PostGIS dan Redis dengan backup, monitoring, dan network private.

Salin konfigurasi deployment dan ganti semua nilai contoh:

```powershell
Copy-Item deploy/.env.example deploy/.env
```

Variabel paling penting:

| Variabel | Kegunaan |
| --- | --- |
| `POSTGRES_*` | Database production dan password |
| `BETTER_AUTH_SECRET` | Secret session admin, minimal 32 karakter random |
| `BETTER_AUTH_URL` | URL API/backend yang digunakan Better Auth |
| `WEB_ORIGIN` | Origin frontend yang diizinkan CORS dan cookie |
| `VITE_API_URL` | URL API publik yang ditanam saat build frontend |
| `WHATSAPP_*` | Provider, endpoint, API key, template, webhook, quota, pacing, dan circuit breaker WhatsApp Business |
| `CAMPAIGN_*` | Ukuran materialisasi, batas batch, queue scan, dan window blast |
| `GEOCODING_*` | Endpoint, API key, timeout, dan retry geocoding |

Jangan gunakan password seed lokal di production dan jangan commit `deploy/.env`.

### 2. Jalankan backend

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yml ps
```

Service `migrate` harus selesai sukses sebelum API dan worker berjalan. Jalankan seed secara eksplisit setelah memeriksa credential:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yml run --rm api node dist/db/seed.js
```

Uji health endpoint:

```bash
curl https://api.example.com/v1/health
```

### 3. Jalankan frontend

`VITE_API_URL` harus berupa URL yang dapat diakses browser, bukan nama service Docker internal.

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.frontend.yml up --build -d
```

Frontend disajikan Nginx pada `WEB_PORT` (default `8080`). Gunakan reverse proxy untuk domain, HTTPS, security header, dan forwarding ke port tersebut. Pastikan `WEB_ORIGIN` identik dengan origin frontend publik.

### 4. Checklist setelah deploy

- `GET /v1/health` mengembalikan status sehat.
- API dapat terhubung ke PostgreSQL/PostGIS dan Redis.
- Worker terlihat aktif dan queue tidak menumpuk.
- Login admin berhasil dengan akun production.
- Import satu file kecil berhasil dan idempotent.
- Geocoding dan WhatsApp provider sudah memiliki credential, template, quota, dan webhook yang benar.
- Campaign kecil/pilot sudah diuji sebelum menaikkan volume.
- PostgreSQL backup dan alert provider sudah aktif.

Detail file deployment tersedia di [deploy/README.md](deploy/README.md). Jangan expose port database/Redis ke internet tanpa firewall dan private network.

## Konfigurasi alur dan provider

Nilai validasi lokasi dapat diubah dari **Validation Settings** atau environment/backend config, termasuk `GPS_MAX_ACCURACY_METERS`, `HOME_RADIUS_METERS`, `STREET_MATCH_THRESHOLD`, `ADDRESS_SCORE_THRESHOLD`, `MAX_LOCATION_ATTEMPTS`, dan `MAX_REMINDERS_PER_SESSION`.

WhatsApp menggunakan template, bukan free-form message. Provider default `disabled`. Untuk adapter HTTP generic/Meta, isi `WHATSAPP_PROVIDER`, `WHATSAPP_BASE_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_TEMPLATE_NAME`, dan `WHATSAPP_TEMPLATE_LANGUAGE`. `WHATSAPP_PROVIDER=mekari` belum mengaktifkan pengiriman sebelum kontrak API Mekari/Qontak tersedia. Tanpa konfigurasi provider valid di production, adapter disabled mengembalikan kegagalan aman dan item campaign menjadi `PROVIDER_UNAVAILABLE`, bukan sukses. Status delivery diterima melalui `POST /v1/webhooks/whatsapp/status` dengan secret webhook.

Geocoding menggunakan `GEOCODING_BASE_URL` dan optional `GEOCODING_API_KEY`, dengan timeout/retry yang dapat diatur. Tanpa provider nyata, proses yang membutuhkan geocoding mengembalikan error provider secara eksplisit; sistem tidak memalsukan koordinat.

## Endpoint utama

Semua endpoint menggunakan prefix `/v1`.

Public customer:

- `GET /public/verifications/:token` — membuka link dan mengambil konteks masked.
- `POST /public/verifications/:token/customer-confirmation` — konfirmasi konteks data/alamat.
- `POST /public/verifications/:token/consent` — izin lokasi browser.
- `POST /public/verifications/:token/location` — mengirim sampel GPS.
- `POST /public/verifications/:token/address-status` — status alamat sama/berubah.
- `POST /public/verifications/:token/address-change` — menyimpan alamat proposed.
- `POST /public/verifications/:token/wait-for-home` — menjadwalkan reminder.

Admin:

- `GET /admin/dashboard` dan `GET /admin/customers`.
- `POST /admin/customers/import` dan `GET /admin/customers/:id`.
- `GET/POST /admin/campaigns` dan `POST /admin/campaigns/:id/start`; POST dapat memakai `customerIds` atau `targetFilter` (`locationStatus`, `status`, `search`).
- `GET /admin/campaigns/:id` serta `/items` dengan pagination.
- `GET /admin/verifications`, `/reminders`, `/audit-logs`, dan `/outbox`.
- `POST /admin/verifications/:id/resend`, `/revoke`, `/reminders`, dan `/review`.

Endpoint customer mendukung pagination, pencarian, status customer, `locationStatus=UNVERIFIED|VERIFIED`, dan cursor UUID untuk pembacaan keyset. Campaign memakai keyset saat materialisasi sehingga browser tidak memuat seluruh data sekaligus.

Perintah verifikasi seluruh workspace:

```bash
npm run lint
npm test
npm run build
```

Frontend tidak memiliki simulator, mock business data, fallback password, atau business state di `localStorage`; `localStorage` hanya digunakan untuk preferensi tema. Backend tidak memalsukan provider eksternal: geocoding mengembalikan `503` sampai adapter nyata dikonfigurasi, sedangkan WhatsApp console hanya tersedia untuk development/test dan provider yang belum dikonfigurasi gagal aman di production.

Lihat [PRD_COMPLIANCE.md](PRD_COMPLIANCE.md) untuk matriks requirement dan gap yang tersisa.
Lihat [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) untuk task tracker P0/P1/P2 dan progress implementasi.
