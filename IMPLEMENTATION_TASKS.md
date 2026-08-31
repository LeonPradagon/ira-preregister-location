# Exact Location Customer Validation - implementation tracker

Tracker ini mengikuti dependency dan priority scale pada PRD v0.6.

- **P0 - blocking:** tanpa ini platform tidak aman atau tidak dapat dijalankan.
- **P1 - core MVP:** alur verifikasi customer dan operasi Admin harus selesai.
- **P2 - hardening:** production operations dan integrasi lanjutan.

Status checklist menunjukkan kondisi repository saat ini. Item provider/infrastruktur sengaja tetap unchecked sampai environment nyata tersedia.

## P0 - platform foundation

- [x] Monorepo boundary: `app/web`, `app/server`, dan `packages` workspace.
- [x] Environment validation, safe error boundary, correlation ID, dan `/v1/health`.
- [x] Drizzle schema untuk Better Auth, customer, address, verification session, GPS capture, result, review, reminder, audit, outbox, dan integration config.
- [x] Idempotent SQL migration yang membuat seluruh tabel, PostGIS/pgcrypto extension, spatial index, unique key, dan core constraints.
- [x] Docker Compose hybrid untuk PostgreSQL/PostGIS, Redis, dan worker; web/API dijalankan langsung dari host.
- [x] Deployment Compose dipisah menjadi backend stack dan frontend static web stack.
- [x] Better Auth boundary, database session, HttpOnly-cookie boundary, authentication guard, dan RBAC guard.
- [x] Local seed command untuk Super Admin saja; customer/alamat/config bisnis diimport dari sumber data asli.
- [x] Jalankan migration pada PostgreSQL/PostGIS Docker development dan simpan hasil smoke check `/v1/health`.

## P1 - core MVP

- [x] Server-side coordinate validation: range, accuracy, timestamp, 3-5 samples, dan sample spread consistency.
- [x] Public token API: context/status, customer confirmation, consent, GPS submit, wait-for-home, address change, dan reminder.
- [x] Public reminder address check: customer mengonfirmasi alamat masih sama atau memulai address editing sebelum re-verifikasi.
- [x] Admin API: me, customer, verification, resend/rotate token, manual review, reminders, audit, settings, dan integrations.
- [x] Campaign API: create/start/list/detail/items dengan batch limit, delivery status per customer, dan validasi target tanpa opt-out aktif.
- [x] Campaign target discovery: filter server-side untuk alamat `UNVERIFIED`, pagination kandidat, serta seleksi lintas halaman tanpa memuat seluruh dataset ke browser.
- [x] Campaign scale path: target filter, materialisasi asynchronous berbasis cursor, batch schedule window, dan pagination campaign items.
- [x] Verification state machine dengan transition policy dan invalid-transition response.
- [x] Reminder policy maksimal 3 per session, unique session/number, schedule state, dan cancellation rules.
- [x] Transactional verification flow: capture + result + session + verified address/customer + audit + outbox.
- [x] Integration ports: geocoding, WhatsApp, dan safe disabled/console adapters.
- [x] Frontend API client boundary dengan `VITE_API_URL`, pagination server-side, filter target campaign, dan public `/v/:token` route compatibility.
- [x] Public customer page API-only pada `/v/:token`: confirmation, consent, 3 GPS samples, mismatch, wait/retry, proposed address, dan server result.
- [x] Tampilkan status verifikasi GPS pada daftar customer dan detail alamat berdasarkan `isVerified`/`LOCATION_VALID`.
- [x] Sambungkan seluruh React UI ke API server; localStorage hanya menyimpan preferensi tema.
- [x] Tambahkan executable local HTTP integration smoke public/admin terhadap PostgreSQL/PostGIS dan Redis (`scripts/local-smoke.ps1`).
- [ ] Tambahkan Playwright critical scenarios: confirmation, consent, 3 GPS samples, mismatch, retry, reminder #4 blocked, proposed address, dan manual review.

## P2 - production hardening and future integrations

- [x] Durable Redis/BullMQ workers: pending outbox polling, idempotent event job ID, due-reminder queue, WhatsApp adapter dispatch, retry boundary, dan status update.
- [x] Campaign invitation worker: asynchronous batch dispatch, rate limit, retry, idempotent claim, dan counter campaign.
- [x] Delivery status webhook contract, status `DELIVERED`/`READ`/`PROVIDER_UNAVAILABLE`, dan provider message ID tanpa fallback idempotency sebagai sukses.
- [x] Large-file upload path: disk temporary upload dan streaming row ingestion untuk XLSX/CSV.
- [x] WhatsApp safety guardrails: opt-out suppression, approved-template payload, per-number cooldown, daily quota, dan provider-error circuit breaker. Gate opt-in aplikasi dinonaktifkan sesuai kebijakan bisnis; dasar persetujuan tetap menjadi tanggung jawab proses bisnis/provider.
- [x] `location.verified.v1` event contract dengan event ID, correlation ID, dan idempotency key.
- [x] Safe operational hooks: structured health response, correlation header, domain error code, dan no raw token audit.
- [x] IRA coverage dan ticketing ports beserta disabled adapters.
- [ ] Konfigurasikan provider geocoding nyata, timeout/retry, quota handling, dan precision/confidence mapping.
- [ ] Konfigurasikan WhatsApp provider nyata, approved template, callback delivery, retry, dan dead-letter handling.
- [ ] Hubungkan webhook quality/template/account provider nyata dan automatic pause/resume campaign.
- [ ] Tambahkan OpenTelemetry/Sentry/metrics exporter dan dashboard operasional.
- [ ] Tambahkan Testcontainers suite untuk PostgreSQL/PostGIS dan Redis/BullMQ.

## Current progress

**33 / 39 tasks complete (85%); remaining items are explicitly external/pending**

Kode P0/P1/P2 yang dapat divalidasi lokal sudah dibuat dan typed. Campaign filter/materialization, keyset customer path, disk/stream import, delivery status contract, migration, seed login-only, worker, dan bcrypt token hashing sudah typed serta diuji lokal. Sisa pekerjaan berada pada Playwright browser E2E, provider Mekari/credential/contract nyata, observability production, load test 5–10 juta, dan Testcontainers CI.

## Validation commands

```bash
npm install
npm run lint
npm test
npm run build
docker compose config
docker compose --env-file deploy/.env.example -f deploy/docker-compose.backend.yml config
docker compose --env-file deploy/.env.example -f deploy/docker-compose.frontend.yml config
npm run infra:up
npm run db:migrate
npm run db:seed
npm run infra:worker
./scripts/local-smoke.ps1
```

Hasil smoke terakhir: PostgreSQL healthy di `localhost:5433`, Redis `PONG`, worker `Up`, `/v1/health` `200`, Better Auth/Admin API lulus, public verification lulus, dan reminder ke-4 ditolak.

## Definition of done per priority

P0 selesai ketika database fresh berhasil migrate dan `/v1/health` merespons `ok`.

P1 selesai ketika UI memakai API, seluruh critical scenarios lulus integration/E2E, dan tidak ada localStorage sebagai source of truth. Implementasi frontend API-only sudah selesai; E2E masih pending.

P2 selesai ketika provider nyata, monitoring, retry/dead-letter, dan Testcontainers CI sudah dikonfigurasi.
