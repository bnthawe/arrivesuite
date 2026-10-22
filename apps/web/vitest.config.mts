import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest does not read tsconfig paths. Mirror the Next.js `@/*` alias so route
// tests exercise the same modules the app imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
});
