<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
	/>
	<title>Proxy Monitor</title>
</svelte:head>

<nav class="topnav" aria-label="Menu utama">
	<div class="inner">
		<span class="brand">menglabs<span>/proxy</span></span>
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Monitor</a>
		<a href="/docs" aria-current={page.url.pathname === '/docs' ? 'page' : undefined}>API Docs</a>
	</div>
</nav>

{@render children()}

<style>
	:global(:root) {
		color-scheme: dark;
		--bg: #0b1120;
		--surface: #111a2e;
		--surface-2: #17223a;
		--border: #24314d;
		--fg: #f1f5f9;
		--muted: #94a3b8;
		--ok: #22c55e;
		--ok-bg: #22c55e1f;
		--warn: #f59e0b;
		--warn-bg: #f59e0b1f;
		--bad: #f87171;
		--bad-bg: #ef44441f;
		--accent: #22c55e;
		--on-accent: #052e16;
		--ring: #60a5fa;
		--font: 'Inter', system-ui, sans-serif;
		--mono: 'JetBrains Mono', ui-monospace, monospace;
	}
	@media (prefers-color-scheme: light) {
		:global(:root) {
			color-scheme: light;
			--bg: #f8fafc;
			--surface: #ffffff;
			--surface-2: #f1f5f9;
			--border: #e2e8f0;
			--fg: #0f172a;
			--muted: #64748b;
			--ok: #15803d;
			--ok-bg: #16a34a1a;
			--warn: #b45309;
			--warn-bg: #f59e0b24;
			--bad: #b91c1c;
			--bad-bg: #ef44441a;
			--accent: #16a34a;
			--on-accent: #ffffff;
			--ring: #2563eb;
		}
	}
	:global(*) { box-sizing: border-box; }
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font: 14px/1.5 var(--font);
		-webkit-font-smoothing: antialiased;
	}
	:global(:focus-visible) { outline: 2px solid var(--ring); outline-offset: 2px; }
	.topnav { border-bottom: 1px solid var(--border); background: var(--surface); }
	.inner { max-width: 1400px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 4px; height: 52px; }
	.brand { font-weight: 700; margin-right: 20px; letter-spacing: -0.01em; }
	.brand span { color: var(--muted); font-weight: 500; }
	.topnav a {
		padding: 6px 12px; border-radius: 6px; color: var(--muted); text-decoration: none;
		font-weight: 500; transition: background 150ms, color 150ms;
	}
	.topnav a:hover { color: var(--fg); background: var(--surface-2); }
	.topnav a[aria-current='page'] { color: var(--fg); background: var(--surface-2); }

	/* shared controls, used by every page */
	:global(main) { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
	:global(input:not([type='hidden']):not([type='checkbox']), select) {
		height: 40px; padding: 0 12px; min-width: 0;
		background: var(--surface); color: var(--fg); font: 13px var(--mono);
		border: 1px solid var(--border); border-radius: 8px; transition: border-color 150ms;
	}
	:global(input:focus, select:focus) { border-color: var(--ring); }
	:global(.btn) {
		display: inline-flex; align-items: center; justify-content: center;
		height: 40px; padding: 0 16px; border-radius: 8px; cursor: pointer; white-space: nowrap; text-decoration: none;
		font: 500 14px var(--font); color: var(--fg);
		background: var(--surface-2); border: 1px solid var(--border); transition: background 150ms, opacity 150ms;
	}
	:global(.btn:hover:not(:disabled)) { background: var(--border); }
	:global(.btn.primary) { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
	:global(.btn.primary:hover:not(:disabled)) { background: var(--accent); opacity: 0.88; }
	:global(.btn:disabled, .btn[aria-disabled='true']) { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
	:global(.btn.sm) { height: 32px; min-width: 36px; padding: 0 12px; font-size: 13px; }
	:global(.card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(code) { font: 13px var(--mono); }
	:global(.muted) { color: var(--muted); }
	:global(.sr-only) {
		position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
		overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*) { animation: none !important; transition: none !important; }
	}
</style>
