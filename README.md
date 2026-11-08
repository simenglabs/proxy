# menglabs-proxy

Monitor proxy gratis. Tiap 5 menit server checker ambil daftar proxy dari proxyscrape (TH, TW, SG, MY, JP, ID, IN, CN) dan proxifly (ID), tes ke Instagram, X, Threads, YouTube, TikTok, lalu kirim hasilnya ke `POST /api/sync`. Cloudflare Workers menyimpan ke Turso dan menyajikan dashboard + API.

```
server LAN (cron, curl)  ──POST /api/sync──▶  Cloudflare Workers  ──▶  Turso
scripts/check.ts                               src/ (SvelteKit)
```

Workers tidak bisa menjalankan `curl`, jadi pengecekan harus di mesin lain.

## Jalankan lokal

```sh
pnpm install
echo "SYNC_TOKEN=$(openssl rand -hex 32)" > .env
pnpm dev             # http://localhost:5173, data di local.db
pnpm check:proxies   # sekali cek ke http://localhost:5173/api/sync, butuh curl
```

## Deploy Worker

```sh
pnpm wrangler login
pnpm wrangler secret put TURSO_DATABASE_URL
pnpm wrangler secret put TURSO_AUTH_TOKEN
pnpm wrangler secret put SYNC_TOKEN      # token yang sama dipakai server checker
pnpm run deploy
```

## Server checker

Butuh Node >= 22.18 dan curl. Tidak perlu `npm install`.

```sh
git clone https://github.com/simenglabs/proxy.git ~/menglabs-proxy
cd ~/menglabs-proxy
cat > .env <<'EOF'
SYNC_URL=https://proxy.nasriadzlani.workers.dev/api/sync
SYNC_TOKEN=<token>
EOF
chmod 600 .env
node --env-file=.env scripts/check.ts    # tes sekali (±6 menit)
```

Cron tiap 5 menit (`crontab -e`), `flock` mencegah run bertumpuk:

```
*/5 * * * * cd ~/menglabs-proxy && flock -n /tmp/proxy-check.lock /usr/bin/node --env-file=.env scripts/check.ts >> ~/proxy-check.log 2>&1
```

Ganti `/usr/bin/node` dengan hasil `which node`. Update kode: `git pull`.

`.github/workflows/check.yml` cadangan manual (tab Actions → Run workflow), butuh secret `SYNC_URL` dan `SYNC_TOKEN` di GitHub.

## Halaman

- `/` — Monitor: tabel proxy (terbaru di atas), filter aktif.
- `/docs` — API docs interaktif (coba langsung dari browser).

## API

`GET /api/proxies`

| Param | Keterangan |
|---|---|
| `check_website` | `instagram`, `x`, `threads`, `youtube`, `tiktok`. Hasil cek terakhir, urut latency. |
| `negara` | Kode ISO-2, mis. `ID`, `SG`. |
| `limit` | Default 100, maks 1000. |
| `random` | Ambil acak dari 20 proxy terbaru (yang cocok filter). |
| `format` | `json` (default) atau `txt` (satu proxy per baris). |

```sh
curl 'http://localhost:5173/api/proxies?check_website=instagram&negara=ID&limit=10'
curl 'http://localhost:5173/api/proxies?negara=SG&random=1&format=txt'
```

API tanpa auth. Pasang rate limit / API key sebelum dibuka ke publik.
