import { createClient } from '@libsql/client';
import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$app/env/private';

export const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

export const ready = (async () => {
	await db.execute(`CREATE TABLE IF NOT EXISTS proxies (
	id TEXT PRIMARY KEY,      -- protocol://ip:port
	country TEXT,
	anonymity TEXT,
	sites TEXT NOT NULL,      -- JSON {site: latency ms | null}
	alive INTEGER NOT NULL,   -- 1 if at least one site reachable on last check
	last_checked INTEGER NOT NULL,
	last_ok INTEGER,
	created_at INTEGER        -- first time this proxy was saved
)`);
	// migrate tables created before created_at existed; backfill with best known timestamp
	const cols = (await db.execute('PRAGMA table_info(proxies)')).rows.map((r) => r.name);
	if (!cols.includes('created_at')) {
		await db.execute('ALTER TABLE proxies ADD COLUMN created_at INTEGER');
		await db.execute('UPDATE proxies SET created_at = coalesce(last_ok, last_checked)');
	}
})();
