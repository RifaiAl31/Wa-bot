# DEPLOYMENT GUIDE — WhatsApp Bot (Termux / Linux)

Sistem ini memakai Git sebagai satu-satunya jalur deploy. Laptop = development, HP Termux = production.

```
Laptop: edit → npm test → git commit → git push origin main/development
HP:     ./deploy.sh (atau Dashboard → System → Deploy update)
```

## 1. Persiapan GitHub

1. Buat repository **private** `wa-bot` (sudah: `RifaiAl31/wa-bot`).
2. Branch:
   - `main` → production, satu-satunya branch yang boleh di-deploy.
   - `development` → tempat eksperimen; **tidak** bisa di-deploy langsung.
3. Laptop:
   ```sh
   git clone git@github.com:RifaiAl31/wa-bot.git
   cd wa-bot
   git checkout -b development
   # coding...
   npm test
   git add .
   git commit -m "Deskripsi perubahan"
   git push origin development
   # bila siap produksi:
   git checkout main && git merge development && git push origin main
   ```
4. CI otomatis berjalan di `.github/workflows/ci.yml` (`npm ci`, `npm test`, `npm audit`).

## 2. SSH Deploy Key (read-only) di Termux

Disarankan deploy key khusus dengan akses **read-only**.

```sh
# di Termux
ssh-keygen -t ed25519 -f ~/.ssh/wa_bot_deploy -N ""
cat ~/.ssh/wa_bot_deploy.pub
```

Tempel public key di GitHub → repo → Settings → Deploy keys → Add deploy key. **Jangan** centang "Allow write access".

Tambahkan di `~/.ssh/config`:

```
Host wa-bot-github
  HostName github.com
  User git
  IdentityFile ~/.ssh/wa_bot_deploy
  IdentitiesOnly yes
```

Set remote:

```sh
cd ~/Wa-bot
git remote set-url origin git@wa-bot-github:RifaiAl31/wa-bot.git
ssh -T wa-bot-github
git ls-remote origin HEAD
```

Jika port 22 diblokir, gunakan port 443:

```
Host wa-bot-github
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/wa_bot_deploy
```

## 3. Setup Termux

```sh
pkg update && pkg upgrade
pkg install nodejs-lts git python make clang
cd ~ && git clone git@wa-bot-github:RifaiAl31/wa-bot.git Wa-bot
cd ~/Wa-bot
npm ci --no-audit --no-fund
cp .env.example .env
nano .env
npm run init-db
node scripts/set-admin-password.js   # ADMIN_PASSWORD=... dari environment
```

Catatan native module:
- `better-sqlite3` dan `@napi-rs/canvas` biasanya punya prebuilt ARM64. Jika gagal:
  ```sh
  export npm_config_build_from_source=1
  npm ci --no-audit --no-fund
  ```
- Jangan salin `node_modules` dari laptop x86 ke Termux ARM64.

Isi `.env` minimal:
```
PORT=1234
ADMIN_NUMBERS=<nomor admin>
OPEN_ACCESS=true
ADMIN_PASSWORD=<password panel management>
AI_COOLDOWN_SECONDS=20
DEPLOY_BRANCH=main
TUNNEL_PORT=1234
```

## 4. Kunci Dashboard

Panel perlu password agar endpoint deploy/restart/backup tidak terbuka.

```sh
ADMIN_PASSWORD='password-anda' node scripts/set-admin-password.js
```

Password di-hash scrypt ke tabel `bot_settings` (`admin_password_hash`). Password plaintext tidak pernah ditulis ke file, log, atau repo.

- Cookie sesi: HttpOnly, SameSite=Lax, HMAC, 8 jam.
- CSRF: cookie `wa_csrf` + header `X-CSRF-Token` untuk semua POST.
- Rate limit: login 6 percobaan/menit; aksi management 30/view/10 menit.
- Jika dashboard diakses lewat HTTPS/tunnel, set `COOKIE_SECURE=true`.

## 5. Cara Deploy

Satu perintah:

```sh
cd ~/Wa-bot
./deploy.sh
```

Atau Dashboard → **System** → *Check update* lalu *Deploy update*.

Alur `deploy.sh`:
1. Cek branch aktif harus `main`.
2. Cek working tree bersih.
3. `git fetch origin main`, bandingkan commit.
4. Backup database + `.env` ke `data/backups/`.
5. Simpan commit lama di `deployment_history`.
6. `git pull --ff-only origin main`.
7. Jika `package.json`/`package-lock.json` berubah → `npm ci` (fallback `npm install`).
8. `npm run migrate`.
9. Restart bot (proses lama keluar, lock dilepas, proses baru spawn).
10. `scripts/deploy-verify.js` polling `/api/health` sampai OK.
11. Status deployment ditulis ke `deployment_history`.

Tidak ada update → status `noop`, tidak ada restart.

Opsi darurat:

```sh
ALLOW_DIRTY=1 ./deploy.sh     # paksa deploy walau working tree kotor
```

## 6. Service & Process Manager

Tidak bergantung pada systemd; PID disimpan di `data/run/`.

```sh
./status.sh         # status bot, dashboard, tunnel, node, git
./start-all.sh      # start bot + tunnel
./stop-all.sh       # stop keduanya
./restart-all.sh    # restart tunnel + bot
node scripts/process-cli.js logs bot 100
```

Dashboard dan bot berjalan dalam **satu proses Node**. “Restart dashboard” = restart bot. Tunnel adalah proses terpisah.

Single-instance lock ada di `data/bot-<hash>.pid`; bot kedua dengan database sama akan ditolak.

## 7. Cloudflare Tunnel

Quick tunnel (tanpa domain):

```sh
./start-all.sh
```

External URL muncul di Dashboard → System → Cloudflare Tunnel dan dibaca dari `data/logs/tunnel.log`.

Named tunnel:

```
TUNNEL_NAME=wa-bot
TUNNEL_COMMAND=
TUNNEL_PORT=1234
```

`TUNNEL_COMMAND` boleh diisi executable + argumen tanpa karakter shell; dilarang `;`, `|`, backtick, `$`, `<`, `>`.

Catatan: quick tunnel URL berubah setiap restart. Restart bot **tidak** menghentikan tunnel.

## 8. Backup & Restore

```sh
./backup.sh                      # database saja
# dari dashboard: Backup database + config (database + .env)
node scripts/restore.js bot-2026-...db
```

Semua backup ada di `data/backups/` (di-`.gitignore`). Restore database **tidak** menyentuh sesi WhatsApp di `data/auth/`.

Rollback source:

```sh
node scripts/deploy-cli.js rollback            # commit sebelumnya
node scripts/deploy-cli.js rollback <hash>     # commit tertentu
```

Rollback sengaja **tidak** mengembalikan database otomatis. Jika migrasi sudah mengubah schema, periksa dulu kompatibilitasnya sebelum memulihkan backup lama.

## 9. Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Management belum dikunci` | `ADMIN_PASSWORD=... node scripts/set-admin-password.js` |
| `Login diperlukan` | Klik Login admin di header dashboard |
| `Token CSRF tidak valid` | Logout/login ulang; jangan kirim POST tanpa header CSRF |
| `Branch aktif bukan main` | `git checkout main` di Termux |
| `Working tree tidak bersih` | Simpan/commit perubahan, atau `ALLOW_DIRTY=1` |
| `Authentication failed` saat fetch | Cek deploy key read-only dan `ssh -T wa-bot-github` |
| `npm ci` gagal di ARM64 | `npm_config_build_from_source=1 npm ci` |
| Health check gagal | Lihat `data/logs/bot.log` dan `data/logs/deploy.log` |
| Tunnel mati | `node scripts/process-cli.js restart-tunnel` |

## 10. Keamanan

- `.env`, `data/`, `*.db`, `*.pid`, `*.key`, `id_ed25519*`, `cloudflared` masuk `.gitignore`.
- Tidak ada API key, token GitHub, password, atau session WhatsApp yang dikirim ke GitHub.
- Endpoint `/api/system/*` selalu butuh login + CSRF.
- Jangan expose port internal selain dashboard yang sudah dilindungi.
