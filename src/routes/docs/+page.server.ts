import { db, ready } from '#lib/server/db.ts';
import { SITES } from '#lib/schema.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	await ready();
	const { rows } = await db.execute(
		'SELECT country, count(*) AS n FROM proxies WHERE alive = 1 AND country IS NOT NULL GROUP BY country ORDER BY n DESC'
	);
	return {
		sites: Object.keys(SITES),
		countries: rows.map((r) => ({ code: String(r.country), n: Number(r.n) }))
	};
};
