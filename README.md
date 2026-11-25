# Bot Pengumuman Grup WhatsApp

Bot WhatsApp berbasis **Baileys** untuk mengelola dan mengirim pengumuman teks di satu atau beberapa grup. **Seluruh pengelolaan dilakukan langsung lewat perintah di grup WhatsApp** — tidak perlu chat pribadi dan tidak perlu dashboard. Pengiriman bisa otomatis lewat jadwal atau manual lewat `/send ID`.

**Semua anggota grup boleh memakai seluruh perintah**, termasuk membuat, mengedit, dan mengirim pengumuman. Pengecualian: `/grup` dan `/grupaktif` hanya untuk admin terdaftar. Nomor admin dipakai untuk membatasi dua perintah itu dan untuk rincian di `/menu`.

> **Catatan penting:** Baileys adalah integrasi WhatsApp Web **tidak resmi**, bukan WhatsApp Business API resmi dan tidak berafiliasi dengan WhatsApp. Gunakan nomor cadangan/khusus bot dan pahami risiko pembatasan akun.

## Fitur

- Command handler terstruktur untuk pengumuman, jadwal, grup, dan admin.
- Wizard pembuatan pengumuman bertahap (`/set`) dengan format teks utuh (baris baru dipertahankan).
- Edit dua fase: `/edit` membuat draf, `/update` menampilkan diff + konfirmasi, `/batal` membuang draf. Data utama tidak berubah sebelum konfirmasi. Tiap admin punya sesi sendiri.
- ID otomatis `A1`, `A2`, … (counter atomik di database, bukan `MAX(id)`).
- Multi-grup: satu pengumuman bisa menargetkan beberapa grup WhatsApp (JID `@g.us`), grup asal perintah tidak otomatis menjadi tujuan.
- Penjadwalan `Asia/Jakarta`: tiap minggu atau minggu ke-1…ke-5 dari kemunculan hari tersebut dalam bulan (bukan rentang tanggal). Minggu ke-5 yang tidak ada → dilewati.
- Anti-pengiriman-ganda: klaim unik `(announcement_id, tanggal, jam)` di tabel `schedule_runs`, bertahan setelah restart. Jadwal tidak diklaim saat bot offline.
- Retry pengiriman dengan backoff, pencatatan `delivery_logs` dan `activity_logs`.
- Autentikasi admin berdasarkan **nomor WhatsApp** (bukan jabatan/nama di grup), dipakai untuk `/grup` dan `/grupaktif`.
- **Akses semua perintah** untuk anggota grup; hanya daftar grup yang dibatasi untuk admin.
- **Mode cepat** `/set <teks>`: teks yang ditempel langsung tersimpan apa adanya tanpa wizard.
- **Pengiriman manual** `/send A1` (alias `/kirim`), ID lama `ANN-001`/`AN001` tetap diterima setelah migrasi.
- Generator gambar `.iqc` dan `.tqc`: mockup chat iPhone/TikTok dari teks dan foto, dengan watermark `EDIT / MOCKUP`.
- AI Assistant lewat OpenRouter menggunakan **model gratis saja**, dengan batas pemakaian dan reaction ⏳→✅/❌.
- Panel web lengkap: CRUD pengumuman, import PDF/DOCX/TXT/MD menjadi draf teks, kelola jadwal/grup/admin, riwayat, backup.
- Teks saja yang dikirim ke grup — tidak ada gambar, video, poster, atau lampiran. Dokumen hanya dipakai sebagai sumber teks.
- Status pengiriman manual memakai **WhatsApp Message Reaction** pada pesan perintah: ⏳ saat proses, ✅ bila semua grup berhasil, ❌ bila ada yang gagal. Tidak ada pesan status tambahan di grup.

## Struktur

```
src/
  config.js               konfigurasi & path
  logger.js               logging
  db/                     schema.sql + koneksi/transaksi SQLite
  whatsapp/               koneksi Baileys, QR, reconnect, filter pesan
  services/               adminAuth, announcements, editService, groups,
                          delivery, scheduler
  commands/               router command + conversational flows
  api/                    routes Express
dashboard/                panel web: index.html + style.css + app.js (tanpa build step)
scripts/                  init-db, migrate, backup, add-admin
tests/                    pengujian dengan fake socket
data/                     DB, sesi auth, QR, backup (di-gitignore)
```

Panduan lengkap GitHub auto deployment, Termux, process manager, tunnel, backup, dan rollback: [DEPLOYMENT.md](DEPLOYMENT.md).

## Instalasi

Butuh **Node.js >= 20** (direkomendasikan Node 22/24).

```bash
cd /home/rifai/wa-bot
npm install
cp .env.example .env
# Isi ADMIN_NUMBERS dengan nomor admin bila ingin membatasi /grup dan /grupaktif.
npm run init-db
npm start
```

Versi dependensi sudah dipin: Baileys `6.7.24` (rilis 6.x yang bebas dari advisory spoofing GHSA-qvv5-jq5g-4cgg — **jangan** naikkan ke 6.17.x yang terdampak, dan jangan ke 7.x tanpa membaca migrasi breaking API-nya).

## Login QR

1. Jalankan `npm start`.
2. Di terminal akan muncul QR ASCII. File PNG juga ditulis ke `data/qr.png`, dan data URL tersedia di `GET http://localhost:3000/api/qr`.
3. Di ponsel: WhatsApp → **Perangkat Tertaut** → **Tautkan perangkat** → pindai QR.
4. Tunggu log `WhatsApp TERHUBUNG`. Bot akan sinkronisasi daftar grup otomatis.
5. QR berubah berkala; cukup pindai QR terbaru. Jika sesi logout, bot menghapus kredensial lama dan membuat QR baru otomatis.

## Menambahkan bot ke grup

1. Di WhatsApp, buka grup → info grup → **Tambahkan peserta** → pilih nomor bot.
2. Bot perlu menjadi anggota grup agar bisa mengirim pesan. Beri izin bot untuk mengirim pesan (khusus grup dengan approval admin).
3. Ketik `/id` di grup untuk melihat nomor Anda dan ID grup asal perintah.
4. Ketik `/grup` untuk melihat grup yang terdeteksi, `/grupaktif` untuk grup yang terdaftar sebagai tujuan.
5. Grup baru otomatis terdaftar saat bot pertama kali melihatnya. Gunakan `/nondaftargrup N` untuk mencabut, `/daftargrup N` untuk mendaftarkan kembali.

## Mendaftarkan nomor admin (opsional)

Semua anggota grup langsung bisa memakai perintah. Nomor admin hanya diperlukan untuk `/grup` dan `/grupaktif`, divalidasi dari database (bukan dari jabatan di grup).

Cara 1 — lewat `.env` (dibaca setiap kali bot start):

```env
ADMIN_NUMBERS=6281234567890,6289876543210
```

Cara 2 — tanpa restart:

```bash
node scripts/add-admin.js 6281234567890 "Nama Admin"
```

Ketik `/id` di grup untuk mengetahui nomor Anda (format `628...`). Anggota biasa yang mencoba perintah akan ditolak dan attempts-nya dicatat di `activity_logs`.

## Perintah

Semua perintah diketik **di grup**.

### Pengumuman

| Perintah | Fungsi |
|---|---|
| `/set` | Wizard membuat pengumuman baru |
| `/set <teks>` | Langsung simpan teks yang ditempel (mode cepat, tanpa wizard) |
| `/list` / `/list aktif` | Daftar semua pengumuman — kode + isi pesan lengkap |
| `/detail ID` | Detail lengkap + isi pesan |
| `/edit ID` | Memulai pengeditan (draf, belum tersimpan) |
| `/update` | Menampilkan perubahan draf + minta konfirmasi `/ya` |
| `/batal` | Membatalkan buat/edit/hapus |
| `/hapus ID` | Hapus dengan konfirmasi `/ya` |
| `/preview ID` | Preview pesan persis seperti yang akan dikirim |
| `/send ID` | Kirim manual sekarang (alias `/kirim`), mis. `/send AN001`. Status lewat reaction ⏳→✅/❌ pada pesan perintah |
| `/search KATA` | Cari judul/isi/kategori |

### Jadwal

| Perintah | Fungsi |
|---|---|
| `/jadwal` | Semua jadwal |
| `/aturjadwal ID` | Ubah hari/minggu/jam |
| `/aktifkan ID` / `/nonaktifkan ID` | Aktif/nonaktif jadwal |

### Grup & lainya

| Perintah | Fungsi |
|---|---|
| `/grup` | Semua grup yang bisa diakses bot |
| `/grupaktif` | Grup yang terdaftar |
| `/daftargrup N` / `/nondaftargrup N` | Kelola pendaftaran grup |
| `/id` | Nomor pengirim & ID grup |
| `.iqc <teks>` | Screenshot quote gaya iPhone (+ gambar opsional; tambah `--raw` untuk foto asli) |
| `.tqc <nama>|<teks>` | Mockup TikTok DM (+ gambar opsional) |
| `/ask PERTANYAAN` | Bertanya ke AI (reaction ⏳→✅/❌) |
| `/models` / `/free` | Daftar model gratis dari OpenRouter |
| `/model` | Melihat model aktif |
| `/model NOMOR` | Mengganti model gratis teks (khusus admin terdaftar) |
| Dashboard → AI Assistant → KONFIGURASI MODEL VISION | Memilih model vision (OpenRouter/Gemini; Gemini hanya untuk VIP) |
| `/status` | Status koneksi bot |
| `/menu` | Daftar seluruh perintah + cara pakai (satu pesan) |
| `/help` | Daftar perintah |

### Alur `/set` (contoh)

```
Admin: /set
Bot:   Ketik judul pengumuman
Admin: Kerja Bakti Minggu
Bot:   Ketik isi pengumuman (baris baru dipertahankan)
Admin: Assalamu'alaikum Wr. Wb.
       ...
Bot:   Pilih hari: 0. Minggu ... 5. Jumat ...
Admin: 0
Bot:   Pilih minggu: 0. Setiap minggu ... 3. Minggu ke-3 ...
Admin: 3
Bot:   Ketik jam pengiriman (contoh 19.00)
Admin: 07.00
Bot:   Pilih grup tujuan: 1. Grup RT ... / "ini" / "semua"
Admin: 1,2
Bot:   [preview] → ketik /ya untuk menyimpan
Admin: /ya
Bot:   Pengumuman berhasil disimpan dengan ID A1.
```

Hari dan minggu bisa diketik dengan nama (`Jumat`, `kedua`) atau angka (`5`, `2`). Jam menerima `07.00` maupun `07:00`. Kategori opsional — judul dan isi bebas ditulis sendiri, tidak dibatasi pada kas/pengajian.

### Alur `/set <teks>` (mode cepat)

Tempel langsung teks pengumuman setelah `/set`. Tidak ada wizard, tidak perlu konfirmasi:

```
Anggota: /set *PENGUMUMAN*
         📌 Pengajian Muda-Mudi
         📅 sabtu 21 November 2026
         ...
Bot:     PENGUMUMAN TERSIMPAN (mode cepat)
         ID: A1
         Status: NONAKTIF (tidak dikirim otomatis)
         Grup tujuan: Grup ini
         Kirim manual: /send A1

Anggota: /send AN001
Bot:     Reaction ⏳ → ✅ pada pesan perintah (tanpa pesan status).
```

Isi pesan disimpan dan dikirim **persis apa adanya**, termasuk baris baru dan format. Mode cepat membuat pengumuman **NONAKTIF** agar tidak terkirim otomatis — gunakan `/send A1` untuk mengirim manual, atau `/aturjadwal A1` lalu `/aktifkan A1` untuk menjadwalkannya. Grup tujuan defaultnya adalah grup tempat perintah diketik; ubah lewat `/edit A1` → bagian 6. ID bisa ditulis `A1`, `A001`, atau `ANN-001` (legacy).

### Alur `/edit`

```
Admin: /edit A1
Bot:   [nilai saat ini] Pilih bagian 1-6
Admin: 3                      (hari)
Bot:   Pilih hari baru
Admin: Jumat
Bot:   [ringkasan draf] → /update atau pilih bagian lain
Admin: /update
Bot:   [diff lama → baru] → /ya untuk simpan
Admin: /ya
Bot:   Perubahan A1 berhasil disimpan. Jadwal diperbarui.
```

`/batal` kapan saja membuang draf. `/update` tanpa sesi edit ditolak. Sesi edit disimpan per admin di tabel `edit_sessions`, jadi dua admin bisa mengedit pengumuman berbeda secara bersamaan tanpa tercampur.

## Reaction status pengiriman

`/send ID` dan `/kirim ID` tidak lagi mengirim pesan “Mengirim…”, “Berhasil…”, atau “Test bot…”. Bot bereaksi langsung pada **pesan perintah Anda**:

1. `⏳` ketika perintah diterima dan proses pengiriman dimulai.
2. `✅` jika semua grup tujuan berhasil.
3. `❌` jika ada satu atau beberapa grup gagal.

Reaction baru dikirim ke `message.key` yang sama sehingga menggantikan reaction sebelumnya — bukan membuat pesan status baru. Detail per grup (status, waktu, sebab gagal) tetap tersimpan di `delivery_logs` dan bisa dilihat di panel web/menu Riwayat. Jika reaction gagal dikirim, pengiriman pengumuman tetap berjalan. Pesan teks masih dikirim hanya untuk hal yang benar-benar perlu, misalnya ID tidak ditemukan atau perintah tidak valid. `/set` dan `/edit` tetap memakai percakapan bertahap.

## Perintah /menu

Ketik `/menu` **satu kali** saat bot aktif. Bot mengirim seluruh daftar secara otomatis dalam **beberapa pesan berurutan**, sekitar 6 command per pesan, dengan jeda singkat. Tidak perlu mengetik `/menu 2`, `/menu 3`, dan seterusnya, dan tidak ada pesan duplikat.

Daftar dibangkitkan dari `src/commands/registry.js` (`buildMenuParts`), jadi selalu sinkron dengan command handler: command baru yang ditambahkan ke registry otomatis masuk menu bila case-nya ada di router. Nomor urut berkesinambungan antarpesan. Admin melihat seluruh daftar; anggota biasa melihat semua perintah kecuali `/grup`, `/grupaktif`, dan `/model NOMOR`.

## Format ID pengumuman

ID baru: `A1`, `A2`, `A3`, … Dibuat otomatis dari counter atomik di `id_counters`, tidak pernah dipakai ulang meski pengumuman dihapus, dan tidak berubah saat judul/isi diedit. Semua command memakai format ini (`/detail A1`, `/edit A2`, `/send A3`, `/hapus A4`).

Database lama dengan `ANN-001` dimigrasikan **otomatis saat bot start** oleh `src/db/migrateIds.js`:

- Backup dibuat lebih dulu di `data/backups/before-id-migration-*.db`.
- `announcements.id` dan semua referensi (`schedules`, `announcement_targets`, `delivery_logs`, `schedule_runs`, `edit_sessions`, `activity_logs.detail`) diperbarui dalam satu transaksi.
- Counter diatur ke nomor berikutnya; `foreign_key_check` dijalankan setelahnya.
- Proses idempoten: dijalankan ulang tidak mengubah apa pun. Bisa juga dijalankan manual dengan `npm run migrate`.

## Nomor WhatsApp Bot

Menu **Pengaturan → Nomor WhatsApp Bot** di dashboard menampilkan nomor akun yang sedang terhubung, status koneksi, tombol **Ganti Nomor Bot**, dan **Putuskan Koneksi**.

Alur ganti nomor: konfirmasi → sesi lama diarsipkan ke `data/auth-archive/<waktu>` → koneksi lama ditutup aman → QR baru dibuat → pindai dengan WhatsApp nomor baru → status berubah menjadi `connected` dengan nomor baru. Database pengumuman, jadwal, riwayat pengiriman, dan daftar admin **tidak** dihapus. Jika gagal, status dan alasannya ditampilkan di dashboard. endpoint: `GET /api/whatsapp/status`, `POST /api/whatsapp/relink`, `POST /api/whatsapp/disconnect`.

## AI Assistant (OpenRouter, gratis saja)

Tambahan di `src/ai/` (`client.js`, `limits.js`, `service.js`) — terpisah dari scheduler dan pengumuman.

Isi `.env`:

```env
# Pilih salah satu: OpenRouter atau Gemini
AI_PROVIDER=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Alternatif Gemini:
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_FREE_MODELS=gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-latest,gemini-2.5-flash
GEMINI_VISION_MODELS=gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash
GEMINI_VISION_MODEL=
AI_COOLDOWN_SECONDS=20
AI_COOLDOWN_NOTICE_SECONDS=20
MESSAGE_DEDUPE_TTL_MS=300000
ALLOW_MULTI_INSTANCE=
AI_WINDOW_MINUTES=60
AI_MAX_PER_USER=20
AI_GLOBAL_MAX=60
AI_MAX_QUESTION_CHARS=1200
AI_TIMEOUT_MS=20000
AI_MAX_ANSWER_TOKENS=4000
AI_MAX_ANSWER_CHARS=3000
AI_MODELS_CACHE_MINUTES=30
AI_CONTEXT_MESSAGES=0
```

API key **hanya** di environment (`.env`), tidak pernah ditulis ke database, dikirim ke grup, atau ditampilkan di jawaban. Jangan menaruh kunci asli di `.env.example`. Tanpa key, `/ask` dan dashboard AI menunjukkan “belum dikonfigurasi”. Kontrol AI juga tersedia di dashboard menu **AI Assistant**: status koneksi, model aktif, daftar/gratis model, ganti model, batas pemakaian, dan riwayat penggunaan lewat `/api/ai/status`, `/api/ai/models`, `/api/ai/model`, `/api/ai/usage`.

- `/ask pertanyaan` → reaction ⏳, satu pesan jawaban, lalu ✅/❌. Bahasa jawaban mengikuti bahasa pertanyaan.
- `/models` atau `/free` → daftar model diambil **dinamis** dari `GET /models` OpenRouter. Hanya model dengan `pricing.prompt` dan `pricing.completion` keduanya `0` yang ditampilkan; akhiran `:free` bukan satu-satunya syarat.
- `/model` → detail model aktif. `/model NOMOR` atau `/model nama-model` → mengganti model, **hanya admin terdaftar**, dan model dicek ulang ketersediaan/gratisnya saat pergantian. Pilihan tersimpan di `ai_settings` dan bertahan setelah restart.
- Model bisa **ditulis manual** di dashboard (kolom “Atau ketik ID model manual”) atau lewat `/model gemini-2.0-flash`. OpenRouter divalidasi dari harga `0/0`; Gemini divalidasi terhadap `GEMINI_FREE_MODELS` di `.env`.
- Tidak ada perpindahan otomatis ke model berbayar. Jika tidak ada model gratis, bot menyampaikan bahwa layanan AI sedang tidak tersedia.
- - Penyedia: `AI_PROVIDER=openrouter` atau `gemini`. Tanpa `AI_PROVIDER`, bot memilih otomatis dari key yang tersedia (OpenRouter diprioritaskan).
- Pembatasan: cooldown per pengguna, batas per pengguna per jendela waktu, batas global, panjang pertanyaan, timeout, dan panjang jawaban. Saat batas tercapai: “Maaf, batas penggunaan AI sementara sudah tercapai…”.
- Konteks percakapan default nonaktif (`AI_CONTEXT_MESSAGES=0`). Jika diaktifkan, riwayat disimpan sementara **per grup + per pengguna** dan dibatasi jumlahnya, tidak dicampur antargrup/anggota.
- Tabel: `ai_settings`, `ai_model_history`, `ai_usage_logs`, `ai_user_limits`. Error AI tidak menghentikan scheduler/pengumuman.

## VIP dan pembatasan AI

Aktivasi VIP dilakukan lewat **private chat** dengan bot agar sandi tidak terlihat anggota grup.

- Di grup, `/vip` hanya membalas arahan + tautan `wa.me/<nomor bot>?text=%2Fvip`; tidak pernah meminta sandi.
- Di private chat, `/vip` membuka sesi 2 menit; sandi diketik sebagai pesan biasa, diverifikasi, lalu pesan sandi dihapus bila Baileys/izin mengizinkan.
- Salah sandi maksimal 3 kali → sesi dikunci 5 menit. `/cancel` membatalkan sesi. Pengguna sudah VIP diberi tahu, bukan didaftarkan ulang.
- Sesi disimpan per nomor WhatsApp, sehingga dua pengguna bisa Aktivasi bersamaan tanpa tertukar.
- Pendaftaran lewat dashboard → Pengaturan → “VIP / User terdaftar” tetap tersedia dengan kata sandi yang sama.

- Sandi disimpan hanya di environment variable `VIP_PASSWORD`, tidak di source/database.
- `/no vip @nomor` (Admin) mencabut status VIP langsung dari database. Perbandingan memakai hash SHA-256 + `timingSafeEqual`; sandi tidak pernah ditulis ke log, console, atau balasan.
- **Admin terdaftar** (`ADMIN_NUMBERS` / tabel `admins`) bebas kuota dan cooldown AI.
- **User biasa dan VIP** dibatasi `AI_MAX_PER_USER` (default 5) pertanyaan per `AI_WINDOW_MINUTES` (default 60 menit), dengan cooldown `AI_COOLDOWN_SECONDS`. VIP saat ini berfungsi sebagai penanda/user terdaftar; kuotanya tetap seperti user biasa.

## Anti-duplikat, cooldown, dan sesi VIP

- `messages.upsert` dideduplikasi berdasarkan message ID (`MESSAGE_DEDUPE_TTL_MS`, default 5 menit). Listener socket lama dilepas sebelum socket baru dibuat, dan hanya satu proses per database yang diizinkan (lock PID di `data/bot-*.pid`; `ALLOW_MULTI_INSTANCE=1` hanya untuk verifikasi dengan DB lain).
- Notifikasi cooldown AI hanya dikirim sekali per pengguna per fitur dalam `AI_COOLDOWN_NOTICE_SECONDS` (default sama dengan `AI_COOLDOWN_SECONDS`). Semua fitur AI memakai satu sumber konfigurasi `AI_COOLDOWN_SECONDS`.
- Sesi aktivasi VIP disimpan di tabel `vip_activation_sessions` (SQLite), tidak di memory. `/vip` di grup membuat sesi secara idempoten; private chat melanjutkan sesi yang sama. Alias JID/LID grup dipetakan ke JID private. Sesi bertahan setelah restart; kedaluwarsa mengikuti `VIP_SESSION_TTL_MS`.
- Riwayat error dan aktivitas VIP ditulis ke `activity_logs`; password tidak pernah dicatat.

## Backup dan rollback

```
npm run backup                       # backup data/bot.db ke data/backups/
cp data/backups/<file>.db data/bot.db  # rollback (matikan bot dulu)
npm start
```

## PDF Reader, Image Analysis, dan pilihan cepat

- `.pdf` — kirim PDF dengan caption `.pdf`, atau reply pesan PDF dengan `.pdf`. Teksdiekrak per halaman, lalu AI merangkum/menjawab pertanyaan. `AI_PDF_MAX_PAGES` dan `AI_PDF_MAX_CHARS` membatasi dokumen. PDF tanpa teks dicoba lewat model vision gratis; hasilnya tergantung kemampuan model, bukan OCR khusus.
- `.img` — kirim gambar dengan caption `.img`, atau reply gambar dengan `.img`. Memakai **Vision Model** yang terpisah dari model `/ask`. Hanya model gratis dengan metadata dukungan gambar yang dipakai; model berbayar dan model tanpa dukungan vision ditolak sebelum request. Gemini vision dipakai untuk user VIP bila `GEMINI_API_KEY` tersedia.
- Setelah hasil `.pdf`, `.img`, `/ask`, dan `/menu`, bot menampilkan **3 pilihan bernomor** (1/2/3). Baileys 6.7.24 tidak mendukung pengiriman tombol Quick Reply native, jadi ini fallback interaktif yang diproses per grup+pengguna; konteks kedaluwarsa 10 menit.
- Semua jalur AI (`/ask`, `.pdf`, `.img`, dan pilihan lanjutan)memakai kuota bersama `AI_MAX_PER_USER` (default 20/jam). `/menu`, `/help`, `/models`, `/model` tidak dihitung.

## Image Quote Generator

Modul di `src/images/`: `engine.js` (resize/crop/blur, wrap teks, font emoji, watermark, temporary directory), `media.js` (ekstrak & unduh gambar WhatsApp, validasi JPG/PNG/WEBP, batas ukuran), `templates/` (iphone.js, tiktok.js, windows.js), dan `generator.js` (orkestrasi + reaction).

Input yang didukung:

- `.iqc <teks>` — membuat chat quote dengan layout gelap/status bar/menu konteks iPhone.
- `.tqc <nama>|<teks>` — membuat TikTok DM dengan nama kontak; tanpa `|`, nama kontak default adalah `Raiden`.
- Kirim gambar dengan caption command `.iqc`/`.tqc`/`.wq` atau reply gambar, lalu kirim command.
- Tambahkan `--raw` (alias `--asli`/`--original`) agar **foto asli dipakai apa adanya sebagai gambar utama**, tanpa blur/crop. Contoh: `.iqc lihat foto --raw`.
- Teks quote wajib diisi; teks yang melebihi `IMAGE_MAX_TEXT` ditolak tanpa dipotong.

Output: satu gambar PNG + caption “✅ Done! … Mode: …”, dikirim dengan quoted message bila didukung, dan reaction ⏳ → ✅/❌. Setiap gambar memuat penanda kecil **EDIT / MOCKUP** — hasil adalah editan/meme, bukan bukti percakapan asli.

Template dirender programatis dengan `@napi-rs/canvas`; `sharp` dipakai untuk blur/crop/resize dan validasi hasil PNG. Emoji memakai font lokal `Noto Color Emoji` (didaftarkan otomatis saat engine dimuat); bila tidak tersedia, fallback ke font sistem. Konfigurasi: `IMAGE_TEMP_DIR`, `IMAGE_MAX_MB`, `IMAGE_MAX_TEXT`, `IMAGE_MAX_SIDE`, dan `IMAGE_TIMEOUT_MS` (batas waktu unduh/render, default 30 detik). File sementara unik per proses dan selalu dihapus di blok `finally`.

## Penjadwalan

- Zona waktu: `Asia/Jakarta` (WIB). Tick scheduler tiap menit.
- `minggu ke-N` = kemunculan ke-N dari hari yang dipilih dalam bulan kalender. Contoh: "Jumat ketiga" = Jumat ketiga bulan itu, bukan rentang tanggal 15–21.
- `Setiap minggu` (0) berjalan tiap minggu sesuai hari.
- Jika minggu ke-5 tidak ada pada bulan tersebut, jadwal dilewati.
- Jadwal tersimpan di tabel `schedules` dan tetap ada setelah restart.
- Sebelum mengklaim slot, scheduler memastikan WhatsApp terhubung. Slot yang diklaim tidak dikirim ulang otomatis — gunakan `/kirim ID` jika perlu.
- Satu tick dijaga flag `running`; satu kegagalan tidak menghentikan scheduler.

## Database

SQLite (`data/bot.db`) dengan WAL + foreign keys. Tabel: `admins`, `announcements`, `schedules`, `whatsapp_groups`, `announcement_targets`, `edit_sessions`, `delivery_logs`, `activity_logs`, `bot_settings`, plus `id_counters` dan `schedule_runs` untuk anti-pengiriman-ganda.

```bash
npm run init-db     # buat schema + seed (aman diulang)
npm run migrate     # migrasi inkremental + foreign_key_check
npm run backup      # VACUUM INTO data/backups/bot-<waktu>.db
```

Backup manual:

```bash
npm run backup
# atau salin file saat bot mati: cp data/bot.db /path/backup.db
```

## Panel web —Monitoring + pengelolaan penuh

Buka `http://localhost:3000`. Panel sekarang bukan sekadar monitoring: bisa dipakai untuk **membuat, mengedit, menghapus, mengaktifkan, dan mengirim** pengumuman, mengatur jadwal, mendaftarkan grup/admin, serta melihat riwayat. Perintah WhatsApp tetap berfungsi penuh — web dan grup memakai database yang sama.

Panel sengaja dibuat **akses umum tanpa kata sandi/token** — langsung buka `http://localhost:3000` dan pakai semua menu. Tidak ada variabel `WEB_PASSWORD`, `WEB_SECRET`, atau `API_TOKEN` yang perlu diisi. Perintah WhatsApp juga tetap berjalan seperti biasa.

Menu:

- **Ringkasan** — status koneksi, jumlah pengumuman/grup/pengiriman, QR, jadwal terbaru.
- **Pengumuman** — tabel dengan pencarian; tombol Edit, Kirim, Aktif/Nonaktif. Editor berisi judul, kategori, isi pesan, hari, minggu, jam, dan checklist grup tujuan (bisa banyak).
- **Import Dokumen** — unggah/tarik `PDF`, `DOCX`, `TXT`, atau `MD`. Teks diekstrak ke textarea, **wajib Anda periksa/edit**, lalu tombol “Buat pengumuman dari teks ini” membuka editor dengan teks tersebut. File tidak pernah dikirim ke grup: pesan yang dikirim tetap teks biasa, baris baru dipertahankan.
- **Jadwal**, **Grup**, **Riwayat**, **Pengaturan** — lihat/mengubah jadwal, status grup, log pengiriman & aktivitas, daftar admin, toggle scheduler, dan backup database.

Menambah fitur web: taruh logika bisnis baru di `src/services/`, endpoint di `src/api/routes.js`, elemen UI di `dashboard/index.html`, dan handler/event di `dashboard/app.js`. Tidak ada langkah build — cukup restart `npm start`.

Endpoint: `/api/health`, `/api/auth`, `/api/login`, `/api/logout`, `/api/status`, `/api/qr`, `/api/groups`, `/api/announcements`, `/api/announcements/:id`, `/api/schedules`, `/api/deliveries`, `/api/activity`, `/api/settings`, `/api/import`, `/api/backup`. Semua endpoint dapat dipanggil langsung (akses umum).

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| QR tidak muncul | Hapus `data/auth`, jalankan ulang `npm start`, pindai QR terbaru |
| Bot tidak merespons di grup | Cek `/status` dan pastikan pesan diketik di grup (`@g.us`) |
| Anggota biasa bisa `/grup` | Daftar grup memang khusus admin. Daftarkan nomor lewat `ADMIN_NUMBERS` / `node scripts/add-admin.js`, cek nomor dengan `/id` |
| Pengumuman tidak terkirim | Cek `/jadwal`, status aktif, grup tujuan, dan `/api/status` → `deliveries` |
| Tidak ada pengiriman ganda | `schedule_runs` mencegahnya; jangan menghapus baris ini manual |
| Gagal kirim | Lihat `reason` di `/api/deliveries`; bot retry 3 kali (default) lalu mencatat kegagalan |

Verifikasi yang bisa dilakukan tanpa ponsel: `npm test` (136 tes dengan fake socket, server OpenRouter & Gemini palsu, migrasi ID, endpoint web, dan generator gambar), `npm audit`, lalu `npm start` dan `curl` endpoint API. Proses QR scan dan pengiriman ke grup nyata **tidak bisa** diuji headlessly — perlu ponsel Anda.

## Deploy ke platform proses permanen

Bot ini **tidak cocok di Vercel** karena Vercel menjalankan serverless.function yang mati saat idle, filesystem ephemeral, dan tidak bisa menjaga koneksi WebSocket Baileys atau scheduler tetap hidup. Gunakan platform yang menyediakan proses permanen + volume persisten: **Railway, Render, atau Fly.io**.

File yang disiapkan: `Dockerfile`, `.dockerignore`, `Procfile`, `railway.json`, `render.yaml`, `fly.toml`.

Hal wajib:

- Mount volume persisten di `/app/data` — berisi `bot.db`, `auth/` (sesi WhatsApp), `qr.png`, `backups/`, `tmp/`. Tanpa volume, QR/login akan hilang setiap deploy dan riwayat pengumuman hilang.
- Set secret di platform, jangan commit `.env`: `OPENROUTER_API_KEY` (atau `GEMINI_API_KEY`), `VIP_PASSWORD`, `ADMIN_NUMBERS`, opsional `AI_PROVIDER`.
- Set `PORT` sesuai platform (default 3000), `NODE_ENV=production`.
- Jangan mengaktifkan `auto_stop_machines` / sleep pada Fly.io — bot harus tetap hidup untuk scheduler dan koneksi WhatsApp.

Contoh:

```
# Railway (after linking repo)
railway up
# lalu di dashboard Railway: Settings → Volumes → mount /app/data

# Render
# pilih Blueprint render.yaml, lalu tambahkan disk /app/data
# free plan tanpa disk tidak disarankan karena data hilang saat restart

# Fly.io
fly volumes create wa_bot_data --size 1 --region sin
fly deploy
```

Verifikasi setelah deploy: `GET /api/health`, `GET /api/status` (harus `connected: true`), lalu pindai QR di `GET /api/qr` bila sesi belum ada.

## Lisensi

MIT. Dibuat untuk penggunaan komunitas; WhatsApp dan nama merek terkait adalah milik Meta.# Wa-bot
