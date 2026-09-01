# Template WhatsApp Meta — IRA Preregist

Dokumen ini berisi template Utility untuk alur verifikasi alamat. Template ini tidak berisi promosi, diskon, atau penawaran sehingga sesuai untuk undangan dan pengingat proses verifikasi yang diminta customer.

## 1. Template undangan

- **Name:** `exact_location_verification_invitation`
- **Category:** `Utility`
- **Languages:** `Indonesian` (`id`) dan `English` (`en_US`)
- **Header:** tidak perlu
- **Buttons:** tidak perlu untuk konfigurasi awal

### Indonesian

```text
Halo {{1}}, kami dari IRA (Internet Rakyat).

Untuk melanjutkan proses pemasangan internet, mohon konfirmasi alamat pemasangan Anda melalui tautan berikut:
{{2}}

Buka tautan tersebut saat Anda berada di alamat pemasangan. Tautan ini bersifat pribadi dan tidak boleh dibagikan.
```

### English

```text
Hello {{1}}, we are IRA (Internet Rakyat).

To continue with your internet installation, please confirm your installation address using the link below:
{{2}}

Open the link when you are at the installation address. This link is private and must not be shared.
```

Sample values saat submit ke Meta:

- `{{1}}`: Budi Santoso
- `{{2}}`: `https://verify.example.com/v/abc123`

## 2. Template pengingat

- **Name:** `exact_location_verification_reminder`
- **Category:** `Utility`
- **Languages:** `Indonesian` (`id`) dan `English` (`en_US`)
- **Header:** tidak perlu
- **Buttons:** tidak perlu untuk konfigurasi awal

### Indonesian

```text
Halo {{1}}, kami dari IRA (Internet Rakyat).

Proses verifikasi alamat pemasangan Anda belum selesai. Mohon lanjutkan melalui tautan berikut saat Anda berada di alamat pemasangan:
{{2}}

Tautan ini bersifat pribadi dan tidak boleh dibagikan.
```

### English

```text
Hello {{1}}, we are IRA (Internet Rakyat).

Your installation address verification is not complete. Please continue using the link below when you are at the installation address:
{{2}}

This link is private and must not be shared.
```

Sample values sama seperti template undangan.

## 3. Pengaturan aplikasi

Isi `app/server/.env` dengan nilai dari Meta:

```dotenv
WHATSAPP_PROVIDER=meta
WHATSAPP_BASE_URL=https://graph.facebook.com/vXX.X/<PHONE_NUMBER_ID>
WHATSAPP_API_KEY=<SYSTEM_USER_ACCESS_TOKEN>

WHATSAPP_INVITATION_TEMPLATE_NAME=exact_location_verification_invitation
WHATSAPP_INVITATION_TEMPLATE_LANGUAGE=id
WHATSAPP_REMINDER_TEMPLATE_NAME=exact_location_verification_reminder
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=id

WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random-string>
WHATSAPP_APP_SECRET=<META_APP_SECRET>
```

Versi English boleh disimpan di WhatsApp Manager untuk kebutuhan mendatang, tetapi aplikasi saat ini sengaja selalu mengirim varian Indonesian (`id`) agar customer tidak bingung. Bahasa dashboard admin tidak memengaruhi bahasa WhatsApp blast.

Endpoint webhook aplikasi:

```text
GET/POST https://<domain-api>/v1/webhooks/whatsapp
```

Di Meta Developer, isi **Callback URL** dengan URL tersebut, gunakan verify token yang sama dengan `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, lalu subscribe field `messages`.

Catatan: akses token Meta adalah credential rahasia. Jangan memasukkannya ke frontend, commit ke Git, atau membagikannya melalui screenshot/log.
