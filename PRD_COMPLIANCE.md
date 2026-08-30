# PRD compliance audit

Audit ini membedakan capability backend yang sudah tersedia, demo compatibility, dan pekerjaan yang masih membutuhkan provider/infrastruktur eksternal.

## Tersedia

| Area | Implementasi | Status |
| --- | --- | --- |
| Admin authentication | Better Auth handler pada `/v1/api/auth/*`, database session, secure cookie boundary | Backend ready |
| RBAC | `SUPER_ADMIN`, `ADMIN`, `REVIEWER`, `VIEWER` pada guard dan endpoint | Backend ready |
| Public token flow | Hash SHA-256, TTL, revoke/expiry check, masked context, confirmation, consent | Backend ready |
| GPS evidence | Zod coordinate range, accuracy, timestamp, 3–5 samples, spread consistency | Backend ready |
| Decision rules | Reference precision, hierarchy address, weighted score, radius Haversine engine | Backend ready |
| Persistence | Drizzle schema dan idempotent SQL migration untuk PostgreSQL/PostGIS | Migration lulus pada Docker development |
| Local runtime | Hybrid Compose: PostgreSQL/PostGIS, Redis, worker di Docker; web/API native host | Ready |
| Address change | Forward-geocoding port, proposed address, supersede previous proposal | Backend ready; provider pending |
| Reminder policy | Max 3, unique session/number, scheduled state, cancellation on mismatch/verified | Backend ready |
| Manual review | Review contract, RBAC, transactional status/address/customer update, audit | Backend ready |
| Integration event | `location.verified.v1`, correlation/idempotency key, durable outbox | Backend ready |
| Worker | Redis/BullMQ outbox dan due-reminder queue, idempotent job claim, retryable job boundary, status update | Redis/worker lulus pada Docker development |
| Safe adapters | Disabled geocoder returns explicit `503`; console WhatsApp adapter makes no external call | Safe local mode |
| Frontend integration | `app/web`, public `/v/:token` backend mode, confirmation/consent/3 GPS samples/wait/retry/result, Admin API mode | Ready when `VITE_API_MODE=true`; localStorage remains demo fallback only |
| Deployment layout | Development hybrid Compose plus independent backend/frontend deployment Compose files | Ready |
| Regression tests | Web validation/API-client tests plus server contract, configuration, adapter, engine, state, and reminder tests | 24 tests passing + HTTP smoke lulus |

## Masih perlu diselesaikan untuk production complete

| Priority | Requirement | Gap |
| --- | --- | --- |
| P0 | Fresh database verification | Lulus pada PostgreSQL/PostGIS Docker development; production database tetap perlu dijalankan di environment deploy |
| P1 | Web/API integration | API mode sudah mencakup auth, Admin data, customer creation, verification actions, review, reminders, settings, integrations, and outbox; perlu smoke browser terhadap DB nyata |
| P1 | API integration/E2E | Local HTTP smoke public/admin sudah tersedia; Testcontainers PostgreSQL/PostGIS/Redis dan Playwright critical scenarios masih perlu dijalankan |
| P1 | Geocoding | Adapter provider nyata, timeout/retry, quota, confidence/precision mapping |
| P1 | WhatsApp | Provider nyata, template approval, delivery callback, retry/dead-letter policy |
| P2 | Observability | OpenTelemetry/Sentry/metrics exporter dan dashboards |
| P2 | IRA/ticketing | Port dan disabled adapter tersedia; credentials/contract integration belum diaktifkan |

## Catatan keamanan

- Raw public token tidak disimpan di database backend dan tidak ditulis ke audit log.
- Resend merotasi token dengan token baru; token lama menjadi invalid karena hash diganti.
- Demo UI masih menyimpan token raw agar simulator dapat digunakan offline. Jangan memakai demo adapter sebagai deployment produksi.
