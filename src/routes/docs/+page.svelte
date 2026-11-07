<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let check_website = $state('');
	let negara = $state('');
	let limit = $state(100);
	let random = $state(false);
	let format = $state('json');

	const path = $derived.by(() => {
		const q = new URLSearchParams();
		if (check_website.trim()) q.set('check_website', check_website.trim());
		if (negara) q.set('negara', negara);
		if (limit !== 100) q.set('limit', String(limit));
		if (random) q.set('random', '1');
		if (format !== 'json') q.set('format', format);
		return `/api/proxies${q.size ? `?${q}` : ''}`;
	});
	const curl = $derived(`curl '${page.url.origin}${path}'`);

	let res = $state<{ status: number; ms: number; body: string; count: number | null } | null>(null);
	let loading = $state(false);
	let copied = $state(false);

	async function execute() {
		loading = true;
		const t = performance.now();
		try {
			const r = await fetch(path);
			const text = await r.text();
			let body = text;
			let count: number | null = null;
			try {
				const json = JSON.parse(text);
				body = JSON.stringify(json, null, 2);
				if (Array.isArray(json)) count = json.length;
			} catch {
				if (r.ok) count = text ? text.split('\n').length : 0; // txt format
			}
			res = { status: r.status, ms: Math.round(performance.now() - t), body, count };
		} catch (e) {
			res = { status: 0, ms: Math.round(performance.now() - t), body: String(e), count: null };
		} finally {
			loading = false;
		}
	}

	async function copy() {
		await navigator.clipboard.writeText(curl);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const example = `[
  {
    "proxy": "socks5://1.2.3.4:1080",
    "country": "ID",
    "anonymity": "elite",
    "latency": 2931,
    "sites": { "instagram": 2931, "x": null, "threads": null, "youtube": 1840, "tiktok": null }
  }
]`;
</script>

<svelte:head><title>API Docs · Proxy Monitor</title></svelte:head>

<main>
	<header>
		<h1>API Docs</h1>
		<p class="muted">Ambil proxy yang lolos cek terakhir. Tanpa auth. Base URL: <code>{page.url.origin}</code></p>
	</header>

	<details class="card op" open>
		<summary>
			<span class="method">GET</span>
			<code class="path">/api/proxies</code>
			<span class="muted summary-text">Daftar proxy aktif</span>
		</summary>

		<div class="body">
			<p>
				Hanya mengembalikan proxy berstatus aktif. Kalau <code>check_website</code> diisi, hasil hanya proxy yang
				berhasil membuka situs itu, diurutkan dari latency tercepat. Tanpa itu, diurutkan dari yang terakhir OK.
			</p>

			<h2>Parameters</h2>
			<div class="scroll">
				<table>
					<thead>
						<tr><th>Nama</th><th>Tipe</th><th>Deskripsi</th><th>Nilai</th></tr>
					</thead>
					<tbody>
						<tr>
							<td><code>check_website</code><span class="in">query</span></td>
							<td class="muted">string</td>
							<td>Situs yang harus bisa dibuka lewat proxy pada cek terakhir. Hasil diurutkan dari latency tercepat.</td>
							<td>
								<select bind:value={check_website} aria-label="check_website">
									<option value="">(semua)</option>
									{#each data.sites as s (s)}<option value={s}>{s}</option>{/each}
								</select>
							</td>
						</tr>
						<tr>
							<td><code>negara</code><span class="in">query</span></td>
							<td class="muted">string</td>
							<td>Kode negara ISO-2, tidak peka huruf besar/kecil. Contoh: <code>ID</code>, <code>SG</code>.</td>
							<td>
								<select bind:value={negara} aria-label="negara">
									<option value="">(semua)</option>
									{#each data.countries as c (c.code)}<option value={c.code}>{c.code} · {c.n} aktif</option>{/each}
								</select>
							</td>
						</tr>
						<tr>
							<td><code>limit</code><span class="in">query</span></td>
							<td class="muted">integer</td>
							<td>Jumlah maksimal baris. Default 100, maks 1000.</td>
							<td><input type="number" min="1" max="1000" bind:value={limit} aria-label="limit" /></td>
						</tr>
						<tr>
							<td><code>random</code><span class="in">query</span></td>
							<td class="muted">flag</td>
							<td>Ambil acak dari 20 proxy terbaru yang cocok filter, untuk rotasi. Hasil maksimal 20.</td>
							<td>
								<label class="check"><input type="checkbox" bind:checked={random} /> acak</label>
							</td>
						</tr>
						<tr>
							<td><code>format</code><span class="in">query</span></td>
							<td class="muted">string</td>
							<td><code>json</code> (default) atau <code>txt</code>: satu <code>protocol://ip:port</code> per baris.</td>
							<td>
								<select bind:value={format} aria-label="format">
									<option value="json">json</option>
									<option value="txt">txt</option>
								</select>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="exec">
				<button class="btn primary" onclick={execute} disabled={loading}>{loading ? 'Memuat…' : 'Execute'}</button>
				<a class="btn" href={path} target="_blank" rel="noopener">Buka di tab baru</a>
			</div>

			<h2>Request</h2>
			<div class="codebox">
				<pre>{curl}</pre>
				<button class="btn sm" onclick={copy}>{copied ? 'Tersalin' : 'Salin'}</button>
			</div>

			{#if res}
				<h2>
					Response
					<span class="code" class:err={res.status !== 200}>{res.status || 'Error'}</span>
					<span class="muted meta">{res.ms} ms{res.count !== null ? ` · ${res.count} proxy` : ''}</span>
				</h2>
				<pre class="out">{res.body || '(kosong)'}</pre>
			{/if}

			<h2>Responses</h2>
			<div class="resp">
				<span class="code">200</span>
				<div>
					<p>Array proxy. <code>latency</code> = ms ke <code>check_website</code>, <code>null</code> kalau tidak diisi. <code>sites</code>: ms per situs, <code>null</code> = gagal.</p>
					<pre class="out">{example}</pre>
				</div>
			</div>
			<div class="resp">
				<span class="code err">400</span>
				<p><code>check_website</code> bukan salah satu situs di atas, atau <code>negara</code> bukan kode 2 huruf.</p>
			</div>
		</div>
	</details>
</main>

<style>
	main { max-width: 1000px; }
	header { margin-bottom: 20px; }
	h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
	header p { margin: 4px 0 0; }
	h2 { display: flex; align-items: center; gap: 10px; margin: 24px 0 10px; font-size: 14px; font-weight: 600; }

	.op { border-color: #3b82f680; overflow: visible; }
	summary {
		display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer;
		background: #3b82f614; border-radius: 12px; list-style: none;
	}
	summary::-webkit-details-marker { display: none; }
	.op[open] summary { border-bottom: 1px solid #3b82f640; border-radius: 12px 12px 0 0; }
	.method { padding: 4px 10px; border-radius: 6px; background: #3b82f6; color: #fff; font: 700 12px var(--mono); }
	.path { font-size: 15px; font-weight: 500; }
	.summary-text { font-size: 13px; }
	.body { padding: 4px 16px 20px; }
	.body > p { margin: 12px 0 0; color: var(--muted); }

	.scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { padding: 8px 12px; text-align: left; background: var(--surface-2); color: var(--muted); font-size: 12px; font-weight: 600; }
	td { padding: 10px 12px; border-top: 1px solid var(--border); vertical-align: middle; }
	td:first-child { white-space: nowrap; }
	td:last-child { width: 220px; }
	td select, td input:not([type='checkbox']) { width: 100%; }
	.in { display: block; color: var(--muted); font-size: 11px; font-style: italic; }
	.check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
	.check input { width: 16px; height: 16px; accent-color: var(--accent); }

	.exec { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }

	pre { margin: 0; font: 13px/1.6 var(--mono); white-space: pre-wrap; word-break: break-all; }
	.codebox {
		display: flex; gap: 12px; align-items: center; padding: 10px 12px;
		background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
	}
	.codebox pre { flex: 1; }
	.out { max-height: 420px; overflow: auto; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }

	.code {
		padding: 2px 8px; border-radius: 6px; font: 600 12px var(--mono);
		color: var(--ok); background: var(--ok-bg);
	}
	.code.err { color: var(--bad); background: var(--bad-bg); }
	.meta { font-weight: 400; font-size: 13px; }
	.resp { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--border); }
	.resp p { margin: 0 0 8px; }
	.resp > div { flex: 1; min-width: 0; }

	@media (max-width: 640px) {
		td:last-child { width: auto; min-width: 140px; }
		.summary-text { display: none; }
	}
</style>
