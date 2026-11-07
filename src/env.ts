import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	TURSO_DATABASE_URL: {
		description: 'libsql://... from Turso. Empty = local file:local.db',
		schema: (value) => value || 'file:local.db'
	},
	TURSO_AUTH_TOKEN: { description: 'Turso auth token', schema: optional }
});
