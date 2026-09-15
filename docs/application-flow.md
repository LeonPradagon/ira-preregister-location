# Business Flow IRA Preregist

Dokumen ini menjelaskan alur bisnis aplikasi dari persiapan data customer sampai hasil verifikasi lokasi.

## 1. Gambaran besar

```mermaid
flowchart TD
    Data[Data customer dan alamat tersedia]
    Data --> Check[Periksa kelayakan customer]
    Check --> Campaign[Buat campaign WhatsApp]
    Campaign --> Blast[Kirim undangan verifikasi]
    Blast --> Customer[Customer menerima dan membuka link]
    Customer --> Verification[Customer melakukan verifikasi data dan lokasi]
    Verification --> Result[Hasil verifikasi lokasi]
    Result --> FollowUp[Tindak lanjut admin]
    FollowUp --> Complete([Proses selesai])
```

## 2. Flow bisnis end-to-end

```mermaid
flowchart TD
    Start([Mulai]) --> CustomerData[Customer terdaftar dengan data alamat]
    CustomerData --> AddressCheck{Alamat dan nomor WhatsApp layak?}

    AddressCheck -->|Tidak| DataReview[Perbaiki atau review data customer]
    DataReview --> CustomerData
    AddressCheck -->|Ya| SelectTarget[Admin memilih target campaign]

    SelectTarget --> Preview[Admin melihat preview recipient dan pesan]
    Preview --> Approve{Campaign siap dikirim?}
    Approve -->|Tidak| EditCampaign[Edit target, pesan, atau jadwal]
    EditCampaign --> Preview
    Approve -->|Ya| Send[Undangan dikirim melalui WhatsApp]

    Send --> Opened{Customer membuka link?}
    Opened -->|Belum| Reminder[Customer menerima reminder sesuai jadwal]
    Reminder --> Opened
    Opened -->|Ya| Confirm[Customer mengonfirmasi data]

    Confirm --> AddressSame{Alamat masih sama?}
    AddressSame -->|Tidak| ChangeAddress[Customer mengajukan perubahan alamat]
    ChangeAddress --> AddressReview[Alamat baru diproses dan ditinjau]
    AddressReview --> Consent
    AddressSame -->|Ya| Consent[Customer memberikan persetujuan lokasi]

    Consent --> Capture[Customer mengirim lokasi GPS]
    Capture --> LocationQuality{Data lokasi cukup dan akurat?}
    LocationQuality -->|Tidak| RetryLocation[Customer diminta mengulang atau menunggu di rumah]
    RetryLocation --> Capture
    LocationQuality -->|Ya| Validate[Validasi alamat dan lokasi]

    Validate --> Valid{Hasil validasi}
    Valid -->|Sesuai| Approved[Lokasi disetujui]
    Valid -->|Tidak sesuai / belum jelas| NeedReview[Masuk daftar Needs Review]
    Valid -->|Menunggu kondisi terpenuhi| Waiting[Menunggu customer / proses lanjutan]

    Waiting --> ReminderChoice{Perlu reminder?}
    ReminderChoice -->|Ya| Reminder
    ReminderChoice -->|Tidak| NeedReview

    Approved --> Monitoring[Admin memonitor hasil]
    NeedReview --> Monitoring
    Monitoring --> Action{Perlu tindakan admin?}
    Action -->|Ya| ManualAction[Review data, hubungi customer, atau koreksi]
    ManualAction --> Monitoring
    Action -->|Tidak| Complete([Selesai])
```

## 3. Flow pengelolaan data customer

```mermaid
flowchart LR
    Import[Import data customer] --> Normalize[Rapikan dan samakan format data]
    Normalize --> Duplicate{Customer sudah ada?}
    Duplicate -->|Ya| Update[Perbarui data customer dan alamat]
    Duplicate -->|Tidak| NewCustomer[Buat customer baru]
    Update --> Eligibility
    NewCustomer --> Eligibility
    Eligibility[Periksa kelayakan untuk campaign]
```

Customer yang dapat dipilih untuk campaign adalah customer yang memenuhi aturan bisnis, antara lain memiliki nomor WhatsApp yang dapat digunakan, belum opt-out, dan memiliki alamat yang perlu diverifikasi.

## 4. Flow campaign WhatsApp

```mermaid
flowchart TD
    Plan[Admin merencanakan campaign]
    Plan --> Target[Tentukan target customer]
    Target --> Message[Tentukan template pesan dan jadwal]
    Message --> Preview[Preview recipient dan pesan]
    Preview --> Start{Admin mulai campaign?}
    Start -->|Belum| Draft[Campaign tetap sebagai draft]
    Start -->|Ya| Sending[Campaign berjalan]

    Sending --> Eligible{Recipient masih memenuhi syarat?}
    Eligible -->|Tidak| Skip[Recipient dilewati]
    Eligible -->|Ya| Quota{Batas pengiriman tersedia?}
    Quota -->|Tidak| ScheduleNext[Recipient dijadwalkan ke waktu berikutnya]
    Quota -->|Ya| WhatsApp[Kirim pesan WhatsApp]

    WhatsApp --> Delivery{Pesan berhasil diterima provider?}
    Delivery -->|Ya| Sent[Terkirim]
    Delivery -->|Tidak| RetryOrFail[Retry atau tandai gagal]
    Sent --> Monitor[Masuk monitoring campaign]
    RetryOrFail --> Monitor
    Skip --> Monitor
    ScheduleNext --> Monitor
```

## 5. Flow customer verifikasi lokasi

```mermaid
flowchart TD
    Link[Customer membuka link verifikasi]
    Link --> DataConfirmation[Konfirmasi data customer]
    DataConfirmation --> AddressDecision{Alamat sesuai?}

    AddressDecision -->|Ya| Permission[Setujui penggunaan lokasi]
    AddressDecision -->|Tidak| NewAddress[Masukkan alamat baru]
    NewAddress --> AddressValidation[Alamat baru divalidasi]
    AddressValidation --> Permission

    Permission --> GPSPermission{Izin lokasi diberikan?}
    GPSPermission -->|Tidak| Explain[Berikan instruksi dan minta izin lokasi]
    Explain --> GPSPermission
    GPSPermission -->|Ya| GPSCapture[Ambil sampel lokasi]

    GPSCapture --> Accuracy{Akurasi cukup?}
    Accuracy -->|Tidak| WaitOrRetry[Tunggu di rumah atau ulangi pengambilan]
    WaitOrRetry --> GPSCapture
    Accuracy -->|Ya| BusinessRules[Bandingkan lokasi dengan alamat terdaftar]
    BusinessRules --> Decision{Keputusan verifikasi}

    Decision -->|Valid| Approved[Disetujui]
    Decision -->|Perlu pemeriksaan| Review[Needs Review]
    Decision -->|Belum memenuhi kondisi| Waiting[Waiting for Home]
```

## 6. Arti hasil bisnis

| Hasil | Arti bisnis | Tindakan berikutnya |
|---|---|---|
| `LOCATION_VALID` | Alamat dan lokasi customer memenuhi aturan verifikasi | Proses dapat dianggap berhasil |
| `NEEDS_REVIEW` / `MANUAL_REVIEW` | Hasil belum dapat disetujui otomatis atau terdapat ketidaksesuaian | Reviewer memeriksa data dan evidence |
| `WAITING_FOR_HOME` | Customer belum berada di lokasi rumah atau perlu mencoba lagi | Customer dapat menunggu dan menerima reminder |
| `LOW_GPS_ACCURACY` | Sinyal GPS belum cukup akurat | Customer diarahkan mengulang pengambilan lokasi |
| `ADDRESS_PROPOSED` | Customer mengusulkan perubahan alamat | Alamat baru perlu diproses sebelum keputusan akhir |
| `SENT` | Undangan berhasil diterima oleh provider WhatsApp | Menunggu customer membuka link |
| `FAILED` | Pengiriman tidak berhasil setelah percobaan yang tersedia | Admin memeriksa penyebab atau melakukan tindak lanjut |
| `OPTED_OUT` | Customer tidak ingin menerima pesan WhatsApp | Customer tidak dikirimi campaign berikutnya |

## 7. Flow monitoring dan tindak lanjut admin

```mermaid
flowchart TD
    Monitoring[Admin membuka monitoring]
    Monitoring --> CampaignProgress[Lihat progress campaign]
    CampaignProgress --> RecipientStatus[Lihat status setiap recipient]
    RecipientStatus --> Status{Status recipient}

    Status -->|Sent / Delivered / Read| Await[Menunggu customer menyelesaikan verifikasi]
    Status -->|Pending| Scheduled[Menunggu jadwal atau quota berikutnya]
    Status -->|Failed| Investigate[Periksa penyebab gagal]
    Status -->|Needs Review| Review[Review hasil lokasi dan data]
    Status -->|Location Valid| Done[Catat sebagai selesai]

    Await --> VerificationResult[Periksa hasil verifikasi customer]
    VerificationResult --> Review
    Investigate --> FollowUp[Hubungi customer atau koreksi data]
    Review --> FollowUp
    FollowUp --> Done
```

## 8. Kondisi selesai

Proses customer dianggap selesai apabila:

1. lokasi telah berstatus valid; atau
2. reviewer telah menyelesaikan pemeriksaan manual; atau
3. customer dinyatakan tidak dapat diproses lebih lanjut karena gagal, opt-out, atau data tidak valid.

Campaign dianggap selesai apabila seluruh recipient sudah berada pada status akhir atau sudah dijadwalkan untuk proses lanjutan yang disepakati.
