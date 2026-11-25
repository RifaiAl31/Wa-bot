# Integrasi fitur vanXone v7 ke Wa-bot

Sumber: `vanxone_v7.zip` (diekstrak ke direktori referensi terpisah; tidak dijalankan sebagai bot kedua).
Atribusi kode/data: `× - vanXone </>`. Tidak ada credential, cookie, session, atau API key yang disalin.

## 1. Pemetaan sumber → tujuan

| Sumber vanXone | Tujuan Wa-bot | Catatan |
|---|---|---|
| `plugins/islam/ayat.js` | `src/features/islam/data/ayat.json`, `src/features/islam/index.js` | Ayat pilihan dipakai langsung; pencarian `surah:ayat` memakai endpoint dari `lib/kernel/plugins/search/quran.js`. |
| `lib/kernel/plugins/search/quran.js` | `src/features/islam/index.js` | `https://api.alquran.cloud/v1/...`, tanpa API key. |
| `plugins/islam/surah.js`, `murrotal.js`, `audiosurah.js` | `src/features/islam/index.js` | Daftar/detail surah, validasi URL audio QuranJSON CDN. |
| `plugins/islam/zikir.js`, `sholawat.js`, `asmaulhusna.js`, `bacaansholat.js`, `istighfar.js`, `tahlil.js` | `src/features/islam/data/*.json`, `src/features/islam/index.js` | Data Arab/Latin/terjemahan diambil dari source, bukan ditulis ulang. |
| `lib/kernel/plugins/quotes/quotesislam.js` | `src/features/islam/data/quotes.json` | Array quotes asli diekstrak utuh. |
| `plugins/sticker/*.js`, `lib/kernel/lib/engine/plugins.js` | `src/features/sticker/service.js`, `index.js` | Konversi WEBP 512, EXIF pack, text/quote/brat/emoji mix, toimg; ffmpeg opsional. |
| `plugins/maker/logo3d.js`, `logogold.js` | `src/features/maker/index.js` | Canvas 2D lokal, gradient 3D/emas, border dekoratif. |
| `plugins/ai/ai-rewriter.js`, `chatgpt.js`, `deepseek.js`, `gemini.js`, `glm-ai.js`, `fixcode.js` | `src/features/ai/writing.js` | Pola prompt diadaptasi, eksekusi lewat `aiService.askWithPrompt` (kuota terpusat). |
| `plugins/ai/aiedit.js`, `editimage*.js`, `aifilter.js`, `o-toanime.js`, `o-sologo.js` | Belum diintegrasikan | Bergantung image-generation API ber-key; bot tidak mengarang endpoint atau hasil gambar. |
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
- `tests/ig.test.js`
- `tests/islam.test.js`, `tests/sticker.test.js`, `tests/maker.test.js`, `tests/ai-writing.test.js`
- `docs/VANXONE_INTEGRATION.md`

## 3. File dimodifikasi

- `src/ai/service.js`: tambah `askWithPrompt`, memakai `checkLimits` + `recordUsage` yang sama dengan `/ask`.
- `src/commands/router.js`: routing command baru, tanpa mengubah session WhatsApp.
- `src/commands/registry.js`: kategorisasi menu ISLAM, STICKER, MAKER, AI IMAGE, AI ASSISTANT. Tiga tombol interaktif utama tetap ada.
- `src/services/featureService.js`: enable flag fitur baru (semua role).

## 4. Dependency

Tidak ada dependency npm baru. Modul memakai `sharp` dan `@napi-rs/canvas` yang sudah ada. `ffmpeg` opsional (env `FFMPEG` atau `ffmpeg` di PATH) untuk stiker animasi dan konversi video.

## 5. API eksternal

- `https://api.alquran.cloud/v1/...` — ayat dinamis, daftar/detail surah (gratis, tanpa key).
- QuranJSON CDN (`raw.githubusercontent.com/...`) — URL audio murottal; divalidasi sebelum dikirim.

Tidak ada endpoint AI gambar yang dipakai karena tidak tersedia kredensialnya.

## 6. Environment variable

- `FFMPEG` (opsional): path binary ffmpeg untuk fitur animasi.
- Variabel AI yang sudah ada (`OPENROUTER_*`, model config) tetap dipakai; tidak ada variabel baru wajib.

## 7. Command baru

Islam: `.ayat`, `.surah`, `.murottal`, `.asmaul`, `.zikir`, `.istighfar`, `.tahlil`, `.sholawat`, `.quotesislam`, `.doa`.
Stiker: `.sticker`, `.s`, `.ttp`, `.attp`, `.qc`, `.brat`, `.emojimix`, `.toimg`, `.pack` (+ alias source).
Maker: `.logo3d`, `.logogold`, `.sologo` (info tidak tersedia).
AI: `.aiwrite`, `.rewrite`, `.ringkas`, `.fixcode`, `.explaincode`, `.debug`.
Instagram iOS mockup: `.igqc`, `.igpost`, `.igstory`, `.igprofile`, `.igdm`, `.ignote`. Semua hasil diberi label "MOCKUP / SIMULASI — BUKAN INSTAGRAM ASLI". .igdm tidak memiliki source langsung di arsip; dibuat lokal dan diberi label mockup.
AI gambar: `.aiedit`, `.aifilter`, `.toanime`, `.tocartoon`, `.toreal` (pesan jelas “belum tersedia” — tidak menghasilkan gambar palsu).

Privasi: `.rvo` Wa-bot tetap hanya meneruskan foto biasa. Implementasi vanXone `.rvo` yang mengekspos media *view-once* **sengaja tidak diintegrasikan**.

## 8. Menjalankan / memperbarui

```bash
cd ~/Wa-bot
npm install
npm test
node src/index.js
```

Bot kedua tidak dijalankan. Database `data/bot.db`, tabel lama, dan sesi WhatsApp tidak diubah/reset.
