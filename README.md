# Exact Location Customer Validation

Monorepo untuk platform verifikasi lokasi customer berdasarkan PRD v0.6.

Struktur utama:

- `app/web`: React/Vite UI dan simulator demo yang sudah ada.
- `app/server`: NestJS API, Better Auth, Drizzle/PostgreSQL/PostGIS, state machine, validation engine, outbox, dan worker BullMQ.
- `packages`: reserved untuk shared contracts/adapters lintas aplikasi.

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

Akun seed lokal default: `admin@example.com` / `AdminLocalPassword123!`. Ganti dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` sebelum menjalankan seed jika diperlukan.

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

Mode demo UI menggunakan salah satu email pada daftar akun dan kata sandi:

```text
demo-password
```

Mode API menggunakan akun seed Better Auth `admin@example.com` dengan password `AdminLocalPassword123!` atau nilai `SEED_ADMIN_*` yang Anda tentukan sendiri.

Perintah verifikasi seluruh workspace:

```bash
npm run lint
npm test
npm run build
```

UI simulator masih memakai `localStorage` agar demo dapat berjalan tanpa kredensial provider. Backend tidak memalsukan provider eksternal: geocoding mengembalikan `503` sampai adapter nyata dikonfigurasi, sedangkan WhatsApp lokal hanya mencatat safe console adapter.

Lihat [PRD_COMPLIANCE.md](PRD_COMPLIANCE.md) untuk matriks requirement dan gap yang tersisa.
Lihat [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) untuk task tracker P0/P1/P2 dan progress implementasi.
