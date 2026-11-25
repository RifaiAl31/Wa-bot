# Integrasi fitur vanXone v7 ke Wa-bot

Sumber: `vanxone_v7.zip` (diekstrak ke direktori referensi terpisah; tidak dijalankan sebagai bot kedua).
Atribusi kode/data: `× - vanXone </>`. Tidak ada credential, cookie, session, atau API key yang disalin.

## 1. Pemetaan sumber → tujuan

| Sumber vanXone | Tujuan Wa-bot | Catatan |
|---|---|---|
| `plugins/islam/ayat.js` | `src/features/islam/data/ayat.json`, `src/features/islam/index.js` | Ayat pilihan dipakai langsung; pencarian `surah:ayat` memakai endpoint dari `lib/kernel/plugins/search/quran.js`. |
| `lib/kernel/plugins/search/quran.js` | `src/features/islam/index.js` | `https://api.alquran.cloud/v1/...`, tanpa API key; adaptasi meminta Arab, transliterasi, dan terjemahan Indonesia. |
| `plugins/islam/surah.js`, `murrotal.js`, `audiosurah.js` | `src/features/islam/index.js` | Daftar/detail surah; audio QuranJSON hanya dari host CDN yang diizinkan, diverifikasi sebagai MP3, lalu dikirim dari cache lokal terbatas. |
| `plugins/islam/islami.js` | `.doa` melalui `src/features/islam/index.js` | Endpoint doa dari source dipertahankan dan diverifikasi merespons saat audit; respons harus punya Arab, Latin, dan terjemahan. API tidak menyediakan rujukan sanad per doa. |
| `plugins/islam/zikir.js`, `sholawat.js`, `asmaulhusna.js`, `istighfar.js`, `tahlil.js` | `src/features/islam/data/*.json`, `src/features/islam/index.js` | Data Arab/Latin/terjemahan diambil dari source, bukan ditulis ulang. |
| `plugins/islam/bacaansholat.js` | Belum diintegrasikan | Source memanggil `global.API('kyzz', ...)`; arsip tidak memberikan endpoint publik/kredensial portabel yang dapat diverifikasi. |
| `lib/kernel/plugins/quotes/quotesislam.js` | `src/features/islam/data/quotes.json` | Array quotes asli diekstrak utuh. |
| `plugins/sticker/*.js`, `lib/kernel/lib/engine/plugins.js` | `src/features/sticker/service.js`, `index.js` | Konversi WEBP 512, EXIF pack, text/quote/brat/emoji mix, toimg; ffmpeg opsional. |
| `plugins/maker/logo3d.js`, `logogold.js` | `src/features/maker/index.js` | Canvas 2D lokal, gradient 3D/emas, border dekoratif. |
| `plugins/ai/ai-rewriter.js`, `chatgpt.js`, `deepseek.js`, `gemini.js`, `glm-ai.js`, `fixcode.js` | `src/features/ai/writing.js` | Pola prompt diadaptasi, eksekusi lewat `aiService.askWithPrompt` (kuota terpusat). |
| `plugins/ai/aiedit.js`, `editimage*.js`, `aifilter.js`, `o-toanime.js`, `o-tocartoon.js`, `o-toghibli.js`, `o-sologo.js` | Belum diintegrasikan | Bergantung image-generation/editing API ber-key; bot menampilkan status belum tersedia dan tidak mengarang endpoint atau hasil gambar. |
| `plugins/maker/iqc.js`, `plugins/image/iqc5.js` | `.iqc`, `.iqc5` via `src/images/templates/` | `.iqc` memakai Canvas lokal dengan baterai; `.iqc5` mengadaptasi Canvas lokal source dan mempertahankan atribusi `× - vanXone </>`. |
| `plugins/image/iqc2.js` | `.iqc2` | Source memanggil API eksternal; adaptasi lokal memakai status bar/baterai, tanpa klaim identik pixel. |
| `plugins/image/iqcmerah.js` | `.iqcmerah` | Source memakai Canvas dengan template lokal dan emoji-map eksternal; adaptasi mempertahankan variasi merah, memakai font emoji lokal, tanpa mengunduh template/emoji. |
| `plugins/maker/iqcdark.js`, `lib/kernel/plugins/canvas/iqcpink.js`, `iqcpinkv2.js` | `.iqcdark`, `.iqcpink`, `.iqcpinkv2` | Renderer upstream bergantung API atau wrapper `adapter e9`; disediakan variasi palet lokal dari Canvas IQC5, bukan klaim replika pixel-perfect. |
| `plugins/image/iqcv2.js`, `plugins/image/iqcv3.js`, `plugins/maker/iqcsticker.js` | Tidak didaftarkan | Bergantung upload gambar publik, global API, atau unduh asset/font eksternal; input privat tidak diunggah dan dependency tersebut tidak dipalsukan. |
| `lib/kernel/plugins/canvas/iqcwindows.js`, `plugins/image/iqcwindows.js` | `.iqcwin`, `.wq` | Source yang ada hanya wrapper/API; Wa-bot memakai template Windows lokal sendiri dan tidak mengklaim hasilnya identik. |
| `lib/kernel/plugins/canvas/iqcwmp.js`, `plugins/image/iqcwmp.js` | Tidak didaftarkan | Hanya wrapper `adapter e9` yang merujuk implementasi di luar arsip. |
| Tidak ada renderer khusus IQC WhatsApp di source yang ditelusuri | Tidak didaftarkan | Tidak mengarang varian yang tidak dapat diverifikasi. |
| `plugins/image/o-tiktokchat.js`, `lib/kernel/plugins/canvas/tiktokchat.js` | `.tiktokchat` via `src/images/templates/tiktok.js` | Adaptasi lokal dari desain chat TikTok yang tersedia; menghindari upload avatar ke API eksternal. Bisa memakai avatar dari reply gambar. |
| `plugins/maker/maker-ytcomment.js` | `.ytcomment` via `src/images/templates/youtube-comment.js` | Source memakai API eksternal; desain komentar diadaptasi menjadi Canvas lokal dengan avatar reply opsional. |
| `plugins/image/igqc.js`, `lib/kernel/plugins/canvas/commentquote.js` | `src/features/ig/index.js` | Comment card iOS: header biru, like/unlike, bendera, balasan. |
| `plugins/maker/igpost.js` | `src/features/ig/index.js` | Post iOS: username|like|comment|repost + gambar reply. |
| `plugins/image/igstory.js`, `igstoryimg.js`, `plugins/maker/fakeigstory.js` | `src/features/ig/index.js` | Story iOS: blur, progress bar, avatar, ikon bawah. |
| `plugins/maker/fakeigprofile.js` | `src/features/ig/index.js` | Profil iOS: username|bio|pengikut|mengikuti|postingan + grid. |
| `plugins/maker/noteig.js` | `src/features/ig/index.js` | Notes iOS: nama|catatan|waktu, maksimal 7 kata. |
| Tidak ada file `.igdm` di arsip | `src/features/ig/index.js` | DM dibuat lokal memakai pola canvas vanXone; diberi label mockup. |

## 2. File Wa-bot baru

- `src/features/islam/index.js`, `src/features/islam/data/{ayat,zikir,sholawat,asmaul,quotes}.json`
- `src/features/sticker/service.js`, `src/features/sticker/index.js`
- `src/features/maker/index.js`
- `src/features/ai/writing.js`
- `src/features/ig/index.js`
- `src/images/templates/iqc5.js`, `src/images/templates/youtube-comment.js`
- `tests/ig.test.js`
- `tests/islam.test.js`, `tests/sticker.test.js`, `tests/maker.test.js`, `tests/ai-writing.test.js`
- `docs/VANXONE_INTEGRATION.md`

## 3. File dimodifikasi

- `src/ai/service.js`: tambah `askWithPrompt`, memakai `checkLimits` + `recordUsage` yang sama dengan `/ask`.
- `src/commands/router.js`: routing fitur dan `.doa`; tidak mengubah session WhatsApp.
- `src/commands/registry.js`, `src/commands/menu.js`: daftar command role-aware; `.menu` mengirim kartu ringkasan Canvas lalu daftar perintah lengkap. Label “BUKA MENU” hanya petunjuk visual karena Baileys 6.7.24 tidak menyediakan tombol native yang dipakai bot ini; tiga shortcut angka tetap berfungsi.
- `src/images/generator.js`: routing variasi IQC dan quote sosial; validasi input/media, render Canvas lokal, label simulasi, pembersihan file sementara.
- `src/features/islam/index.js`: transliterasi ayat, pencarian doa sesuai source, validasi MP3 dan cache murottal dengan batas ukuran/TTL.
- `src/features/sticker/service.js`: memberi tahu pengguna saat `.attp` hanya dapat membuat stiker statis karena FFmpeg tidak tersedia.
- `src/config.js`, `.env.example`: pengaturan cache audio; tidak ada key/API credential baru.
- `src/services/featureService.js`: enable flag fitur baru (semua role).
- `tests/islam.test.js`, `tests/sticker.test.js`, `tests/menu.test.js`: pengujian detail ayat/doa/audio/cache, stiker media, dan daftar command.
- `tests/images.test.js`: uji template quote, varian warna, input/avatar reply, serta label mockup.
- `README.md`, `COMMANDS.md`: dokumentasi isi menu.

## 4. Dependency

Tidak ada dependency npm baru. Modul memakai `sharp` dan `@napi-rs/canvas` yang sudah ada. `ffmpeg` opsional (env `FFMPEG` atau `ffmpeg` di PATH) untuk stiker animasi dan konversi video.

## 5. API eksternal

- `https://api.alquran.cloud/v1/...` — ayat dinamis, daftar/detail surah (gratis, tanpa key).
- QuranJSON CDN (`raw.githubusercontent.com/...`) — URL audio murottal; divalidasi sebelum dikirim.
- Endpoint doa yang tercantum di `plugins/islam/islami.js` — daftar/detail doa Arab, Latin, dan terjemahan. Status endpoint diperiksa saat audit; ketersediaan dapat berubah.

Tidak ada endpoint AI gambar yang dipakai karena tidak tersedia kredensialnya.

## 6. Environment variable

- `FFMPEG` (opsional): path binary ffmpeg untuk fitur animasi.
- `QURAN_AUDIO_CACHE_DIR`, `QURAN_AUDIO_MAX_MB`, `QURAN_AUDIO_CACHE_MAX_MB`, `QURAN_AUDIO_CACHE_TTL_DAYS`, `QURAN_AUDIO_TIMEOUT_MS` (opsional): lokasi, batas ukuran, masa simpan, dan timeout unduh murottal.
- Variabel AI yang sudah ada (`OPENROUTER_*`, model config) tetap dipakai; tidak ada variabel baru wajib.

## 7. Command baru

Islam: `.ayat`, `.surah`, `.murottal`, `.asmaul`, `.zikir`, `.istighfar`, `.tahlil`, `.sholawat`, `.quotesislam`, `.doa [kata kunci]`.
Stiker: `.sticker`, `.s`, `.ttp`, `.attp`, `.qc`, `.brat`, `.emojimix`, `.toimg`, `.pack` (+ alias source).
Maker: `.logo3d`, `.logogold`, `.sologo` (info tidak tersedia).
AI: `.aiwrite`, `.rewrite`, `.ringkas`, `.fixcode`, `.explaincode`, `.debug`.
Instagram iOS mockup: `.igqc`, `.igpost`, `.igstory`, `.igprofile`, `.igdm`, `.ignote`. Semua hasil diberi label "MOCKUP / SIMULASI — BUKAN INSTAGRAM ASLI". .igdm tidak memiliki source langsung di arsip; dibuat lokal dan diberi label mockup.
Quote/chat: `.iqc`, `.iqc2`, `.iqc5` (`.qc5` alias), `.iqcdark`, `.iqcpink`, `.iqcpinkv2`, `.iqcmerah`, `.tqc`, `.tiktokchat` (`.ttchat` alias), `.wq` (`.iqcwin` alias), `.ytcomment`. Semua gambar diberi watermark mockup dan caption simulasi.
AI gambar: `.aiedit`, `.aifilter`, `.toanime`, `.tocartoon`, `.toreal` (pesan jelas “belum tersedia” — tidak menghasilkan gambar palsu).

Privasi: `.rvo` Wa-bot tetap hanya meneruskan foto biasa. Implementasi vanXone `.rvo` yang mengekspos media *view-once* **sengaja tidak diintegrasikan**.

## 8. Batas integrasi yang diaudit

- Endpoint doa berhasil merespons saat audit. Payload doa mencakup Arab, Latin, dan terjemahan, tetapi tidak mencantumkan sanad/referensi untuk tiap doa; bot menyatakan batasan itu dan tidak menambahkan klaim keutamaan.
- `bacaansholat.js` bergantung pada adapter global dan API `kyzz` tanpa URL/kredensial portabel, jadi command itu tidak didaftarkan.
- Editing/filter/logo AI tetap nonaktif sampai ada provider dan API key resmi yang dikonfigurasi. `.sologo` menjelaskan keterbatasan; tidak ada permintaan jaringan palsu.
- Variasi `.iqcdark`, `.iqcpink`, dan `.iqcpinkv2` adalah adaptasi palet lokal, bukan replika pixel-perfect renderer upstream yang tidak tersedia. `.iqcwmp`, `.iqcv2`, `.iqcv3`, dan `.iqcsticker` tidak didaftarkan karena memerlukan backend/API atau upload eksternal. Arsip yang ditelusuri tidak memiliki renderer khusus IQC WhatsApp.
- `attp` menjadi stiker animasi hanya bila FFmpeg tersedia; tanpa FFmpeg hasilnya stiker statis dan bot memberi tahu pengguna. FFmpeg tidak terpasang di lingkungan audit ini, jadi dua uji konversi GIF/video dilewati; uji konversi nyata perlu dijalankan pada host Termux yang sudah memasang FFmpeg.
- Pengujian memakai fetch/media palsu untuk menghindari request eksternal; uji live tidak menjamin layanan pihak ketiga selalu tersedia.

## 9. Menjalankan / memperbarui

```bash
cd ~/Wa-bot
npm install
npm test
node src/index.js
```

Bot kedua tidak dijalankan. Database `data/bot.db`, tabel lama, dan sesi WhatsApp tidak diubah/reset.
