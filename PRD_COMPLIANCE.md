# PRD compliance audit

Audit ini membedakan capability backend yang sudah tersedia, demo compatibility, dan pekerjaan yang masih membutuhkan provider/infrastruktur eksternal.

## Tersedia

| Area | Implementasi | Status |
| --- | --- | --- |
| Admin authentication | Better Auth handler pada `/v1/api/auth/*`, database session, secure cookie boundary | Backend ready |
| RBAC | `SUPER_ADMIN`, `ADMIN`, `REVIEWER`, `VIEWER` pada guard dan endpoint | Backend ready |
| Public token flow | Opaque token `tokenId.secret`, bcrypt secret hash, TTL, revoke/expiry check, masked context, confirmation, consent | Backend ready |
| GPS evidence | Zod coordinate range, accuracy, timestamp, 3–5 samples, spread consistency | Backend ready |
| Decision rules | Reference precision, hierarchy address, weighted score, radius Haversine engine | Backend ready |
| Persistence | Drizzle schema dan idempotent SQL migration untuk PostgreSQL/PostGIS | Migration lulus pada Docker development |
| Local runtime | Hybrid Compose: PostgreSQL/PostGIS, Redis, worker di Docker; web/API native host | Ready |
| Address change | Forward-geocoding port, proposed address, supersede previous proposal | Backend ready; provider pending |
| Reminder policy | Max 3, unique session/number, scheduled state, cancellation on mismatch/verified | Backend ready |
| Campaign blast | Filter campaign, asynchronous target materialization, per-customer session/item, rate limit, retry, idempotent claim, delivery counters | Implemented; load test dan provider production tetap pending |
| Reminder address check | Link reminder meminta konfirmasi alamat; alamat berubah masuk editing/proposed dan wajib re-verifikasi GPS | Implemented |
| WhatsApp safety | Opt-out suppression, approved-template contract, per-number cooldown, daily quota, Redis rate limit, provider-error circuit breaker, delivery webhook | Implemented untuk normalized contract; adapter/provider Mekari, quality webhook, dan bukti opt-in eksternal tetap perlu divalidasi sebelum production |
| Manual review | Review contract, RBAC, transactional status/address/customer update, audit | Backend ready |
| Integration event | `location.verified.v1`, correlation/idempotency key, durable outbox | Backend ready |
| Worker | Redis/BullMQ outbox, due-reminder queue, campaign materialization/invitation queue, idempotent job claim, retryable job boundary, status update | Implemented; horizontal scaling/load test dan provider nyata pending |
| Safe adapters | Disabled geocoder returns explicit `503`; console WhatsApp adapter makes no external call | Safe local mode |
| Frontend integration | `app/web`, public `/v/:token`, confirmation/consent/3 GPS samples/mismatch/wait/retry/address proposal/result, reminder address check, campaign monitoring | Implemented; provider and browser E2E remain external/pending |
| Deployment layout | Development hybrid Compose plus independent backend/frontend deployment Compose files | Ready |
| Regression tests | Web API-client/GPS evidence tests plus server contract, configuration, adapter, engine, state, reminder, null-reference, and filter-contract tests | 27 tests passing; campaign HTTP/provider integration and Playwright production browser run pending |

## Masih perlu diselesaikan untuk production complete

| Priority | Requirement | Gap |
| --- | --- | --- |
| P0 | Fresh database verification | Lulus pada PostgreSQL/PostGIS Docker development; production database tetap perlu dijalankan di environment deploy |
| P1 | Web/API integration | Implemented API-only; smoke browser terhadap DB nyata masih pending |
| P1 | API integration/E2E | Local HTTP smoke tersedia; Playwright critical scenarios dan Testcontainers masih pending |
| P1 | Geocoding | Adapter provider nyata, timeout/retry, quota, confidence/precision mapping |
| P1 | WhatsApp | Provider nyata, template approval, delivery callback, retry/dead-letter policy |
| P1 | WhatsApp quality monitoring | Delivery/read/quality/template/account webhook dan automatic campaign pause belum terhubung ke payload provider nyata |
| P1 | Campaign scale/import | Target filter dan materialisasi keyset per batch sudah tersedia; orkestrasi multi-file, load test 5–10 juta, backup, dan capacity planning tetap pekerjaan operasional |
| P2 | Observability | OpenTelemetry/Sentry/metrics exporter dan dashboards |
| P2 | IRA/ticketing | Port dan disabled adapter tersedia; credentials/contract integration belum diaktifkan |

## Catatan keamanan

- Raw public token tidak disimpan di database backend, frontend session, reminder record, atau log aplikasi.
- Secret public token di-hash dengan bcrypt; `tokenId` hanya menjadi locator indeks dan bukan secret yang dapat membuka sesi.
- Resend merotasi token dengan token baru; token lama menjadi invalid karena hash diganti.
- Console WhatsApp hanya untuk development/test; production tanpa provider nyata ditolak dengan status provider unavailable.
- `WHATSAPP_PROVIDER=mekari` tidak memakai payload generic secara diam-diam; pengiriman tetap disabled sampai adapter Mekari/Qontak dikonfigurasi.
