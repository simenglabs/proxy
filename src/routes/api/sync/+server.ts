import { error, json } from '@sveltejs/kit';
import { SYNC_TOKEN } from '$app/env/private';
import { db, ready } from '#lib/server/db.ts';
import { SITES, type Sites } from '#lib/schema.ts';
import type { RequestHandler } from './$types';

/**
 * Called by scripts/check.ts running on a machine with curl (the Worker can't run checks itself).
 * Auth: `Authorization: Bearer <SYNC_TOKEN>`.
 *
 * POST {at}                         start a run → { ids } of stored proxies to re-check
 * POST {at, ms, error?, results[]}  finish the run: upsert alive, mark dead, purge old rows
 */

const PROXY_RE = /^(http|socks4|socks5):\/\/[a-z0-9.-]+:\d{1,5}$/;
const PURGE_AFTER_MS = 24 * 3600_000; // drop rows that have not worked for this long
const KEEP_RUNS_MS = 7 * 24 * 3600_000;
const MAX_RESULTS = 10_000;
const CHUNK = 200; // statements per Turso batch

type Result = { id: string; country?: string | null; anonymity?: string | null; sites: Sites };
type Body = { at: number; ms?: number; error?: string | null; results?: Result[] };

const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

async function authorize(header: string | null) {
	if (!SYNC_TOKEN) error(503, 'SYNC_TOKEN is not configured');
	// compare digests so the check doesn't leak the token length or prefix via timing
	const [a, b] = await Promise.all([sha(header ?? ''), sha(`Bearer ${SYNC_TOKEN}`)]);
	if (a.some((v, i) => v !== b[i])) error(401, 'invalid token');
}

const validSites = (s: unknown): s is Sites =>
	!!s &&
	typeof s === 'object' &&
	Object.entries(s).every(([k, v]) => k in SITES && (v === null || (Number.isInteger(v) && v >= 0)));

export const POST: RequestHandler = async ({ request }) => {
	await authorize(request.headers.get('authorization'));
	const body = (await request.json().catch(() => null)) as Body | null;
	if (!body || !Number.isSafeInteger(body.at)) error(400, '`at` (ms timestamp) is required');
	await ready();

	if (!body.results) {
		await db.execute({ sql: 'INSERT OR IGNORE INTO runs (at) VALUES (?)', args: [body.at] });
		const { rows } = await db.execute('SELECT id FROM proxies');
		return json({ ids: rows.map((r) => String(r.id)) });
	}

	if (!Array.isArray(body.results) || body.results.length > MAX_RESULTS) error(400, `results must be an array of ≤ ${MAX_RESULTS}`);
	// skip malformed entries instead of rejecting the whole run
	const results = body.results.filter((r) => typeof r?.id === 'string' && PROXY_RE.test(r.id) && validSites(r.sites));

	const now = Date.now();
	const stmts = results.map((r) =>
		Object.values(r.sites).some((v) => v !== null)
			? {
					sql: `INSERT INTO proxies (id, country, anonymity, sites, alive, last_checked, last_ok, created_at)
						VALUES (?, ?, ?, ?, 1, ?, ?, ?)
						ON CONFLICT(id) DO UPDATE SET country = coalesce(excluded.country, country),
							anonymity = coalesce(excluded.anonymity, anonymity), sites = excluded.sites,
							alive = 1, last_checked = excluded.last_checked, last_ok = excluded.last_ok`,
					args: [r.id, r.country?.slice(0, 2).toUpperCase() || null, r.anonymity?.slice(0, 20) || null, JSON.stringify(r.sites), now, now, now]
				}
			: { sql: 'UPDATE proxies SET sites = ?, alive = 0, last_checked = ? WHERE id = ?', args: [JSON.stringify(r.sites), now, r.id] }
	);
	for (let i = 0; i < stmts.length; i += CHUNK) await db.batch(stmts.slice(i, i + CHUNK));

	const alive = results.filter((r) => Object.values(r.sites).some((v) => v !== null)).length;
	await db.batch([
		{ sql: 'DELETE FROM proxies WHERE alive = 0 AND last_ok < ?', args: [now - PURGE_AFTER_MS] },
		{ sql: 'DELETE FROM runs WHERE at < ?', args: [now - KEEP_RUNS_MS] },
		{
			sql: `INSERT INTO runs (at, ms, checked, alive, error) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(at) DO UPDATE SET ms = excluded.ms, checked = excluded.checked, alive = excluded.alive, error = excluded.error`,
			args: [body.at, Number(body.ms) || now - body.at, results.length, alive, body.error ? String(body.error).slice(0, 500) : null]
		}
	]);
	return json({ checked: results.length, alive });
};
