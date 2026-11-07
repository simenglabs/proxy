import { error, json, text } from '@sveltejs/kit';
import { db, ready } from '#lib/server/db.ts';
import { SITES } from '#lib/schema.ts';
import type { RequestHandler } from './$types';

/**
 * GET /api/proxies?check_website=instagram&negara=ID&limit=50&random=1&format=txt
 * - check_website: only proxies that reached this site on last check (sorted by its latency). Alias: site
 * - negara: ISO-2 country code, e.g. ID, SG
 * - limit:  max rows (default 100, max 1000)
 * - random: shuffle the RANDOM_POOL newest matches (by created_at) instead of sorting (rotation)
 * - format: json (default) | txt (one protocol://ip:port per line)
 */
const RANDOM_POOL = 20;

export const GET: RequestHandler = async ({ url }) => {
	const site = (url.searchParams.get('check_website') || url.searchParams.get('site') || '').trim().toLowerCase();
	if (site && !(site in SITES)) error(400, `check_website must be one of: ${Object.keys(SITES).join(', ')}`);
	const negara = url.searchParams.get('negara')?.trim().toUpperCase();
	if (negara && !/^[A-Z]{2}$/.test(negara)) error(400, 'negara must be an ISO-2 country code, e.g. ID');
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 1000);

	// site is whitelisted above, safe to inline into the JSON path
	const latency = site ? `json_extract(sites, '$.${site}')` : 'NULL';
	const random = url.searchParams.has('random');
	const where = `WHERE alive = 1 ${site ? `AND ${latency} IS NOT NULL` : ''} ${negara ? 'AND country = ?' : ''}`;
	const cols = `id, country, anonymity, sites, ${latency} AS latency`;

	await ready();
	const { rows } = await db.execute({
		sql: random
			? `SELECT * FROM (SELECT ${cols} FROM proxies ${where} ORDER BY created_at DESC LIMIT ${RANDOM_POOL})
				ORDER BY random() LIMIT ?`
			: `SELECT ${cols} FROM proxies ${where} ORDER BY ${site ? latency : 'last_ok DESC'} LIMIT ?`,
		args: [...(negara ? [negara] : []), limit]
	});

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

