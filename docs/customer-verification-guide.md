# Panduan CS Verifikasi Alamat dan Lokasi melalui Link Unik

Dokumen ini membantu CS mengirim link verifikasi dan menjawab pertanyaan customer dengan langkah yang sederhana.

## Ringkasan paling singkat

Alur yang harus diingat CS:

1. Pastikan customer, nomor WhatsApp, dan alamat aktif sudah benar.
2. Buat atau mulai pengiriman link dari menu resmi aplikasi.
3. Pastikan status WhatsApp sudah dipantau.
4. Customer membuka **link terbaru** saat berada di alamat pemasangan.
5. Customer memeriksa data, mengizinkan lokasi, lalu menunggu pemeriksaan GPS.
6. Jika belum berada di alamat, customer memilih pengingat.
7. Jika hasil belum cocok, ikuti pesan yang muncul. Jangan meminta customer mencoba secara acak.
8. Jika batas GPS dan reminder habis, CS/Ops melakukan pemeriksaan lanjutan atau membuat siklus baru melalui menu resmi.

## 1. Sebelum mengirim link

Sebelum membuat link, CS memeriksa:

- nama customer dan ID customer;
- nomor WhatsApp yang aktif;
- alamat pemasangan yang aktif;
- customer belum melakukan opt-out WhatsApp;
- alamat sudah cukup lengkap untuk diperiksa.

Jika nomor WhatsApp salah, perbaiki data terlebih dahulu. Jika customer melakukan opt-out, jangan mengirim pesan sebelum status komunikasi diselesaikan sesuai prosedur.

### 1.1 Preview bukan link customer

Tombol **Preview** atau **Preview WhatsApp** hanya untuk melihat contoh isi pesan dan contoh halaman. Link preview adalah link simulasi/testing.

- Jangan mengirim link preview kepada customer.
- Jangan menyimpan link preview sebagai link pemeriksaan resmi.
- Link resmi dibuat ketika CS membuat verifikasi individual atau memulai pengiriman/campaign resmi.

## 2. Cara mengirim link resmi

### A. Mengirim ke satu customer

1. Buka data customer.
2. Pilih alamat aktif yang akan dipasang.
3. Pilih tindakan membuat verifikasi atau mengirim undangan.
4. Periksa kembali nama, nomor WhatsApp, dan alamat.
5. Konfirmasi pengiriman.
6. Sistem membuat sesi verifikasi, link unik, dan pesan WhatsApp.
7. Simpan nomor sesi atau ID pemeriksaan jika perlu ditindaklanjuti.

Link dibuat khusus untuk satu customer dan satu sesi. Link tidak boleh dipindahkan ke customer lain.

### B. Mengirim ke banyak customer melalui Blasting Verifikasi WhatsApp

1. Buka menu **Blasting Verifikasi WhatsApp**.
2. Pilih customer yang eligible atau gunakan filter customer yang belum terverifikasi.
3. Periksa jumlah customer yang terpilih.
4. Isi nama blasting, jadwal, ukuran batch, dan batas pengiriman harian sesuai kebutuhan.
5. Gunakan **Preview** hanya untuk memeriksa isi pesan.
6. Pilih **Buat & mulai blasting** setelah target dan pesan benar.
7. Buka detail blasting untuk melihat status setiap customer.

Blasting diproses bertahap oleh queue. Karena itu, link tidak selalu terkirim ke semua customer pada detik yang sama. Batas maksimal pengiriman mengikuti angka yang tampil pada aplikasi dan konfigurasi provider.

## 3. Cara membaca status pengiriman WhatsApp

Gunakan arti sederhana berikut:

| Status | Arti sederhana | Tindakan CS |
|---|---|---|
| **Menunggu** | Pesan belum diproses. | Tunggu dan cek kembali. |
| **Sedang diproses** | Sistem sedang mengirim pesan. | Jangan membuat pengiriman kedua. |
| **Diterima provider** | Provider WhatsApp menerima permintaan kirim. | Belum berarti pesan sudah masuk ke HP customer. |
| **Terkirim** | Pesan sudah diterima WhatsApp/customer. | Customer dapat membuka link. |
| **Dibaca** | Pesan sudah dibuka/dibaca. | Jika belum selesai, cek status sesi verifikasi. |
| **Gagal** | Pengiriman gagal. | Periksa nomor, error, dan provider. Kirim ulang hanya setelah status diperiksa. |
| **Provider tidak tersedia** | Layanan pengiriman sedang tidak siap. | Tunggu pemulihan atau eskalasi ke Ops. |
| **Opt-out** | Customer tidak menerima pesan WhatsApp. | Jangan memaksa pengiriman. Selesaikan status opt-out sesuai prosedur. |

Jika customer mengatakan belum menerima pesan, jangan langsung membuat link baru. Periksa nomor WhatsApp dan status pengiriman terlebih dahulu.

## 4. Pesan WhatsApp yang mudah dipahami customer

Gunakan template berikut dan isi bagian dalam kurung:

```text
Halo Bapak/Ibu {NAMA CUSTOMER},

Kami dari IRA. Mohon bantu periksa alamat pemasangan internet Anda melalui link berikut:
{LINK RESMI}

Mohon buka link saat Anda sudah berada di alamat pemasangan.

Setelah link dibuka:
1. Periksa nama dan alamat.
2. Jika benar, tekan “Ya, data saya benar”.
3. Izinkan akses lokasi HP jika diminta.
4. Diam di tempat sampai pemeriksaan selesai.

Jika Anda belum berada di alamat pemasangan, pilih “Ingatkan saya nanti”.

Link ini khusus untuk Anda. Mohon jangan dibagikan kepada orang lain.
```

CS tidak boleh meminta password, PIN, OTP, atau customer mengirim koordinat manual.

## 5. Alur yang dilakukan customer

### Langkah 1 — Customer membuka link

Customer harus membuka link terbaru dari WhatsApp.

Jika link tidak terbuka:

1. Buka dari pesan WhatsApp terbaru.
2. Coba Google Chrome atau Safari.
3. Pastikan seluruh link tersalin.
4. Coba koneksi internet lain.
5. Jika muncul **Tautan tidak valid** atau **Tautan kedaluwarsa**, CS memeriksa sesi dan mengirim ulang dari menu resmi bila diperlukan.

Jika CS mengirim ulang undangan, link lama tidak boleh digunakan lagi. Customer harus memakai link yang paling baru.

### Langkah 2 — Customer memeriksa data

Customer memeriksa nama dan alamat yang tampil.

- Jika benar, tekan **Ya, data saya benar**.
- Jika bukan data customer, tekan **Data saya berbeda** dan hubungi CS.
- Jangan melanjutkan menggunakan link milik orang lain.

### Langkah 3 — Customer menentukan apakah sudah berada di alamat

- Jika sudah di alamat pemasangan, lanjutkan ke izin lokasi.
- Jika belum di alamat, pilih **Ingatkan saya nanti**, pilih tanggal dan waktu, lalu tunggu link pengingat melalui WhatsApp.

### Langkah 4 — Customer mengizinkan lokasi

Customer menyalakan Location/Lokasi pada HP. Saat browser meminta izin, customer memilih **Izinkan/Allow**.

Jika izin tidak muncul:

1. Buka Pengaturan HP.
2. Aktifkan Lokasi.
3. Aktifkan Lokasi Presisi jika tersedia.
4. Buka izin lokasi browser.
5. Izinkan browser mengakses lokasi.
6. Kembali ke link dan tekan **Izinkan lokasi & mulai** atau tombol coba lagi.

### Langkah 5 — Customer menunggu pemeriksaan GPS

Customer harus:

- berada di alamat pemasangan;
- berada di area terbuka atau dekat jendela;
- tidak berpindah tempat;
- menjaga koneksi internet dan lokasi HP tetap aktif;
- menunggu pemeriksaan, biasanya sampai sekitar 30 detik;
- tidak menutup atau memuat ulang browser.

Sistem mengambil beberapa sampel lokasi dan memilih hasil terbaik. Customer tidak perlu mengirim koordinat melalui chat.

## 6. Arti hasil pemeriksaan dan jawaban CS

| Pesan pada halaman | Arti mudah | Jawaban atau tindakan CS |
|---|---|---|
| **Lokasi sudah sesuai** | Alamat dan lokasi HP cocok. | Sampaikan bahwa proses sudah selesai. |
| **Lokasi belum terbaca dengan jelas** | Sinyal GPS lemah atau belum stabil. | Minta customer menyalakan lokasi presisi, pindah dekat jendela/area terbuka, diam, lalu coba lagi. Ini belum berarti alamat salah. |
| **Lokasi belum sesuai** | Posisi HP belum cocok dengan alamat atau titik referensi. | Pastikan customer benar-benar di alamat pemasangan, lalu coba lagi. Jangan langsung mengubah alamat. |
| **Lokasi belum dapat dipastikan** | Sistem belum mendapatkan bukti lokasi yang cukup. | Minta customer mencoba lagi saat sudah di alamat dengan sinyal GPS lebih baik. |
| **Lokasi sedang diperiksa tim** | Data GPS sudah diterima dan sedang direview. | Customer tidak perlu mengulang. Tunggu hasil tim IRA. |
| **Data alamat belum cocok** | Data customer atau alamat perlu dikonfirmasi. | Hubungi CS untuk review alamat. Jangan mengganti alamat tanpa alasan yang benar. |
| **Alamat baru sudah dikirim** | Alamat baru menunggu pemeriksaan lokasi. | Customer harus memulai pemeriksaan GPS di alamat baru. |

## 7. Jika alamat customer benar tetapi hasil belum cocok

Jelaskan bahwa sistem memeriksa dua hal:

1. **Isi alamat** yang ditulis customer.
2. **Posisi GPS** HP saat pemeriksaan.

Alamat bisa benar, tetapi GPS tetap belum cocok jika customer belum berada di rumah, GPS belum stabil, lokasi presisi belum aktif, atau titik referensi belum cukup tepat.

Urutan bantuan CS:

1. Pastikan customer berada di alamat pemasangan.
2. Pastikan Lokasi dan Lokasi Presisi aktif.
3. Minta customer pindah ke area terbuka/dekat jendela.
4. Minta customer menekan **Coba verifikasi lokasi lagi**.
5. Minta customer diam sampai proses selesai.
6. Jika tetap belum cocok, catat pesan hasil dan eskalasi ke Ops.

Jangan meminta customer mengganti alamat yang sebenarnya benar hanya agar hasil terlihat cocok. Jangan meminta koordinat manual sebagai pengganti pemeriksaan.

## 8. Jika customer memilih alamat sudah berubah

Customer hanya memilih **Alamat saya sudah berubah** jika alamat terdaftar memang sudah tidak sesuai.

Pada form alamat baru, field wajib adalah:

- provinsi;
- kota/kabupaten;
- kecamatan;
- kelurahan/desa;
- nama jalan/perumahan.

Nomor rumah, kode pos, dan detail alamat boleh dikosongkan jika memang tidak tersedia. Namun, minta customer mengisinya jika tahu.

Untuk nama jalan:

1. Buka Google Maps saat berada di rumah.
2. Cari alamat atau lihat titik biru.
3. Ketuk nama jalan yang tampil.
4. Tulis nama tersebut di form.
5. Tambahkan patokan pada detail alamat bila perlu.

Setelah customer mengirim alamat:

- alamat menjadi **alamat baru yang diajukan**, belum otomatis disetujui;
- pemeriksaan GPS di alamat baru tetap wajib dilakukan;
- reminder yang masih terjadwal untuk alamat lama dibatalkan;
- jika alamat sudah pernah diajukan dan ingin diubah lagi, arahkan ke CS/Ops.

## 9. Alur reminder atau pengingat

### A. Customer belum berada di rumah

Customer memilih **Ingatkan saya nanti**, memilih waktu yang masih akan datang, lalu menunggu pesan WhatsApp.

Setelah memilih reminder, halaman menampilkan **Pengingat sudah dipilih**. Customer tidak perlu menekan tombol reminder lagi.

### B. Link reminder sudah masuk

Saat customer sudah berada di alamat:

1. Buka link reminder terbaru.
2. Tekan **Saya sudah di alamat, mulai verifikasi**.
3. Izinkan akses lokasi.
4. Diam sampai pemeriksaan selesai.

Saat link reminder dibuka, reminder terjadwal berikutnya untuk sesi tersebut dibatalkan. Customer melanjutkan dari link yang baru dibuka.

### C. Reminder otomatis karena link belum dibuka

Jika fitur reminder aktif dan link awal tidak dibuka, sistem dapat menjadwalkan pengingat otomatis sesuai konfigurasi. Karena itu, CS tidak perlu mengirim link manual berulang-ulang tanpa memeriksa status sesi.

### D. Batas reminder tercapai

Maksimal reminder adalah **3 kali**, sesuai konfigurasi aplikasi.

Jika muncul **Batas pengingat sudah tercapai**:

- jangan meminta customer memilih reminder lagi;
- periksa status sesi di dashboard;
- lanjutkan melalui CS/Ops jika masih perlu pemeriksaan;
- buat siklus verifikasi baru hanya melalui tombol resmi setelah syaratnya terpenuhi.

## 10. Batas percobaan GPS

Satu link/sesi memiliki maksimal **3 percobaan GPS** sesuai konfigurasi aplikasi.

Jika customer sudah mencapai batas GPS tetapi reminder masih tersedia, halaman akan meminta customer memilih reminder. Customer membuka link reminder baru saat sudah berada di alamat.

Jika customer membuka link reminder, penghitung percobaan GPS untuk sesi lanjutan dimulai kembali sesuai aturan sistem.

Jika batas GPS dan reminder sama-sama habis:

- jangan meminta customer mencoba berkali-kali;
- jangan menjanjikan verifikasi akan disetujui;
- catat nama, nomor, waktu, status, dan screenshot jika diperlukan;
- eskalasikan ke Ops atau buka pemeriksaan tim;
- admin yang memiliki hak kirim dapat memilih **Kirim Ulang Link** untuk membuat siklus baru. Siklus lama tetap menjadi riwayat dan link lama tidak dipakai.

## 11. Perbedaan kirim ulang undangan dan siklus baru

### Kirim Ulang Undangan

Gunakan jika link belum diterima, link bermasalah, atau perlu mengirim undangan lagi sebelum siklus habis.

- sistem membuat link baru;
- link lama menjadi tidak berlaku;
- customer harus memakai link terbaru;
- jangan digunakan untuk customer yang sudah selesai dan valid.

### Kirim Ulang Link setelah batas habis

Gunakan hanya jika percobaan GPS dan reminder pada sesi lama sudah habis.

- sesi lama ditutup sebagai riwayat;
- sistem membuat sesi baru;
- batas GPS dan reminder dimulai kembali;
- customer menerima link baru;
- jangan menghapus riwayat sesi lama.

## 12. Case kendala yang sering ditanyakan

### Customer belum menerima WhatsApp

Periksa nomor WhatsApp, status pengiriman, status opt-out, dan status sesi. Jangan langsung membuat link baru.

### Customer melihat Tautan tidak valid atau kedaluwarsa

Minta customer memakai link terbaru. CS memeriksa masa berlaku atau apakah link sudah diganti. Kirim ulang dari menu resmi bila diperlukan.

### Izin lokasi ditolak

Minta customer mengaktifkan Lokasi dan Lokasi Presisi, mengizinkan browser, lalu kembali ke halaman. Jangan meminta koordinat manual.

### Customer menutup browser atau halaman ter-refresh

Minta customer membuka link yang sama selama masih berlaku. Ikuti status terbaru yang tampil. Jika link sudah diganti, gunakan link terbaru.

### Customer salah menekan tombol

CS memeriksa status sesi terlebih dahulu. Customer tidak perlu mengulang dengan link lain tanpa arahan CS.

### Customer melihat Sedang diperiksa tim

Customer cukup menunggu. Jangan meminta customer mengulang.

### Data customer bukan miliknya

Hentikan proses. Minta customer menghubungi CS. Jangan mencoba mengubah atau meneruskan verifikasi.

## 13. Informasi yang boleh diminta CS

CS boleh meminta:

- nama customer;
- nomor WhatsApp terdaftar;
- ID customer atau nomor sesi;
- waktu percobaan;
- jenis HP dan browser;
- pesan yang tampil;
- screenshot pesan dengan data sensitif disamarkan.

CS tidak perlu meminta password, PIN, OTP, atau koordinat manual.

## 14. Checklist penutupan percakapan

- [ ] Link yang dipakai adalah link resmi dan terbaru.
- [ ] Nama dan alamat sudah diperiksa customer.
- [ ] Customer berada di alamat pemasangan saat mengambil GPS.
- [ ] Lokasi HP dan izin browser sudah aktif.
- [ ] Customer sudah menunggu proses selesai.
- [ ] Status akhir sudah dicatat.
- [ ] Reminder dipilih jika customer belum berada di alamat.
- [ ] Alamat baru diisi hanya jika memang berubah.
- [ ] Customer tidak diminta mengirim koordinat manual.
- [ ] Customer diingatkan untuk tidak membagikan link.

## 15. Script singkat siap pakai

### Tujuan link

> Link ini digunakan untuk memastikan alamat pemasangan dan lokasi HP Anda sesuai. Proses dilakukan melalui browser dan tidak perlu instal aplikasi.

### Belum berada di alamat

> Silakan pilih “Ingatkan saya nanti”. Pilih waktunya, lalu buka link pengingat yang dikirim WhatsApp saat Anda sudah berada di alamat pemasangan.

### Lokasi belum cocok

> Hasil ini belum tentu berarti alamat Anda salah. Pastikan berada di alamat pemasangan, nyalakan Lokasi Presisi, lalu coba lagi di area terbuka tanpa berpindah tempat.

### Alamat berubah

> Silakan pilih “Alamat saya sudah berubah” hanya jika alamatnya memang berubah. Isi alamat terbaru dengan benar. Setelah dikirim, Anda tetap perlu melakukan pemeriksaan GPS di alamat baru.

### Batas sudah tercapai

> Percobaan pada sesi ini sudah mencapai batas. Mohon jangan mencoba berulang kali. Kami akan memeriksa statusnya dan membantu melalui tim IRA.

### Hasil sedang diperiksa tim

> Data lokasi Anda sudah kami terima dan sedang diperiksa tim IRA. Anda tidak perlu mengulang proses. Kami akan menghubungi Anda jika ada informasi berikutnya.
