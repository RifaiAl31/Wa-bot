# KAYY ASSISTANT — Command Reference

Powered by Dev RifaiAl · Timezone Asia/Jakarta

Semua command baru memakai prefix `.`. Command lama berprefix `/` tetap diterima sebagai alias agar tidak merusak otomasi yang sudah ada.

## Role

| Role | Sumber identitas | Hak |
|---|---|---|
| ADMIN | Nomor terdaftar di tabel `admins` (bukan `OPEN_ACCESS`, bukan nama kontak) | Kontrol penuh, AI management, grup, sistem, VIP |
| VIP | Tabel `vip_users` (bisa punya `expires_at`) | Semua fitur USER + downloader publik; tidak bisa konfigurasi AI/bot |
| USER | Pengirim terdaftar WhatsApp | Fitur umum: menu, identitas, ping, AI, PDF, gambar, quote, `.rvo` |

Identitas selalu berdasarkan WhatsApp JID yang dinormalisasi ke nomor.

## Command umum

| Command | Fungsi |
|---|---|
| `.menu` | Menu personal: mention asli, role, jam+detik, tanggal Indonesia, cuaca, jumlah fitur & command aktif, 3 pilihan angka |
| `.help` | Bantuan singkat |
| `.user` | JID, nomor, role, status akun, mode GROUP/PRIVATE |
| `.vip` | Informasi/aktivasi VIP (private chat didukung) |
| `.ping` | Response time, status bot/server/WhatsApp, uptime, waktu WIB |
| `.status` | Status koneksi WhatsApp |
| `.info` | Versi aplikasi, fitur aktif, role, timezone |

## Command pengumuman & AI

Command lama `/set`, `/list`, `/detail A1`, `/edit`, `/update`, `/batal`, `/send`, `/preview`, `/hapus`, `/search`, `/jadwal`, `/aturjadwal`, `/aktifkan`, `/nonaktifkan`, `/ask`, `/models`, `/model` tetap berfungsi.

## Media

| Command | Fungsi |
|---|---|
| `.pdf` | Membaca PDF dari caption/reply |
| `.img` | Analisis gambar via vision model |
| `.iqc`, `.tqc`, `.wq` | Image quote (foto asli bisa dipertahankan dengan `--raw`) |
| `.rvo` | Meneruskan foto biasa yang dikirim eksplisit dengan caption `.rvo` atau reply. File sekali lihat ditolak; file sementara dihapus. |

## Downloader publik (VIP/ADMIN)

| Command | Fungsi |
|---|---|
| `.tiktok <link>` | Media TikTok publik |
| `.instagram <link>` | Media Instagram publik |

Ketentuan:

- Hanya `https`, domain resmi, tanpa kredensial, tanpa IP privat (SSRF guard).
- Butuh `yt-dlp` terpasang di Termux: `pkg install python && pip install yt-dlp`.
- Tanpa API key. Tidak menjamin keberhasilan bila platform mengubah sistemnya.
- Tidak mengakses akun privat, login, atau DRM.
- Watermark/atribusi karya orang lain tidak dihapus.
- Rate limit default 5 permintaan/10 menit/user; ukuran maksimal 50 MB; timeout 120 detik.

## Interactive menu

Baileys 6.7.24 tidak mendukung pengiriman tombol interaktif native. Menu menampilkan maksimal **3 pilihan bernomor** sebagai fallback. Ketik `1`, `2`, atau `3` untuk langsung menjalankan command yang sesuai.

## Akses grup

Grup yang ditemukan otomatis **tidak diberi akses** sampai didaftarkan admin (`/daftargrup N` atau dashboard). Router memvalidasi izin grup sebelum handler apa pun dijalankan. Pesan dari grup tanpa izin diabaikan tanpa balasan.

## Branding

KAYY ASSISTANT — Powered by Dev RifaiAl.

Background menu dibuat programatis (`scripts/generate-menu-assets.js`) sehingga bebas hak cipta pihak ketiga. Video stock berwatermark tidak dipakai.
