# menglabs-proxy

Monitor proxy gratis. Tiap ±5 menit GitHub Actions ambil daftar proxy dari proxyscrape (TH, TW, SG, MY, JP, ID, IN, CN), tes ke Instagram, X, Threads, YouTube, TikTok, dan simpan yang hidup ke Turso. Cloudflare Workers menyajikan dashboard dan API.

```
GitHub Actions (cron, curl)  ──write──▶  Turso  ◀──read──  Cloudflare Workers (UI + API)
scripts/check.ts                                         src/ (SvelteKit)
```

## Jalankan lokal

```sh
pnpm install
pnpm check:proxies   # sekali cek, butuh curl
pnpm dev             # http://localhost:5173
```

Tanpa `.env`, data disimpan di `local.db`. Untuk pakai Turso, buat `.env`:

```
TURSO_DATABASE_URL=libsql://<db>.turso.io
TURSO_AUTH_TOKEN=<token>
```

## Deploy

1. **Worker** (sekali login: `pnpm wrangler login`):
   ```sh
   pnpm wrangler secret put TURSO_DATABASE_URL
   pnpm wrangler secret put TURSO_AUTH_TOKEN
   pnpm wrangler secret put GITHUB_TOKEN   # opsional, untuk tombol "Run sekarang"
   pnpm run deploy
   ```
   `GITHUB_TOKEN` = fine-grained token, repo ini saja, permission **Actions: Read and write**.
2. **Checker**: di GitHub repo → Settings → Secrets and variables → Actions, isi `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`. Workflow `.github/workflows/check.yml` jalan otomatis tiap 5 menit, atau manual dari tab Actions.

Kalau pakai Cloudflare Workers Builds (deploy dari git): build command `pnpm build`, deploy command `npx wrangler deploy`.

## Halaman

- `/` — Monitor: tabel proxy (terbaru di atas), filter aktif, tombol run.
- `/docs` — API docs interaktif (coba langsung dari browser).

## API

`GET /api/proxies`

| Param | Keterangan |
|---|---|
| `check_website` | `instagram`, `x`, `threads`, `youtube`, `tiktok`. Hasil cek terakhir, urut latency. |
| `negara` | Kode ISO-2, mis. `ID`, `SG`. |
| `limit` | Default 100, maks 1000. |
| `random` | Acak urutan (rotasi). |
| `format` | `json` (default) atau `txt` (satu proxy per baris). |

```sh
curl 'http://localhost:5173/api/proxies?check_website=instagram&negara=ID&limit=10'
curl 'http://localhost:5173/api/proxies?negara=SG&random=1&format=txt'
```

API tanpa auth. Pasang rate limit / API key sebelum dibuka ke publik.
