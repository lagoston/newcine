import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 18/11/2026 (otimização): o idioma da pessoa começa a baixar junto com o resto
// da abertura, sem esperar o JavaScript principal rodar. Um <link
// rel="modulepreload"> escolhido no próprio HTML com a mesma regra do i18n.ts
// (localStorage, senão o idioma do aparelho). Sem isto o idioma sob demanda
// ficava em série depois do JS principal e a abertura não ganhava nada (medido).
function preloadLocale() {
  return {
    name: 'preload-locale',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, { type: string; facadeModuleId?: string | null; fileName: string }> }) {
        if (!ctx.bundle) return html; // servidor de desenvolvimento: nada a fazer
        const files: Record<string, string> = {};
        for (const out of Object.values(ctx.bundle)) {
          const m = out.type === 'chunk' && out.facadeModuleId?.match(/locales\/(pt|en)\.json$/);
          if (m) files[m[1]] = '/' + out.fileName;
        }
        if (!files.pt || !files.en) return html;
        const script = `<script>(function(){var l='';try{l=localStorage.getItem('i18nextLng')||''}catch(e){}l=l||navigator.language||'';var k=document.createElement('link');k.rel='modulepreload';k.crossOrigin='';k.href=/^pt/i.test(l)?'${files.pt}':'${files.en}';document.head.appendChild(k)})()</script>`;
        // Logo no começo do <head> (depois do charset): um script inline depois
        // de uma folha de estilo externa (as fontes) esperaria por ela.
        if (/<meta charset[^>]*>/i.test(html)) return html.replace(/<meta charset[^>]*>/i, (m) => m + '\n    ' + script);
        return html.replace(/<head>/i, '<head>\n    ' + script);
      },
    },
  };
}

// Está no grafo estático da entrada (main.tsx)? Sobe pelos importadores
// estáticos até achar a entrada. Usado pelo manualChunks abaixo.
type ModuleInfoLike = { isEntry: boolean; importers: readonly string[] } | null;
const entryGraphMemo = new Map<string, boolean>();
function inEntryGraph(id: string, getModuleInfo: (id: string) => ModuleInfoLike, seen = new Set<string>()): boolean {
  if (entryGraphMemo.has(id)) return entryGraphMemo.get(id)!;
  if (seen.has(id)) return false;
  seen.add(id);
  const info = getModuleInfo(id);
  const result = !!info && (info.isEntry || info.importers.some((imp) => inEntryGraph(imp, getModuleInfo, seen)));
  if (result) entryGraphMemo.set(id, true);
  return result;
}

export default defineConfig({
  plugins: [
    react(),
    preloadLocale(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'brand/*.svg'],
      manifest: {
        id: '/',
        name: 'CineOracle',
        short_name: 'CineOracle',
        description: 'Avalie os filmes que você já viu e deixe três oráculos preverem o quanto você vai gostar do próximo.',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#120D22',
        background_color: '#120D22',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['entertainment', 'social', 'lifestyle'],
        // Ícones gerados por scripts/brand/build-brand.py (o Olho Lunar).
        // O "maskable" tem o símbolo menor, dentro da área segura que o
        // Android recorta em círculo/gota.
        icons: [
          { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/assets/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Biblioteca', short_name: 'Biblioteca', url: '/library', icons: [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Oráculo', short_name: 'Oráculo', url: '/oracle', icons: [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        // Imagens .webp (cartas dos oráculos, molduras, banners — 148 arquivos,
        // ~4 MB) saíram do pré-cache: antes eram TODAS baixadas no primeiro
        // acesso, mesmo as que o usuário nunca veria. Agora entram no cache
        // só quando aparecem na tela (regra "app-images" abaixo). O chunk
        // do xlsx (~320 KB, usado só na importação do IMDb) também fica de
        // fora e é baixado apenas se a importação for aberta.
        globPatterns: ['**/*.{js,css,html,ico,png,woff2}'],
        // 18/11/2026 (otimização): a Courier Prime (/fonts, só do efeito
        // Typewriter) também fica fora do pré-cache: entra no cache quando é
        // usada (regra "app-fonts" abaixo).
        globIgnores: ['**/xlsx-*.js', '**/fonts/courier-prime-*.woff2'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 ano
              }
            }
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.webp'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 dias
              }
            }
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 20 // 20 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/functions\/v1\/tmdb-proxy.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // 18/11/2026 (otimização): os JSON (os idiomas) viram JSON.parse('…'), que o
  // navegador interpreta mais rápido que um objeto literal do mesmo tamanho.
  json: { stringify: true },
  build: {
    rollupOptions: {
      output: {
        // 18/11/2026 (otimização): pedaços estáveis. Antes quase todo pedaço
        // importava do index-*.js, que guardava o código comum E os nomes com
        // hash de todas as telas: mudar uma tela ou um texto trocava o nome de
        // 108 dos 140 arquivos (≈755 KB comprimidos baixados de novo por quem
        // volta depois do deploy). Agora as bibliotecas ficam em pedaços que só
        // mudam com o package.json, o código comum da abertura (lib/, contexts/,
        // a moldura do app) fica no app-core, e na entrada ficam só os arquivos
        // que abrem telas com import(). Mudar uma tela troca ~3 arquivos.
        manualChunks(id, { getModuleInfo }) {
          // Ajudantes do CommonJS (o React é CJS): no mesmo pedaço do React.
          // Sem esta linha os pedaços se importam em círculo e o site abre em
          // branco ("Cannot read properties of undefined (reading
          // 'createContext')") — aconteceu no teste.
          if (id.includes('commonjsHelpers')) return 'react-vendor';
          if (id.includes('/node_modules/')) {
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
            if (/\/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return 'router';
            if (id.includes('/node_modules/@supabase/')) return 'supabase';
            if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
            if (/\/node_modules\/(i18next|react-i18next|i18next-browser-languagedetector|void-elements|html-parse-stringify)\//.test(id)) return 'i18n';
            if (/\/node_modules\/(sonner|react-hot-toast|goober)\//.test(id)) return 'toast';
            // Os ícones num arquivo só (antes eram ~45 pedaços de menos de 1 KB).
            if (id.includes('/node_modules/lucide-react/')) return 'icons';
            // O resto das bibliotecas da abertura num pedaço só, fora da entrada.
            return inEntryGraph(id, getModuleInfo) ? 'vendor' : undefined;
          }
          if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'app-core';
          if (!id.includes('/src/') || id.includes('/src/locales/')) return undefined;
          const info = getModuleInfo(id);
          // Quem abre telas sob demanda (import() de arquivos do app) guarda o
          // nome com hash dessas telas: fica na entrada, senão o app-core mudaria
          // junto com qualquer tela.
          if (!info || info.isEntry || info.dynamicallyImportedIds.some((d) => d.includes('/src/'))) return undefined;
          return inEntryGraph(id, getModuleInfo) ? 'app-core' : undefined;
        },
      },
    },
    target: 'esnext',
    minify: 'terser',
    cssMinify: true,
    reportCompressedSize: false,
    // 18/11/2026 (otimização): os arquivos com hash no nome (JS e CSS do build)
    // vão para /static, uma pasta só deles, que o public/_headers marca como
    // imutável (cache de 1 ano). A pasta /assets continua com as imagens do
    // public/ (cartas, ícones, imagem de compartilhamento), que não têm hash e
    // por isso não podem ter cache longo.
    assetsDir: 'static',
    copyPublicDir: true,
  },
  server: {
    headers: {
      'Cache-Control': 'public, max-age=31536000',
    },
    historyApiFallback: true,
  },
  preview: {
    historyApiFallback: true,
  },
  publicDir: 'public',
});