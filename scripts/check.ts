// Proxy checker. Runs outside Workers (GitHub Actions cron / any machine with Node 24 + curl):
//   node --env-file-if-exists=.env scripts/check.ts
import { execFile } from 'node:child_process';
import { createClient } from '@libsql/client';
import { SITES, migrate, type Sites } from '../src/lib/schema.ts';

const LIST_URL =
	'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=ipport&format=json&country=th%2Ctw%2Csg%2Cmy%2Cjp%2Cid%2Cin%2Ccn';

const TIMEOUT_S = 10;
const CONCURRENCY = 40; // proxies at once, each fires one curl per site
const PURGE_AFTER_MS = 24 * 3600_000; // drop rows that have not worked for this long
const KEEP_RUNS_MS = 7 * 24 * 3600_000;

type Meta = { country?: string; anonymity?: string };
type ApiProxy = { ip: string; port: number; protocol: string; anonymity: string; ip_data?: { countryCode?: string } };

const db = createClient({
	url: process.env.TURSO_DATABASE_URL || 'file:local.db',
	authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

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

/** Check a proxy against every site and persist: insert/update if it works, mark dead if it was stored. */
async function checkAndSave(id: string, meta: Meta = {}) {
	id = id.trim().toLowerCase(); // one canonical key per proxy, so `HOST:80` and `host:80` never become two rows
	const sites: Sites = Object.fromEntries(
		await Promise.all(Object.entries(SITES).map(async ([name, url]) => [name, await hit(id, url)]))
	);
	const alive = Object.values(sites).some((v) => v !== null);
	const now = Date.now();
	if (alive) {
		await db.execute({
			sql: `INSERT INTO proxies (id, country, anonymity, sites, alive, last_checked, last_ok, created_at)
				VALUES (?, ?, ?, ?, 1, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET country = coalesce(excluded.country, country),
					anonymity = coalesce(excluded.anonymity, anonymity), sites = excluded.sites,
					alive = 1, last_checked = excluded.last_checked, last_ok = excluded.last_ok`,
			args: [id, meta.country ?? null, meta.anonymity ?? null, JSON.stringify(sites), now, now, now]
		});
	} else {
		await db.execute({
			sql: 'UPDATE proxies SET sites = ?, alive = 0, last_checked = ? WHERE id = ?',
			args: [JSON.stringify(sites), now, id]
		});
	}
	return alive;
}

await migrate(db);
const at = Date.now();
await db.execute({ sql: 'INSERT INTO runs (at) VALUES (?)', args: [at] });
try {
	const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(30_000) });
	if (!res.ok) throw new Error(`proxyscrape HTTP ${res.status}`);
	const { proxies } = (await res.json()) as { proxies: ApiProxy[] };

	const jobs = new Map<string, Meta>();
	for (const row of (await db.execute('SELECT id FROM proxies')).rows) jobs.set(String(row.id), {});
	for (const p of proxies)
		jobs.set(`${p.protocol}://${p.ip}:${p.port}`.toLowerCase(), {
			country: p.ip_data?.countryCode,
			anonymity: p.anonymity
		});

	const queue = [...jobs];
	let alive = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (let job = queue.pop(); job; job = queue.pop()) if (await checkAndSave(...job)) alive++;
		})
	);
	await db.batch([
		{ sql: 'DELETE FROM proxies WHERE alive = 0 AND last_ok < ?', args: [Date.now() - PURGE_AFTER_MS] },
		{ sql: 'DELETE FROM runs WHERE at < ?', args: [Date.now() - KEEP_RUNS_MS] },
		{ sql: 'UPDATE runs SET ms = ?, checked = ?, alive = ? WHERE at = ?', args: [Date.now() - at, jobs.size, alive, at] }
	]);
	console.log(`checked ${jobs.size}, alive ${alive}, ${Math.round((Date.now() - at) / 1000)}s`);
} catch (e) {
	await db.execute({ sql: 'UPDATE runs SET ms = ?, checked = 0, alive = 0, error = ? WHERE at = ?', args: [Date.now() - at, String(e), at] });
	console.error('[proxy cycle]', e);
	process.exitCode = 1;
}
