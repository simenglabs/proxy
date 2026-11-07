import type { ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { runCycle } from '#lib/server/checker.ts';

const g = globalThis as { proxyCron?: ReturnType<typeof setInterval> };

// ponytail: in-process setInterval, needs a long-running server (adapter-node). Serverless = use an external cron hitting ?/run.
export const init: ServerInit = () => {
	if (building || g.proxyCron) return; // guard against dev HMR re-running init
	g.proxyCron = setInterval(runCycle, 5 * 60_000);
	void runCycle();
};
