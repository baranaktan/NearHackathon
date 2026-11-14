/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `@perde/core` is consumed from source (packages/core/src): one build, no
 * stale dist, and its own dependencies (@noble/*, @scure/*) resolve from
 * packages/core/node_modules, which `npm run setup` installs.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const coreEntry = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

/*
 * No <link rel="preload"> for fonts: WebKit fetches same-origin @font-face files
 * in no-cors mode, so a `crossorigin` font preload is never reused there (the
 * file downloads twice and Safari warns "preloaded but not used"), while
 * Chromium needs `crossorigin` to reuse it. Measured with the e2e suite on
 * 2026-11-14; the faces are small and `font-display: swap` keeps text visible.
 */
/**
 * Content-Security-Policy for the production build only (the dev server needs
 * its HMR websocket and inline modules). The app has no backend: it may only
 * talk to the NEAR testnet RPCs in src/config.ts, the testnet faucet helper
 * and NEAR Intents 1Click (packages/core). The one inline script (theme before
 * first paint) is allowed by its hash. Verified by the e2e suites, which fail
 * on any console error, including CSP violations.
 */
const CONNECT_ORIGINS = ['https://near-testnet.drpc.org', 'https://test.rpc.fastnear.com', 'https://helper.nearprotocol.com', 'https://1click.chaindefuser.com'];
function contentSecurityPolicy(): Plugin {
  return {
    name: 'perde:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}'`);
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          `connect-src 'self' ${CONNECT_ORIGINS.join(' ')}`,
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
      },
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@perde/core': coreEntry },
  },
  server: {
    // Let the dev server read packages/core/src and its node_modules.
    fs: { allow: [repoRoot] },
  },
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    /*
     * Keep the <link rel="modulepreload"> tags in index.html (used while the page
     * parses), but do not let Vite's runtime helper add them when a lazy page is
     * entered. Those runtime preloads are only "used" once the page chunk itself
     * has downloaded and imports them; if that is still in flight at load + 3 s,
     * Safari/WebKit warns "preloaded using link preload but not used" for every
     * shared chunk (slow networks hit this every time; the e2e suite hit it under
     * load). Without them the browser fetches a lazy page's shared chunks as soon
     * as the page chunk is parsed: one extra round trip on a cold route, no warning.
     * Regression: e2e/tests/resilience.spec.ts ("unused-preload").
     */
    modulePreload: {
      resolveDependencies: (_file, deps, { hostType }) => (hostType === 'html' ? deps : []),
    },
    rollupOptions: {
      output: {
        // Stable, cacheable vendor chunks instead of one opaque shared chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react';
          if (id.includes('react-router')) return 'router';
          if (/[/\\]@(noble|scure)[/\\]/.test(id)) return 'crypto';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
