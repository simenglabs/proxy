// Proxy checker. Runs on any machine with Node >= 22.18 + curl (the Worker can't spawn curl),
// then reports results to the Worker's POST /api/sync. No npm install needed.
//   SYNC_URL=https://proxy.nasriadzlani.workers.dev/api/sync SYNC_TOKEN=... node scripts/check.ts
//   node --env-file=.env scripts/check.ts
import { execFile } from 'node:child_process';
import { SITES, type Sites } from '../src/lib/schema.ts';

type Listed = { id: string; country?: string; anonymity?: string };
type ProxyscrapeItem = { ip: string; port: number; protocol: string; anonymity: string; ip_data?: { countryCode?: string } };
type ProxiflyItem = { protocol: string; ip: string; port: number; anonymity: string; geolocation?: { country?: string } };

// Proxy list sources. Each maps its JSON to { id, country, anonymity }; add more here.
const SOURCES: { name: string; url: string; parse: (json: unknown) => Listed[] }[] = [
	{
		name: 'proxyscrape',
		url: 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=ipport&format=json&country=th%2Ctw%2Csg%2Cmy%2Cjp%2Cid%2Cin%2Ccn',
		parse: (j) =>
			(j as { proxies: ProxyscrapeItem[] }).proxies.map((p) => ({
				id: `${p.protocol}://${p.ip}:${p.port}`,
				country: p.ip_data?.countryCode,
				anonymity: p.anonymity
			}))
	},
	{
		name: 'proxifly-ID',
		url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/refs/heads/main/proxies/countries/ID/data.json',
		parse: (j) =>
			(j as ProxiflyItem[]).map((p) => ({
				id: `${p.protocol}://${p.ip}:${p.port}`,
				country: p.geolocation?.country,
				anonymity: p.anonymity
			}))
	}
];
const SUPPORTED = /^(http|socks4|socks5):\/\//; // same protocols /api/sync accepts

const TIMEOUT_S = 10;
const CONCURRENCY = 40; // proxies at once, each fires one curl per site

const SYNC_URL = process.env.SYNC_URL || 'http://localhost:5173/api/sync';
const SYNC_TOKEN = process.env.SYNC_TOKEN;
if (!SYNC_TOKEN) throw new Error('SYNC_TOKEN env is required');

type Meta = { country?: string; anonymity?: string };

// "TypeError: fetch failed" hides the real reason (timeout, DNS, ...) in e.cause
const why = (e: unknown) => {
	const c = (e as { cause?: { code?: string; message?: string } })?.cause;
	return c ? `${String(e)} (${c.code ?? c.message})` : String(e);
};

async function sync<T>(body: object): Promise<T> {
	const res = await fetch(SYNC_URL, {
		method: 'POST',
		headers: { authorization: `Bearer ${SYNC_TOKEN}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60_000)
	});
	if (!res.ok) throw new Error(`sync HTTP ${res.status}: ${await res.text()}`);
	return res.json() as Promise<T>;
}

// ponytail: curl speaks http/socks4/socks5 natively, so no proxy-agent deps. Host needs curl.
function hit(id: string, url: string): Promise<number | null> {
	const proxy = id.replace(/^socks5:/, 'socks5h:'); // resolve DNS on the proxy side
	const args = ['-s', '-o', '/dev/null', '-w', '%{http_code} %{time_starttransfer}', '-m', String(TIMEOUT_S)];
	args.push('-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36');
	args.push('-x', proxy, url);
	return new Promise((resolve) =>
		execFile('curl', args, (_err, stdout) => {
			const [code, time] = String(stdout).split(' ').map(Number);
			// 2xx/3xx = site answered through the proxy (latency = TTFB; body may still time out). 000/4xx/5xx = blocked or dead
			resolve(code >= 200 && code < 400 ? Math.round(time * 1000) : null);
		})
	);
}

/** One source, 3 tries. A failed source is reported but never stops the run. */
async function fetchSource(src: (typeof SOURCES)[number]): Promise<{ proxies: Listed[]; error?: string }> {
	let error = '';
	for (let i = 0; i < 3; i++) {
		try {
			const res = await fetch(src.url, { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const proxies = src.parse(await res.json());
			console.log(`[list] ${src.name}: ${proxies.length}`);
			return { proxies };
		} catch (e) {
			error = `${src.name}: ${why(e)}`;
			console.warn(`[list] try ${i + 1}/3 failed: ${error}`);
			await new Promise((r) => setTimeout(r, 5000));
		}
	}
	return { proxies: [], error };
}

async function fetchList() {
	const all = await Promise.all(SOURCES.map(fetchSource));
	const errors = all.map((r) => r.error).filter(Boolean);
	return { proxies: all.flatMap((r) => r.proxies), error: errors.length ? errors.join('; ') : undefined };
}

const at = Date.now();
const { ids } = await sync<{ ids: string[] }>({ at }); // marks the run as started
try {
	const { proxies, error } = await fetchList();

	// one canonical lowercase key per proxy, so `HOST:80` and `host:80` never become two rows
	const jobs = new Map<string, Meta>(ids.map((id) => [id.toLowerCase(), {}]));
	for (const { id, ...meta } of proxies) if (SUPPORTED.test(id.toLowerCase())) jobs.set(id.toLowerCase(), meta);

	const queue = [...jobs];
	const results: { id: string; country?: string; anonymity?: string; sites: Sites }[] = [];
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (let job = queue.pop(); job; job = queue.pop()) {
				const [id, meta] = job;
				const sites: Sites = Object.fromEntries(
					await Promise.all(Object.entries(SITES).map(async ([name, url]) => [name, await hit(id, url)]))
				);
				results.push({ id, ...meta, sites });
			}
		})
	);

	const res = await sync<{ checked: number; alive: number }>({ at, ms: Date.now() - at, error, results });
	console.log(`checked ${res.checked}, alive ${res.alive}, ${Math.round((Date.now() - at) / 1000)}s`);
} catch (e) {
	console.error('[proxy cycle]', e);
	await sync({ at, ms: Date.now() - at, error: why(e), results: [] }).catch(() => {});
	process.exitCode = 1;
}
