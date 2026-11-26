# LUX BOT — Command Reference

**Dev By Rifai** · Zona waktu Asia/Jakarta

Semua command resmi memakai prefix titik. Prefix lama tetap diterima sementara di grup untuk kompatibilitas; private chat hanya menerima command yang diawali titik. Menu private hanya menampilkan command yang diizinkan di private chat. Prefix lama tidak ditampilkan pada menu. Daftar menu dibuat dari metadata command di `src/commands/registry.js`; fitur berizin admin/VIP dan fitur AI tanpa API aktif disesuaikan dengan akses dan konfigurasi.

## 👤 Menu utama

| Command | Fungsi |
|---|---|
| `.menu` | Kartu ringkasan dan menu lengkap |
| `.help` | Menu bantuan |
| `.user` | JID, nomor, role, dan status akun |
| `.vip` | Informasi atau aktivasi VIP |
| `.ping` | Status bot dan waktu respons |
| `.status` | Status koneksi WhatsApp |
| `.info` | Informasi bot, versi, dan fitur aktif |

## 📢 Pengumuman

| Command | Fungsi |
|---|---|
| `.set` | Wizard membuat pengumuman |
| `.set <teks>` | Menyimpan pengumuman langsung |
| `.list` | Daftar pengumuman dan isi |
| `.detail A1` | Detail pengumuman |
| `.edit A1` | Membuat draf perubahan |
| `.update` | Meninjau perubahan draf |
| `.batal` | Membatalkan proses |
| `.send A1` | Mengirim pengumuman; alias `.kirim` |
| `.preview A1` | Pratinjau pesan |
| `.hapus A1` | Menghapus setelah konfirmasi |
| `.search KATA` | Mencari pengumuman |

## 📅 Penjadwalan

| Command | Fungsi |
|---|---|
| `.jadwal` | Melihat jadwal |
| `.aturjadwal A1` | Mengatur jadwal |
| `.aktifkan A1` | Mengaktifkan pengumuman terjadwal |
| `.nonaktifkan A1` | Menonaktifkan pengumuman terjadwal |

## 👥 Manajemen grup

Command pengelolaan daftar grup hanya untuk admin bot terdaftar. Bot tidak perlu menjadi admin WhatsApp untuk memperbarui daftar internal; izin kirim ke grup tetap mengikuti aturan WhatsApp.

| Command | Fungsi |
|---|---|
| `.grup` | Daftar grup yang dapat diakses bot (admin) |
| `.grupaktif` | Daftar grup terdaftar (admin) |
| `.daftargrup N` | Mendaftarkan grup nomor N (admin) |
| `.nondaftargrup N` | Mencabut pendaftaran grup N (admin) |

## 👑 VIP

| Command | Fungsi |
|---|---|
| `.vip` | Informasi/aktivasi VIP; ditampilkan juga di menu utama |
| `.no vip @pengguna` | Mencabut VIP pengguna (admin) |

## ⬇️ Downloader

| Command | Fungsi |
|---|---|
| `.tiktok <tautan>` | Mengunduh media TikTok publik (VIP/ADMIN) |
| `.instagram <tautan>` | Mengunduh media Instagram publik (VIP/ADMIN) |

## 🤖 AI Assistant

| Command | Fungsi |
|---|---|
| `.ask <pertanyaan>` | Bertanya kepada AI |
| `.models` | Daftar model gratis |
| `.free` | Alias `.models` |
| `.model [nomor]` | Melihat atau memilih model; pemilihan hanya untuk admin |

Command AI dan analisis media ditampilkan bila penyedia AI telah dikonfigurasi.

## 🕌 Islam

`.ayat`, `.surah`, `.murottal`, `.asmaul`, `.zikir`, `.istighfar`, `.tahlil`, `.sholawat`, `.quotesislam`, `.doa`

Alias yang tetap didukung: `.ayatpilihan`, `.alquran`, `.quran`, `.murrotal`, `.murotal`, `.audiosurah`, `.asmaulhusna`, `.dzikir`, `.shalawat`.

## 📱 Instagram iOS mockup

`.igqc`, `.igpost`, `.igstory`, `.igprofile`, `.igdm`, `.ignote`

## 🧷 Sticker

`.sticker`, `.s`, `.ttp`, `.attp`, `.brat`, `.qc`, `.toimg`, `.emojimix`, `.pack`

## 🎨 Maker

`.logo3d`, `.logogold`

## 🧠 AI writing & coding

`.aiwrite`, `.rewrite`, `.ringkas`, `.fixcode`, `.explaincode`, `.debug`

## 📄 Dokumen dan gambar

`.pdf`, `.img`, `.iqc`, `.iqc2`, `.iqc5`, `.iqcdark`, `.iqcpink`, `.iqcpinkv2`, `.iqcmerah`, `.tqc`, `.tiktokchat`, `.ytcomment`, `.wq`, `.iqcwin`, `.rvo`

## 📚 Pengajian muda-mudi

Command berikut hanya untuk admin bot terdaftar:

`.template`, `.setngaji`, `.editngaji`, `.previewngaji`, `.sendngaji`, `.jadwalngaji`, `.aturngaji`, `.aktifngaji`, `.nonaktifngaji`

## Private chat, grup, dan shortcut

- Private chat hanya menjalankan command eksplisit berprefix titik yang diizinkan. Pesan biasa tidak memanggil AI atau command.
- `.vip` dapat dimulai di grup dan dilanjutkan lewat private chat; pesan password hanya diproses ketika sesi VIP aktif.
- Di grup, command memerlukan grup terdaftar. Command moderasi/pengelolaan grup memerlukan admin bot terdaftar.
- AI tidak membalas pesan biasa di grup; gunakan `.ask` atau aturan mention yang dikonfigurasi.
- Shortcut angka hanya berlaku setelah menu grup dikirim: `1` menjalankan `.list`, `2` menjalankan `.ask`, `3` menjalankan `.user`.

ID pengumuman mendukung format `A1`, `A001`, dan ID legacy seperti `ANN-001`.
