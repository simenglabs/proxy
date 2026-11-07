import { fail } from '@sveltejs/kit';
import { db, ready } from '#lib/server/db.ts';
import { PROXY_RE, SITES, checkAndSave, runCycle, status, type Sites } from '#lib/server/checker.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	await ready;
	const aliveOnly = url.searchParams.get('alive') === '1';
	const c = (await db.execute('SELECT count(*) AS total, coalesce(sum(alive), 0) AS alive FROM proxies')).rows[0];
	const total = Number(c.total);
	const alive = Number(c.alive);
	const filtered = aliveOnly ? alive : total;
	const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), pages);

	const { rows } = await db.execute({
		sql: `SELECT * FROM proxies ${aliveOnly ? 'WHERE alive = 1' : ''}
			ORDER BY created_at DESC, id LIMIT ? OFFSET ?`,
		args: [PAGE_SIZE, (page - 1) * PAGE_SIZE]
	});
	return {
		sites: Object.keys(SITES),
		status: structuredClone(status),
		total,
		alive,
		aliveOnly,
		page,
		pages,
		from: filtered ? (page - 1) * PAGE_SIZE + 1 : 0,
		to: (page - 1) * PAGE_SIZE + rows.length,
		filtered,
		proxies: rows.map((r) => ({
			id: String(r.id),
			country: r.country as string | null,
			anonymity: r.anonymity as string | null,
			sites: JSON.parse(String(r.sites)) as Sites,
			alive: r.alive === 1,
			lastChecked: Number(r.last_checked),
			lastOk: r.last_ok === null ? null : Number(r.last_ok),
			createdAt: Number(r.created_at)
		}))
	};
};

export const actions: Actions = {
	test: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '').trim();
		if (!PROXY_RE.test(id)) return fail(400, { id, error: 'Format: http|socks4|socks5://host:port' });
		return { id, ...(await checkAndSave(id)) };
	},
	run: () => {
		void runCycle();
		return { started: true };
	}
};
