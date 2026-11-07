# menglabs-proxy

Monitor proxy gratis. Tiap 5 menit ambil daftar proxy dari proxyscrape (TH, TW, SG, MY, JP, ID, IN, CN), tes ke Instagram, X, Threads, YouTube, TikTok, simpan yang hidup ke DB, dan sediakan API untuk ambil proxy.

Stack: SvelteKit + libSQL (SQLite lokal atau Turso). Butuh `curl` di server.

## Jalankan

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

Tanpa `.env`, data disimpan di `local.db`. Untuk pakai Turso, salin `.env.example` ke `.env` lalu isi:

```
TURSO_DATABASE_URL=libsql://<db>.turso.io
TURSO_AUTH_TOKEN=<token>
```

Production (butuh server yang jalan terus, scheduler pakai `setInterval`):

```sh
pnpm build
node build
```

## Halaman

- `/` — Monitor: tabel proxy (terbaru di atas), filter aktif, tes manual, tombol run.
- `/docs` — API docs interaktif (coba langsung dari browser).

## API

`GET /api/proxies`

| Param | Keterangan |
|---|---|
| `check_website` | `instagram`, `x`, `threads`, `youtube`, `tiktok` = pakai hasil cek terakhir. Domain lain (mis. `google.com`) = dites langsung, maks 50 hasil. |
| `negara` | Kode ISO-2, mis. `ID`, `SG`. |
| `limit` | Default 100, maks 1000. |
| `random` | Acak urutan (rotasi). |
| `format` | `json` (default) atau `txt` (satu proxy per baris). |

```sh
curl 'http://localhost:5173/api/proxies?check_website=instagram&negara=ID&limit=10'
curl 'http://localhost:5173/api/proxies?check_website=google.com&format=txt'
```

API tanpa auth. Pasang rate limit / API key sebelum dibuka ke publik.
