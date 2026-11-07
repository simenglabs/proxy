<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const href = (page: number, alive = data.aliveOnly) => {
		const q = new URLSearchParams();
		if (alive) q.set('alive', '1');
		if (page > 1) q.set('page', String(page));
		return `?${q}`;
	};
	// first, last, and 2 either side of current; gaps rendered as …
	const nums = $derived(
		[...new Set([1, data.page - 2, data.page - 1, data.page, data.page + 1, data.page + 2, data.pages])]
			.filter((n) => n >= 1 && n <= data.pages)
			.sort((a, b) => a - b)
	);
	const last = $derived(data.status.lastRun);

	// refresh table periodically so scheduler results show up without reload
	$effect(() => {
		const t = setInterval(invalidateAll, 20_000);
		return () => clearInterval(t);
	});

	function ago(ts: number | null) {
		if (!ts) return '-';
		const s = Math.round((Date.now() - ts) / 1000);
		return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
	}

	// ponytail: fixed thresholds, tune if target sites differ a lot in baseline latency
	const speed = (ms: number | null | undefined) =>
		ms == null ? 'bad' : ms < 3000 ? 'ok' : 'warn';
</script>

{#snippet latency(ms: number | null | undefined)}
	<span class="pill {speed(ms)}">{ms == null ? '—' : `${ms} ms`}</span>
{/snippet}

<main>
	<header>
		<div>
			<h1>Proxy Monitor</h1>
			<p class="sub">Dicek otomatis oleh GitHub Actions · halaman refresh tiap 20 detik</p>
		</div>
		<span class="live" class:on={data.status.running} aria-live="polite">
			<span class="dot"></span>{data.status.running ? 'Scheduler jalan' : 'Idle'}
		</span>
	</header>

	<section class="stats" aria-label="Ringkasan">
		<div class="stat">
			<span class="label">Aktif</span>
			<span class="value"><span class="okc">{data.alive}</span><span class="of"> / {data.total}</span></span>
		</div>
		<div class="stat">
			<span class="label">Run terakhir</span>
			<span class="value">{last ? `${ago(last.at)} lalu` : '-'}</span>
		</div>
		<div class="stat">
			<span class="label">Lolos run terakhir</span>
			<span class="value">{last ? `${last.alive} / ${last.checked}` : '-'}</span>
		</div>
		<div class="stat">
			<span class="label">Durasi</span>
			<span class="value">{last ? `${Math.round(last.ms / 1000)} s` : '-'}</span>
		</div>
	</section>
	{#if last?.error}<p class="alert">Run terakhir error: {last.error}</p>{/if}

	<section class="toolbar">
		<div class="right">
			<div class="seg" role="group" aria-label="Filter">
				<a href={href(1, false)} aria-current={!data.aliveOnly ? 'true' : undefined}>Semua</a>
				<a href={href(1, true)} aria-current={data.aliveOnly ? 'true' : undefined}>Aktif saja</a>
			</div>
			{#if data.canRun}
				<form method="POST" action="?/run" use:enhance>
					<button class="btn primary" disabled={data.status.running}>
						{data.status.running ? 'Berjalan…' : 'Run sekarang'}
					</button>
				</form>
			{/if}
		</div>
	</section>

	{#if form && 'error' in form}
		<p class="alert" role="alert">{form.error}</p>
	{:else if form?.started}
		<p class="info" role="status">Run dipicu. GitHub Actions butuh ±30 detik untuk mulai.</p>
	{/if}

	<div class="card">
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th>Proxy</th><th>Negara</th><th>Anonimitas</th>
						{#each data.sites as s (s)}<th>{s}</th>{/each}
						<th>Status</th><th>Ditambahkan</th><th>Dicek</th><th>OK terakhir</th>
					</tr>
				</thead>
				<tbody>
					{#each data.proxies as p (p.id)}
						<tr class:dead={!p.alive}>
							<td><code>{p.id}</code></td>
							<td>{p.country ?? '-'}</td>
							<td class="muted">{p.anonymity ?? '-'}</td>
							{#each data.sites as s (s)}<td>{@render latency(p.sites[s])}</td>{/each}
							<td>
								<span class="status" class:up={p.alive}><span class="dot"></span>{p.alive ? 'Aktif' : 'Mati'}</span>
							</td>
							<td class="muted num">{ago(p.createdAt)}</td>
							<td class="muted num">{ago(p.lastChecked)}</td>
							<td class="muted num">{ago(p.lastOk)}</td>
						</tr>
					{:else}
						<tr>
							<td class="empty" colspan={data.sites.length + 7}>
								Belum ada proxy. Tunggu scheduler atau klik <b>Run sekarang</b>.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.filtered}
			<nav class="pager" aria-label="Halaman">
				<span class="muted">{data.from}–{data.to} dari {data.filtered}</span>
				<div class="pages">
					<a class="btn sm" href={href(data.page - 1)} aria-disabled={data.page === 1} aria-label="Sebelumnya">‹</a>
					{#each nums as n, i (n)}
						{#if i && n - nums[i - 1] > 1}<span class="gap">…</span>{/if}
						<a class="btn sm" href={href(n)} aria-current={n === data.page ? 'page' : undefined}>{n}</a>
					{/each}
					<a class="btn sm" href={href(data.page + 1)} aria-disabled={data.page === data.pages} aria-label="Berikutnya">›</a>
				</div>
			</nav>
		{/if}
	</div>
</main>

<style>
	header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
	h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
	.sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; }

	.live, .status { display: inline-flex; align-items: center; gap: 6px; }
	.live {
		padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px;
		background: var(--surface); color: var(--muted); font-size: 13px; font-weight: 500; white-space: nowrap;
	}
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
	.live.on { color: var(--ok); border-color: var(--ok); }
	.live.on .dot { background: var(--ok); animation: pulse 1.4s ease-in-out infinite; }
	@keyframes pulse { 50% { opacity: 0.3; } }

	.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
	.stat {
		display: flex; flex-direction: column; gap: 4px; padding: 14px 16px;
		background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
	}
	.label { color: var(--muted); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
	.value { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.okc { color: var(--ok); }
	.of { color: var(--muted); font-size: 16px; }

	.toolbar { display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; align-items: center; margin-bottom: 12px; }
	.right { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

	.seg { display: inline-flex; padding: 3px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.seg a {
		height: 32px; padding: 0 12px; border: 0; border-radius: 6px; cursor: pointer;
		display: inline-flex; align-items: center; text-decoration: none;
		background: none; color: var(--muted); font: 500 13px var(--font); transition: background 150ms, color 150ms;
	}
	.seg a[aria-current] { background: var(--surface-2); color: var(--fg); }

	.pager {
		display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; align-items: center;
		padding: 10px 12px; border-top: 1px solid var(--border); font-size: 13px;
	}
	.pages { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
	.pages a[aria-current='page'] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
	.gap { color: var(--muted); padding: 0 4px; }

	.alert { margin: 0 0 12px; padding: 10px 14px; border-radius: 8px; background: var(--bad-bg); color: var(--bad); }

	.info { margin: 0 0 12px; padding: 10px 14px; border-radius: 8px; background: var(--ok-bg); color: var(--ok); }

	.scroll { overflow: auto; max-height: 70vh; }
	table { width: 100%; border-collapse: collapse; white-space: nowrap; font-size: 13px; }
	th {
		position: sticky; top: 0; z-index: 1; padding: 10px 12px; text-align: left;
		background: var(--surface-2); color: var(--muted); font-size: 12px; font-weight: 600;
		text-transform: capitalize; border-bottom: 1px solid var(--border);
	}
	td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
	tbody tr { transition: background 150ms; }
	tbody tr:hover { background: var(--surface-2); }
	tbody tr:last-child td { border-bottom: 0; }
	tr.dead td:not(:last-child) { opacity: 0.55; }
	.num { font-variant-numeric: tabular-nums; }
	.empty { padding: 40px 12px; text-align: center; color: var(--muted); }

	.pill {
		display: inline-block; min-width: 64px; padding: 2px 8px; border-radius: 999px; text-align: center;
		font: 500 12px var(--mono); font-variant-numeric: tabular-nums;
	}
	.pill.ok { color: var(--ok); background: var(--ok-bg); }
	.pill.warn { color: var(--warn); background: var(--warn-bg); }
	.pill.bad { color: var(--muted); opacity: 0.6; }

	.status { font-weight: 500; color: var(--bad); }
	.status .dot { background: var(--bad); }
	.status.up { color: var(--ok); }
	.status.up .dot { background: var(--ok); }

	@media (max-width: 640px) {
		header { flex-direction: column; }
	}
</style>
