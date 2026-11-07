import { createClient } from '@libsql/client';
import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$app/env/private';
import { migrate } from '../schema.ts';

export const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

// Lazy: Workers forbid I/O at module scope. Runs once per isolate; retried if it failed.
let migrated: Promise<void> | undefined;
export const ready = () =>
	(migrated ??= migrate(db).catch((e) => {
		migrated = undefined;
		throw e;
	}));
