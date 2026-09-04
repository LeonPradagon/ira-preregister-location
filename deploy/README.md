# Deployment Compose

Deployment sengaja dipisah menjadi dua Compose project:

- `docker-compose.backend.yml`: API NestJS, worker, PostgreSQL/PostGIS, Redis, dan migration runner.
- `docker-compose.frontend.yml`: static React build melalui Nginx.

Gunakan file `.env` deployment yang tidak di-commit. Contoh variabel tersedia di `.env.example`.

## Backend

```powershell
Copy-Item deploy/.env.example deploy/.env
# Edit deploy/.env: replace database, Better Auth, and seed credentials first.
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yml up --build -d \
  --scale api=3 --scale campaign-worker=2 --scale messaging-worker=2
docker compose --env-file deploy/.env -f deploy/docker-compose.backend.yml run --rm api node dist/db/seed.js
```

Migration dijalankan oleh service `migrate` sebelum API dan worker menjadi healthy. Seed hanya dijalankan eksplisit setelah secret dan akun admin production ditentukan.

`api-gateway` meneruskan traffic ke replica API. Worker dipisah berdasarkan queue: `campaign-worker`, `messaging-worker`, `import-worker`, dan `worker` untuk recovery/reconciliation. Migration `0003_production_indexes.sql` berjalan di luar transaction dan membuat index satu per satu dengan `CREATE INDEX CONCURRENTLY`; jalankan di staging dan pantau `pg_stat_progress_create_index` sebelum production.

Budget koneksi default dihitung untuk 10 proses (`DATABASE_POOL_MAX=5`, sekitar 50 koneksi) dan masih menyisakan headroom PostgreSQL. Jika jumlah replica diubah, hitung ulang total `replica × pool maksimum` sebelum menaikkan nilai tersebut.

## Frontend

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.frontend.yml up --build -d
```

`VITE_API_URL` harus menggunakan URL API publik yang dapat diakses browser. Frontend dan backend dapat berada di host atau cluster berbeda; integrasinya melalui URL tersebut dan CORS `WEB_ORIGIN`.
