# Deployment IRA Preregist

## Satu host (default)

Ikuti [README utama](../README.md#deploy-dengan-docker-compose): salin `.env.example` ke `.env` di root, isi secret/domain, lalu jalankan `docker compose up --build -d`.

`docker-compose.yaml` menjadi sumber konfigurasi stack lengkap. `docker-compose.prod.yaml` hanya entry point kompatibilitas melalui [Compose include](https://docs.docker.com/compose/how-tos/multiple-compose-files/include/); tidak ada salinan stack production kedua yang harus dipelihara.

Untuk tetap menyimpan environment di `deploy/.env`:

```powershell
Copy-Item deploy/.env.example deploy/.env
# Edit secret, domain, dan akun admin terlebih dahulu.
docker compose --env-file deploy/.env -f docker-compose.prod.yaml up --build -d
```

Template tersebut menetapkan `COMPOSE_ENV_FILE=./deploy/.env`, sehingga konfigurasi provider juga masuk ke container. Jika menggunakan file lain, set `COMPOSE_ENV_FILE` ke lokasi file itu; `--env-file` saja hanya mengatur substitusi Compose.

Web Nginx meneruskan `/v1` langsung ke API pada network Docker. Untuk domain publik, reverse proxy HTTPS meneruskan request ke `WEB_PORT`, mempertahankan Host dan `X-Forwarded-Proto`. Set `WEB_ORIGIN` dan `BETTER_AUTH_URL` ke origin publik yang sama. `TRUST_PROXY` mengikuti jumlah proxy terpercaya di depan API. Port `API_PORT` tersedia untuk deployment yang membutuhkan domain API terpisah.

Startup memakai [healthcheck dan dependency completion](https://docs.docker.com/compose/how-tos/startup-order/): database siap → migration selesai → bootstrap admin selesai → API/worker aktif → gateway/web aktif. Service `migrate` dan `seed` selesai dengan exit code 0; keduanya bukan daemon.

## Operasional dan upgrade

```bash
docker compose ps -a
docker compose logs --tail=100 migrate seed api
docker compose logs -f campaign-worker messaging-worker import-worker

# Terapkan build, migration baru, dan restart service yang berubah
docker compose up --build -d

# Hentikan service tanpa menghapus named volume
docker compose down
```

Backup database sebelum upgrade. Contoh berikut menulis backup di dalam container agar output biner tidak rusak oleh redirection PowerShell:

```bash
docker compose exec postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/ira_preregist.dump'
docker compose cp postgres:/tmp/ira_preregist.dump ./ira_preregist.dump
```

Simpan backup di luar host dan backup juga volume import yang masih memiliki pekerjaan pending. Uji restore di database terpisah. Jangan menjalankan `docker compose down -v` pada data aktif.

Saat upgrade dari konfigurasi lama:

1. Selesaikan antrean import/pengiriman dengan worker versi sebelumnya, lalu hentikan stack lama. Nama antrean baru memakai prefix `ira_preregist`; job Redis lama tidak dipindahkan otomatis.
2. Pertahankan `COMPOSE_PROJECT_NAME`, `POSTGRES_DB`, `POSTGRES_USER`, password, dan volume yang sudah dipakai jika ingin menggunakan database yang sama. Penggantian default nama di repository tidak menjalankan rename database/role/volume yang sudah ada. Instalasi baru memakai `ira_preregist`.
3. Jika ingin mengganti identitas database dan project lama, lakukan backup/restore secara terencana ke stack baru. Jangan menghapus volume lama sebelum data hasil restore diperiksa.
4. Periksa nama/ID template Qontak: perubahan nama di kode tidak mengubah template provider yang sudah disetujui.
5. Jalankan stack baru, cek `/v1/health`, login, dan uji satu import kecil sebelum melanjutkan campaign.

Bootstrap otomatis memakai `seed --if-missing` dan mempertahankan password/role pengguna yang sudah ada. Perintah manual `docker compose run --rm api node dist/db/seed.js` adalah reseed eksplisit yang memperbarui password dan role akun sesuai `SEED_ADMIN_*`; gunakan hanya saat memang ingin mereset akun tersebut.

## Frontend/backend terpisah (opsional)

File split dipertahankan untuk rilis independen atau host berbeda. Gunakan URL API publik, bukan nama service Docker:

```dotenv
BETTER_AUTH_URL=https://api.example.com
WEB_ORIGIN=https://app.example.com
VITE_API_URL=https://api.example.com/v1
```

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yaml up --build -d
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yaml run --rm api node dist/db/seed.js --if-missing
docker compose --env-file deploy/.env -f deploy/docker-compose.frontend.yaml up --build -d
```

Split backend memiliki migration otomatis dan seed eksplisit. Split frontend menggunakan `app/web/nginx.conf` untuk static SPA; konfigurasi proxy satu origin hanya dipasang oleh stack lengkap. PostgreSQL/Redis split hanya bind ke loopback host. Atur CORS, HTTPS, dan domain sesuai kedua origin tersebut.

Worker dipisah berdasarkan peran: maintenance, campaign, messaging, dan import. Mulai dengan kapasitas kecil, lalu atur replica setelah mengukur koneksi PostgreSQL dan beban Redis. Hitung total `jumlah proses × DATABASE_POOL_MAX`; kuota WhatsApp tetap global melalui Redis.

## Pemeriksaan masalah umum

- **`migrate` gagal:** periksa koneksi dan log SQL. PostgreSQL internal Compose memakai `DATABASE_SSL=false`; database eksternal ber-TLS dapat memakai `DATABASE_SSL=true` dengan sertifikat tepercaya.
- **Login gagal:** periksa URL publik dan akun seed; perubahan `.env` tidak mereset akun yang sudah ada saat bootstrap otomatis.
- **Upload gagal:** cek ukuran maksimal 50 MB, log API/import worker, dan shared volume `prod_imports` yang harus dapat ditulis user `node`.
- **WhatsApp tidak terkirim:** cek provider, credential HMAC, channel/template ID, kuota, dan opt-out; default production memang `disabled`.
- **GPS tidak tersedia:** gunakan HTTPS atau localhost dan berikan izin lokasi browser.
