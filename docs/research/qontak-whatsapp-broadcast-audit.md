# Audit Integrasi WhatsApp Broadcast Qontak

Tanggal audit: 2026-09-09

## Kesimpulan

Implementasi pengiriman direct broadcast sudah sesuai dengan kontrak request Qontak/Mekari untuk template berbasis body. Namun, integrasi end-to-end belum dapat dianggap sepenuhnya sesuai karena konfigurasi webhook dan korelasi ID delivery masih perlu dipastikan.

## Yang sudah sesuai

| Area | Implementasi aplikasi | Status |
| --- | --- | --- |
| Endpoint | `https://api.mekari.com/qontak/chat/v1/broadcasts/whatsapp/direct` | Sesuai |
| Autentikasi | HMAC `date` + `request-line`, `Authorization`, dan `Digest` SHA-256 untuk POST | Sesuai |
| Nomor tujuan | Dinormalisasi menjadi format internasional tanpa tanda `+`, misalnya `628...` | Sesuai |
| Template | Mengirim `message_template_id`, `channel_integration_id`, dan `language.code` | Sesuai |
| Body variable | Mengirim `key`, `value`, dan `value_text`; konfigurasi saat ini `name,link` | Sesuai untuk template body dengan dua variable |
| Pengiriman asynchronous | Queue BullMQ, worker campaign, retry, circuit breaker, dan rate limit internal | Sesuai sebagai kontrol aplikasi |

Implementasi terkait berada di [mekari-whatsapp.adapter.ts](../../app/server/src/integrations/whatsapp/mekari-whatsapp.adapter.ts), [mekari-hmac.ts](../../app/server/src/integrations/whatsapp/mekari-hmac.ts), dan [worker.ts](../../app/server/src/worker.ts).

## Gap dan risiko

1. `parameters.buttons` selalu dikirim sebagai array kosong. Ini benar untuk template body-only atau CTA static/quick reply tertentu, tetapi tidak cukup untuk template CTA URL dinamis. Jika template Qontak memiliki dynamic URL button, payload harus mengirim item button dengan `index`, `type`, dan value suffix URL sesuai template.

2. Response broadcast disimpan sebagai `providerMessageId`. Dokumentasi Qontak juga menyediakan endpoint log berdasarkan **broadcast ID**, sedangkan log per penerima memuat `whatsapp_message_id`. Aplikasi belum memanggil endpoint log tersebut dan webhook parser hanya mengenali payload custom atau format Meta `entry.changes.value.statuses[].id`. Akibatnya, status delivery dapat diterima tetapi tidak match ke campaign item bila provider mengirim WhatsApp message ID atau format Qontak lain.

3. Endpoint webhook aplikasi mewajibkan header custom `x-whatsapp-webhook-secret`, tetapi webhook Qontak belum didaftarkan oleh aplikasi. Environment development yang diperiksa juga belum memiliki `WHATSAPP_WEBHOOK_SECRET`, sehingga endpoint status/inbound akan menolak callback dengan `401` sampai secret dan konfigurasi provider disiapkan.

4. Konfigurasi opt-in sudah disimpan dan opt-out memblokir pengiriman, tetapi aplikasi tidak memverifikasi ulang status opt-in terhadap Qontak/Meta. Pastikan data consent bisnis memang valid sebelum production blast.

## Checklist sebelum production

- Pastikan HMAC application memiliki scope `qontak-chat:all` dan credential hanya disimpan di secret manager.
- Pastikan dua template yang dipakai berstatus approved, bahasa `id`, dan urutan variable benar-benar `name,link`.
- Pastikan kedua template bukan dynamic CTA URL; jika iya, tambahkan payload `buttons`.
- Daftarkan webhook status dan inbound di Qontak, gunakan URL HTTPS publik, set `WHATSAPP_WEBHOOK_SECRET`, lalu kirim sample callback.
- Uji satu nomor dan cocokkan tiga hal: response broadcast ID, log Qontak per penerima, dan status item di dashboard aplikasi.
- Tambahkan polling/fallback broadcast log atau mapping `broadcast ID -> whatsapp_message_id` sebelum mengandalkan status delivery untuk laporan final.

## Sumber primer

- [Qontak WhatsApp Outbound Message Direct API](https://raw.githubusercontent.com/mekari-engineering/qontak-api-js/main/WhatsAppBroadcastAPI.md)
- [Mekari HMAC Authentication](https://developers.mekari.com/docs/kb/hmac-authentication)
- [Qontak API documentation](https://docs.qontak.com/)
- [Qontak Postman collection: direct broadcast and broadcast log](https://www.postman.com/qbl-playground/public/documentation/fdwjdst/qontak-omnichannel-api-mekari-com)
