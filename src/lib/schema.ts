// Shared by the SvelteKit app (Workers) and scripts/check.ts (GitHub Actions). Keep it runtime-agnostic.
import type { Client } from '@libsql/client';

export const SITES: Record<string, string> = {
	instagram: 'https://www.instagram.com/',
	x: 'https://x.com/',
	threads: 'https://www.threads.com/',
	youtube: 'https://www.youtube.com/',
	tiktok: 'https://www.tiktok.com/'
};

export type Sites = Record<string, number | null>;

export async function migrate(db: Client) {
	await db.batch([
		`CREATE TABLE IF NOT EXISTS proxies (
			id TEXT PRIMARY KEY,      -- protocol://ip:port
			country TEXT,
			anonymity TEXT,
			sites TEXT NOT NULL,      -- JSON {site: latency ms | null}
			alive INTEGER NOT NULL,   -- 1 if at least one site reachable on last check
			last_checked INTEGER NOT NULL,
			last_ok INTEGER,
			created_at INTEGER        -- first time this proxy was saved
		)`,
		`CREATE TABLE IF NOT EXISTS runs (
			at INTEGER PRIMARY KEY,   -- start time
			ms INTEGER,               -- NULL while running
			checked INTEGER,
			alive INTEGER,
			error TEXT
		)`
	]);
	// migrate tables created before created_at existed; backfill with best known timestamp
	const cols = (await db.execute('PRAGMA table_info(proxies)')).rows.map((r) => r.name);
	if (!cols.includes('created_at')) {
		await db.execute('ALTER TABLE proxies ADD COLUMN created_at INTEGER');
		await db.execute('UPDATE proxies SET created_at = coalesce(last_ok, last_checked)');
	}
}
