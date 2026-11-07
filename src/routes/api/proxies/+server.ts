import { error, json, text } from '@sveltejs/kit';
import { db, ready } from '#lib/server/db.ts';
import { SITES, hit } from '#lib/server/checker.ts';
import type { RequestHandler } from './$types';

// ponytail: live check tests at most LIVE_POOL proxies per request (~10s worst case per wave of LIVE_CONCURRENCY).
// Add a rate limit / auth if this API is ever exposed publicly.
const LIVE_POOL = 120;
const LIVE_CONCURRENCY = 40;
const LIVE_MAX_LIMIT = 50;

type Row = { id: unknown; country: unknown; anonymity: unknown; sites: unknown; latency: unknown };

/**
 * GET /api/proxies?check_website=instagram&negara=ID&limit=50&random=1&format=txt
 * - check_website: known site (instagram, x, ...) = filter by stored check, sorted by its latency. Alias: site
 *                  any other domain/URL (e.g. google.com) = live-test active proxies against it right now
 * - negara: ISO-2 country code, e.g. ID, SG
 * - limit:  max rows (default 100, max 1000; live check max 50)
 * - random: shuffle instead of sort (rotation)
 * - format: json (default) | txt (one protocol://ip:port per line)
 */
export const GET: RequestHandler = async ({ url }) => {
	const raw = (url.searchParams.get('check_website') || url.searchParams.get('site') || '').trim();
	const site = raw.toLowerCase() in SITES ? raw.toLowerCase() : null;
	const target = raw && !site ? liveTarget(raw) : null;
	const negara = url.searchParams.get('negara')?.trim().toUpperCase();
	if (negara && !/^[A-Z]{2}$/.test(negara)) error(400, 'negara must be an ISO-2 country code, e.g. ID');
	const random = url.searchParams.has('random');
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), target ? LIVE_MAX_LIMIT : 1000);

	// site is whitelisted above, safe to inline into the JSON path
	const latency = site ? `json_extract(sites, '$.${site}')` : 'NULL';
	const order = random ? 'random()' : site ? latency : 'last_ok DESC';

	await ready;
	let { rows } = (await db.execute({
		sql: `SELECT id, country, anonymity, sites, ${latency} AS latency FROM proxies
			WHERE alive = 1 ${site ? `AND ${latency} IS NOT NULL` : ''} ${negara ? 'AND country = ?' : ''}
			ORDER BY ${order} LIMIT ?`,
		args: [...(negara ? [negara] : []), target ? LIVE_POOL : limit]
	})) as unknown as { rows: Row[] };

	if (target) rows = await liveCheck(rows, target, limit, random);

	if (url.searchParams.get('format') === 'txt') return text(rows.map((r) => r.id).join('\n'));
	return json(
		rows.map((r) => ({
			proxy: String(r.id),
			country: r.country,
			anonymity: r.anonymity,
			latency: r.latency,
			sites: JSON.parse(String(r.sites))
		}))
	);
};

function liveTarget(raw: string) {
	try {
		const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
		if (/^https?:$/.test(u.protocol) && u.hostname.includes('.')) return u.href;
	} catch {
		/* fall through */
	}
	error(400, `check_website must be one of ${Object.keys(SITES).join(', ')}, or a domain/URL like google.com`);
}

/** Test candidates against target in parallel, stop as soon as `limit` of them answered. */
async function liveCheck(candidates: Row[], target: string, limit: number, random: boolean) {
	const queue = [...candidates];
	const found: Row[] = [];
	await Promise.all(
		Array.from({ length: LIVE_CONCURRENCY }, async () => {
			for (let r = queue.shift(); r && found.length < limit; r = queue.shift()) {
				const ms = await hit(String(r.id), target);
				if (ms !== null && found.length < limit) found.push({ ...r, latency: ms });
			}
		})
	);
	return random ? found : found.sort((a, b) => Number(a.latency) - Number(b.latency));
}
