# Riset Pengurangan Risiko Spam/Ban WhatsApp Business Platform

Tanggal riset: 2026-08-31  
Ruang lingkup: outbound WhatsApp untuk verifikasi lokasi customer, termasuk blast awal dan maksimal tiga reminder.  
Sumber: dokumentasi dan kanal resmi Meta/WhatsApp Business Platform. Kebijakan Meta dapat berubah; lakukan review ulang sebelum production launch.

## Kesimpulan singkat

Tidak ada angka pengiriman atau desain teknis yang dapat menjamin akun tidak akan dibatasi atau diblokir. Risiko terbesar berasal dari penerima yang tidak mengharapkan pesan, opt-in yang tidak dapat dibuktikan, pesan yang tidak relevan, template yang tidak sesuai tujuan, block/report, dan kegagalan merespons sinyal kualitas.

Untuk aplikasi ini, kontrol minimum sebelum blast production adalah:

1. Kirim hanya kepada customer yang memiliki bukti opt-in WhatsApp yang sah dan belum opt-out.
2. Gunakan WhatsApp Business Platform/Cloud API resmi dan template yang sudah disetujui; jangan mengandalkan plain-text HTTP adapter.
3. Sampaikan identitas bisnis, alasan verifikasi lokasi, ekspektasi jumlah pesan, dan cara berhenti menerima pesan.
4. Mulai dari pilot kecil, gunakan pacing konservatif yang dapat dihentikan, dan naikkan volume hanya berdasarkan delivery/read dan quality signal yang sehat.
5. Terima dan proses webhook delivery, failure, quality update, template status, serta ban/account update sebelum melanjutkan campaign.
6. Otomatis pause untuk opt-out, error/failure tinggi, quality downgrade/flagged, template pause/reject, WABA/phone disable, atau anomali block/report.

## Temuan sumber resmi

### 1. Opt-in adalah prasyarat outbound

Kebijakan WhatsApp Business menyatakan bisnis hanya boleh menghubungi seseorang jika bisnis telah menerima nomor ponselnya dan izin opt-in bahwa penerima ingin menerima pesan berikutnya melalui WhatsApp. Opt-in harus secara jelas menyebut penerima setuju menerima pesan WhatsApp dan menyebut nama bisnis. Bisnis juga bertanggung jawab memastikan metode consent memenuhi hukum yang berlaku.

Sistem harus menyimpan bukti consent, minimal `opted_in_at`, sumber/cara consent, teks atau versi notice yang disetujui, identitas bisnis yang ditampilkan, dan jejak perubahan status. Memiliki nomor telepon di database saja bukan bukti opt-in.

Sumber primer: [Kebijakan Berkirim Pesan WhatsApp Business - Bahasa Indonesia](https://business.whatsapp.com/policy/preview?lang=id_ID), bagian “Menciptakan Pengalaman yang Berkualitas”.

### 2. Opt-out wajib dihormati dari dalam maupun luar WhatsApp

Kebijakan yang sama mewajibkan bisnis menghormati permintaan untuk memblokir, menghentikan, atau menolak komunikasi, baik permintaan disampaikan di WhatsApp maupun melalui kanal lain. Penerima harus dihapus dari daftar kontak yang dikirimi pesan.

Implementasi yang disarankan:

- Tambahkan quick reply atau instruksi yang jelas seperti `STOP`/`BERHENTI` pada template yang diajukan, sepanjang disetujui Meta.
- Sediakan endpoint/webhook handler untuk mencatat opt-out dari tombol, pesan bebas, customer service, atau import suppression list.
- Terapkan suppression check atomik tepat sebelum enqueue dan tepat sebelum provider send; campaign item yang telah opt-out tidak boleh berubah menjadi `SENT`.
- Hentikan seluruh undangan lanjutan dan reminder untuk nomor tersebut, termasuk campaign lain, sampai customer melakukan opt-in ulang dengan bukti baru.

Sumber primer: [Kebijakan Berkirim Pesan WhatsApp Business - Bahasa Indonesia](https://business.whatsapp.com/policy/preview?lang=id_ID).

### 3. Blast awal dan reminder di luar jendela 24 jam harus berupa template approved

Untuk Platform WhatsApp Business, percakapan yang dimulai bisnis hanya boleh dimulai dengan Message Template yang telah disetujui. Di dalam customer service window 24 jam setelah pesan terakhir dari user, bisnis dapat membalas tanpa template; di luar window tersebut template approved kembali diperlukan.

Konsekuensi untuk alur verifikasi lokasi:

- Undangan blast awal harus memakai template approved.
- Reminder yang dikirim kemudian juga harus memakai template approved karena user belum tentu mengirim pesan dalam 24 jam terakhir.
- Template harus digunakan hanya untuk tujuan yang diajukan. Jangan memakai template marketing/promosi untuk pesan verifikasi operasional.
- Parameter template harus diisi server-side dari session yang tepat; jangan membentuk pesan bebas dengan raw token tanpa kontrak provider.
- Template harus menjelaskan nama bisnis, tujuan verifikasi, link unik, perkiraan tindakan user, dan kanal bantuan.

Sumber primer: [Kebijakan Berkirim Pesan WhatsApp Business - Bahasa Indonesia](https://business.whatsapp.com/policy/preview?lang=id_ID); [Meta WhatsApp Business Platform - Send Message Template Interactive](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive); [Meta WhatsApp Business Platform - Templates](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates).

### 4. Quality rating dan feedback penerima harus menjadi circuit breaker

Meta menyatakan penerima dapat memblokir atau melaporkan bisnis dan sistem dapat membatasi bisnis yang kualitasnya rendah dalam periode yang panjang. Meta juga menyediakan feedback dan metrik seperti read rate untuk membantu menentukan frekuensi agar penerima tidak overload. Pelanggaran berulang dapat menyebabkan pembatasan yang meningkat durasi dan tingkat keparahannya.

Jangan menunggu akun diban. Sistem operasional harus memiliki threshold internal dan pause otomatis. Threshold berikut adalah guardrail internal, bukan angka resmi Meta:

- `FLAGGED`, quality downgrade, template flagged/disabled/rejected, atau WABA/phone disable: hentikan campaign dan reminder baru.
- Failure provider, block/report, atau opt-out melonjak dibanding baseline pilot: hentikan batch aktif dan lakukan review.
- Delivery/read turun material setelah kenaikan volume: kembalikan ke pacing sebelumnya.
- Setiap kampanye harus dapat di-pause tanpa membatalkan atau mengubah histori delivery.

Sumber primer: [Meta - Ways to Manage Your Businesses Chats on WhatsApp](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/); [Meta guide - How to Monitor Quality Signals](https://developers.facebook.com/docs/whatsapp/guides/how-to-monitor-quality-signals); [Meta WhatsApp Business Platform - Webhook Components](https://www.postman.com/meta/whatsapp-business-platform/request/j09tht8/components).

### 5. Tidak ada “safe blasting speed” universal yang dipublikasikan

Cloud API memiliki throughput teknis dan beberapa jenis rate limit, tetapi throughput teknis bukan rekomendasi volume aman untuk spam/quality. Koleksi resmi Meta menyebut Cloud API mendukung hingga 80 messages per second secara default dengan automatic upgrade hingga 1.000 messages per second, serta membedakan Business Use Case rate limit, messaging limit/quality rating, capacity rate limit, dan business phone rate limit.

Artinya, `10 messages/second` pada aplikasi bukan jaminan aman, dan menaikkan angka hanya karena API mampu menerima lebih banyak tidak tepat. Pacing harus mempertimbangkan kualitas penerima, hasil pilot, provider limit aktual, zona waktu, dan kemampuan customer service.

Guardrail yang direkomendasikan untuk campaign aplikasi ini:

- Mulai dengan pilot yang dapat diawasi, misalnya satu segmen kecil yang benar-benar opt-in; angka pilot adalah keputusan operasional internal, bukan batas Meta.
- Gunakan queue dengan rate limit per WABA/phone number, concurrency terbatas, exponential backoff untuk error yang retryable, dan dead-letter state untuk error yang tidak boleh diulang.
- Jangan retry opt-out, invalid recipient, template rejected/paused, policy error, atau account/phone disabled.
- Hindari pengiriman serentak ke seluruh 1,5 juta nomor. Pecah berdasarkan batch, zona waktu Indonesia, dan hasil kualitas batch sebelumnya.
- Jangan menjadwalkan blast atau reminder pada jam lokal yang tidak wajar. Jika customer memilih reminder, kirim hanya pada satu waktu terpilih dan jangan membuat reminder tambahan di luar policy aplikasi.
- Terapkan global per-recipient cooldown agar customer tidak menerima campaign baru saat session verifikasi atau reminder masih aktif.

Pacing adaptif di atas adalah inferensi engineering dari batas dan feedback Meta, bukan janji bahwa volume tertentu bebas ban.

Sumber primer: [Meta WhatsApp Business Platform - Cloud API overview, throughput, and rate limits](https://www.postman.com/universal-escape-345034/public/documentation/az6oggm/whatsapp-cloud-api?entity=request-17878056-c067ba18-46a8-42cf-82d9-021b4e010793); [Meta documentation - WhatsApp Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits); [Meta documentation - WhatsApp API Rate Limits](https://developers.facebook.com/docs/whatsapp/api/rate-limits); [Meta - Ways to Manage Your Businesses Chats on WhatsApp](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/).

### 6. Webhook delivery wajib menjadi sumber status provider

Respons send yang diterima API hanya membuktikan request diterima provider, bukan bahwa pesan delivered atau read. Koleksi resmi Meta menjelaskan pesan memiliki ID unik dan status dapat dilacak melalui Webhooks. Webhook WhatsApp juga mencakup update kualitas nomor, perubahan status template, serta status WABA/ban pada payload terkait.

Status database sebaiknya dipisahkan:

`QUEUED → PROVIDER_ACCEPTED → SENT → DELIVERED → READ`

Dengan terminal atau operational states terpisah seperti `FAILED`, `OPTED_OUT`, `PAUSED_QUALITY`, `TEMPLATE_REJECTED`, `PROVIDER_UNAVAILABLE`, dan `ACCOUNT_DISABLED`. Jangan menampilkan `SENT` sebagai “customer sudah menerima”.

Webhook handler harus:

- memverifikasi endpoint sesuai mekanisme Meta dan hanya menerima HTTPS;
- memvalidasi signature/request authenticity sesuai dokumentasi Meta;
- idempotent berdasarkan message ID/event ID;
- menerima event out-of-order tanpa menurunkan status yang sudah lebih maju;
- memetakan `failed` ke error class yang menentukan retry atau dead-letter;
- menyimpan provider message ID yang sudah disanitasi, tanpa raw token, alamat lengkap, atau GPS;
- memproses quality/template/account update sebagai kontrol campaign, bukan sekadar log.

Sumber primer: [Meta WhatsApp Business Platform - Webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks); [Meta WhatsApp Business Platform - Webhook Components](https://www.postman.com/meta/whatsapp-business-platform/request/j09tht8/components); [Meta WhatsApp Business Platform - Messages](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc); [Meta documentation - WhatsApp Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks).

## Rekomendasi template untuk use case ini

Gunakan satu template utility/operational untuk undangan dan satu template utility/operational untuk reminder, lalu ajukan melalui WhatsApp Manager. Meta yang menentukan review dan status akhir template; jangan menganggap nama kategori yang dipilih aplikasi otomatis diterima.

Contoh isi konseptual, bukan teks final yang dijamin lolos review:

**Undangan**

> Halo {{nama}}, {{nama_bisnis}} sedang melakukan verifikasi alamat layanan Anda. Mohon buka tautan berikut dan ikuti langkah untuk membagikan lokasi saat Anda berada di rumah: {{link_verifikasi}}. Jika Anda tidak ingin menerima pesan verifikasi lokasi lagi, balas STOP.

**Reminder**

> Halo {{nama}}, ini pengingat {{nomor}} dari {{maksimal}} untuk verifikasi alamat layanan oleh {{nama_bisnis}}. Buka {{link_verifikasi}} saat siap. Jika alamat Anda berubah, pilih opsi perubahan alamat pada halaman tersebut. Balas STOP untuk berhenti menerima pesan.

Konten harus disesuaikan dengan brand, dasar hubungan dengan customer, privacy notice, kanal bantuan, bahasa Indonesia yang jelas, dan hasil review template Meta. Hindari klaim urgensi palsu, promosi, pesan berulang yang tidak perlu, dan informasi lokasi sensitif di isi WhatsApp.

## Audit terhadap repository saat ini

Observasi ini berasal dari kode repository pada tanggal riset dan bukan klaim tentang policy Meta:

- Schema customer sudah memiliki `whatsappOptInAt`, `whatsappOptInSource`, dan `whatsappOptOutAt`.
- Campaign/worker saat ini memiliki queue, rate limit aplikasi, retry, dan idempotency key, tetapi campaign selection dan jalur worker harus tetap menegakkan suppression check opt-in/opt-out tepat sebelum send.
- `HttpWhatsAppAdapter` saat ini menerima `WHATSAPP_BASE_URL` generik dan mengirim `phoneE164`, `messageText`, serta `idempotencyKey`; kontrak tersebut belum menunjukkan payload Cloud API template, template name/language, atau webhook callback.
- Worker saat ini menandai item sebagai `SENT` setelah adapter mengembalikan hasil; tanpa callback provider, status itu hanya “provider accepted” dan belum membuktikan delivered/read.
- Console adapter aman untuk local development karena tidak melakukan external call, tetapi tidak boleh dipakai sebagai representasi delivery production.
- `WHATSAPP_RATE_LIMIT_PER_SECOND` default 10 adalah konfigurasi internal; tidak boleh dipresentasikan sebagai angka yang disetujui atau dijamin aman oleh Meta.

Gap production yang perlu ditutup sebelum blast besar:

1. Adapter Cloud API resmi yang memakai approved template dan access token aman.
2. Consent ledger/suppression enforcement yang atomik untuk opt-in, opt-out, dan per-recipient cooldown.
3. Webhook endpoint dengan verifikasi, idempotency, delivery/read/failure mapping, quality signal, template status, dan account/ban pause.
4. Campaign pause/resume, dead-letter, retry classification, audit, dan dashboard metrik per batch.
5. Pilot dan runbook operasional untuk menghentikan pengiriman saat quality signal atau complaint rate memburuk.

## Acceptance checklist sebelum production

- [ ] Setiap target campaign memiliki bukti opt-in WhatsApp dan tujuan consent mencakup verifikasi lokasi/reminder.
- [ ] Suppression check opt-out dijalankan saat target dipilih, saat job di-claim, dan tepat sebelum request provider.
- [ ] Blast dan reminder memakai template Meta yang approved dan sesuai tujuan.
- [ ] Raw token hanya ada sementara untuk membangun URL dan tidak masuk log, message template history aplikasi, atau telemetry.
- [ ] Provider response `accepted` tidak disamakan dengan delivered/read.
- [ ] Webhook delivery/failure dan quality/template/account update sudah diuji dengan payload nyata/sandbox provider.
- [ ] Retry hanya berlaku untuk error yang aman diulang; policy/recipient/opt-out error masuk dead-letter atau suppression.
- [ ] Ada global pause, per-campaign pause, dan automatic circuit breaker.
- [ ] Pacing diuji di pilot kecil dan dinaikkan bertahap dengan review kualitas setelah setiap batch.
- [ ] Privacy notice, kanal bantuan, dan proses banding/complaint internal siap.

## Daftar sumber primer

- [WhatsApp Business Messaging Policy - Bahasa Indonesia](https://business.whatsapp.com/policy/preview?lang=id_ID)
- [Meta: Ways to Manage Your Businesses Chats on WhatsApp](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/)
- [Meta WhatsApp Business Platform Postman collection: Cloud API overview, throughput, and rate limits](https://www.postman.com/universal-escape-345034/public/documentation/az6oggm/whatsapp-cloud-api?entity=request-17878056-c067ba18-46a8-42cf-82d9-021b4e010793)
- [Meta WhatsApp Business Platform Postman collection: Templates](https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates)
- [Meta WhatsApp Business Platform Postman request: Send Message Template Interactive](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive)
- [Meta WhatsApp Business Platform Postman collection: Webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks)
- [Meta WhatsApp Business Platform Postman request: Webhook Components](https://www.postman.com/meta/whatsapp-business-platform/request/j09tht8/components)
- [Meta documentation: How to Monitor Quality Signals](https://developers.facebook.com/docs/whatsapp/guides/how-to-monitor-quality-signals)
- [Meta documentation: WhatsApp Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)
- [Meta documentation: WhatsApp API Rate Limits](https://developers.facebook.com/docs/whatsapp/api/rate-limits)
- [Meta documentation: WhatsApp Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
