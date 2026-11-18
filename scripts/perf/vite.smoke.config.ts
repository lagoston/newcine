// Build de teste (18/11/2026, Protocolo Reborn, pacote): o MESMO vite.config.ts
// do site, só com o Supabase e o login trocados por versões de mentira
// (scripts/perf/stub/), para o site abrir sem rede e sem conta. É o build que o
// teste de fumaça (npm run smoke) e a medição da abertura (scripts/perf/measure.mjs)
// usam. O supabase-js continua no pacote (o peso é o real).
// Uso (a partir da raiz do repositório):
//   npx vite build --config scripts/perf/vite.smoke.config.ts --outDir dist-smoke
import path from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import base from '../../vite.config';

const root = path.resolve(__dirname, '../..');
const map: Record<string, string> = {
  [path.resolve(root, 'src/lib/supabase.ts')]: path.resolve(__dirname, 'stub/stubSupabase.ts'),
  [path.resolve(root, 'src/lib/auth.tsx')]: path.resolve(__dirname, 'stub/stubAuth.tsx'),
};

const stubs: Plugin = {
  name: 'smoke-stubs',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (resolved && map[resolved.id]) return map[resolved.id];
    return null;
  },
};

const config = base as UserConfig;
export default { ...config, plugins: [stubs, ...(config.plugins ?? [])] } satisfies UserConfig;
