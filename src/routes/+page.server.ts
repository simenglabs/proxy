import { fail } from '@sveltejs/kit';
import { GITHUB_REPO, GITHUB_TOKEN } from '$app/env/private';
import { db, ready } from '#lib/server/db.ts';
import { SITES, type Sites } from '#lib/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;
const STALE_RUN_MS = 20 * 60_000; // a run with no end after this long crashed (Actions job timeout is 15m)

export const load: PageServerLoad = async ({ url }) => {
	await ready();
	const aliveOnly = url.searchParams.get('alive') === '1';
	const c = (await db.execute('SELECT count(*) AS total, coalesce(sum(alive), 0) AS alive FROM proxies')).rows[0];
	const total = Number(c.total);
	const alive = Number(c.alive);
	const filtered = aliveOnly ? alive : total;
	const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
	const page = Math.min(Math.max(Math.floor(Number(url.searchParams.get('page'))) || 1, 1), pages);

	const run = (await db.execute('SELECT * FROM runs ORDER BY at DESC LIMIT 1')).rows[0];
	const running = !!run && run.ms === null && Date.now() - Number(run.at) < STALE_RUN_MS;
	const lastRun = (
		await db.execute('SELECT * FROM runs WHERE ms IS NOT NULL ORDER BY at DESC LIMIT 1')
	).rows.map((r) => ({
		at: Number(r.at),
		ms: Number(r.ms),
		checked: Number(r.checked),
		alive: Number(r.alive),
		error: r.error as string | null
	}))[0];

	const { rows } = await db.execute({
		sql: `SELECT * FROM proxies ${aliveOnly ? 'WHERE alive = 1' : ''}
			ORDER BY created_at DESC, id LIMIT ? OFFSET ?`,
		args: [PAGE_SIZE, (page - 1) * PAGE_SIZE]
	});
	return {
		sites: Object.keys(SITES),
		status: { running, lastRun },
		canRun: !!GITHUB_TOKEN,
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
	// ponytail: unauthenticated, but the workflow's concurrency group queues at most one extra run
	run: async () => {
		if (!GITHUB_TOKEN) return fail(503, { error: 'GITHUB_TOKEN belum diset' });
		const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/check.yml/dispatches`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${GITHUB_TOKEN}`,
				accept: 'application/vnd.github+json',
				'user-agent': 'menglabs-proxy'
			},
			body: JSON.stringify({ ref: 'main' })
		});
		if (!res.ok) return fail(502, { error: `GitHub ${res.status}: ${await res.text()}` });
		return { started: true };
	}
};
