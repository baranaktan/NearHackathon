/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Preload the two faces that render above the fold (Geist for UI, Instrument
 * Serif for display). Fontsource files get content-hashed names at build time,
 * so we look them up in the bundle instead of hard-coding paths.
 */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'perde:preload-fonts',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      if (!ctx.bundle) return [];
      const files = Object.keys(ctx.bundle).filter((f) => patterns.some((p) => p.test(f)));
      return files.map((file) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `./${file}`, crossorigin: '' },
        injectTo: 'head' as const,
      }));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts([/geist-latin-wght-normal.*\.woff2$/, /instrument-serif-latin-400-normal.*\.woff2$/]),
  ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Stable, cacheable vendor chunks instead of one opaque shared chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react';
          if (id.includes('react-router')) return 'router';
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
