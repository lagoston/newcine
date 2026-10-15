import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import baseTailwind from '../tailwind.config.js';

// Build do comercial: a gaveta Conexão de verdade com dados de mentira.
// lib/supabase e lib/auth viram promo/mockSupabase e promo/mockAuth.
const root = path.resolve(__dirname, '..');
const MOCKS: Record<string, string> = {
  [path.join(root, 'src/lib/supabase.ts')]: path.join(__dirname, 'mockSupabase.ts'),
  [path.join(root, 'src/lib/auth.tsx')]: path.join(__dirname, 'mockAuth.tsx'),
};

const mockData = (): Plugin => ({
  name: 'promo-mocks',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || importer.startsWith(__dirname)) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (resolved && MOCKS[resolved.id]) return MOCKS[resolved.id];
    return null;
  },
});

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: path.join(root, 'public'),
  plugins: [mockData(), react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ ...baseTailwind, content: [path.join(root, 'src/**/*.{ts,tsx}'), path.join(__dirname, '*.{ts,tsx,html}')] }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.join(root, 'promo-dist'),
    emptyOutDir: true,
    target: 'esnext',
    assetsInlineLimit: 0,
    copyPublicDir: false,
  },
});
