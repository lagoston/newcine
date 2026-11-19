import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';

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

// ---------------------------------------------------------------------------
// 18/11/2026 (Reborn, pacote): PEDAÇOS-EIXO COM NOME ESTÁVEL.
//
// O problema (medido na main, commit 41d9fca): mudar UM arquivo do código comum
// da abertura (ex.: src/lib/invite.ts) trocava o nome de 81 dos 120 arquivos do
// site (611 KB comprimidos baixados de novo por quem volta). Motivo: quase todo
// pedaço importa o app-core (e as bibliotecas, e os ícones) pelo nome COM hash;
// quando o conteúdo de um deles muda, o nome muda, e com ele o conteúdo (e o
// nome) de todos os que o importam. Nos últimos 63 commits com mudança em src/,
// metade disparava essa cascata (simulação: mediana de 81 arquivos por deploy).
//
// A correção: os pedaços-eixo (HUBS, abaixo) saem com nome FIXO em /core
// (core/app-core.js…). Quem importa escreve "../core/app-core.js", que não muda
// quando o conteúdo do eixo muda: a cascata para ali. E, para o navegador poder
// guardar esses arquivos para sempre (e nunca misturar versões), cada eixo
// ganha também uma cópia com hash em /static (static/app-core-AbC123xy.js) e o
// index.html leva um "import map" (padrão da web para exatamente isto) que diz:
// "quando alguém pedir /core/app-core.js, entregue /static/app-core-AbC123xy.js".
//   • Navegador atual (Chrome/WebView 89+, Safari 16.4+, Firefox 108+): usa o
//     mapa; tudo vem de /static, imutável, e é o index.html de cada visita quem
//     escolhe a versão (nada de versões misturadas).
//   • Navegador antigo: ignora o mapa e baixa /core/app-core.js direto. Esse
//     arquivo é conferido com o servidor a cada visita (public/_headers).
// O script logo depois do mapa adianta o download dos eixos (modulepreload)
// com o endereço certo para cada caso.
//
// ATENÇÃO, para quem mexer aqui:
//   • o <script type="importmap"> precisa ser o PRIMEIRO script do <head>
//     (antes de qualquer módulo ou modulepreload), senão o navegador o ignora;
//   • um pedaço só pode entrar em HUBS se for carregado na abertura (import
//     estático a partir do main.tsx): os eixos ficam fora da lista de
//     pré-carga dos import() (modulePreload.resolveDependencies, abaixo);
//   • depois de mexer, rode `npm run smoke` (tela branca = eixo errado) e
//     `npm run check:size` (confere o mapa, a casca do service worker e os tamanhos).
//
// PLANO B (interruptor, sem mexer no código): se algum navegador ou WebView
// mostrar tela branca por causa disto, publique com a variável de ambiente
// STABLE_HUBS=0 (no Netlify: Site configuration → Environment variables; no
// terminal: `STABLE_HUBS=0 npx vite build`). Os eixos voltam a sair com hash
// em /static, sem import map e sem /core — exatamente como na onda 1. A
// cascata de nomes volta, mas o site fica como estava. O resto (fontes, CSS
// global na entrada, pré-cache enxuto) não depende do interruptor.
const STABLE_HUBS = process.env.STABLE_HUBS !== '0';
const HUB_DIR = 'core';
const HUBS = ['react-vendor', 'router', 'supabase', 'motion', 'i18n', 'toast', 'icons', 'vendor', 'app-core'];
// '/core/app-core.js' → '/static/app-core-<hash>.js' (preenchido a cada build)
const hubMap = new Map<string, string>();
// A casca: tudo o que o index.html precisa para abrir e desenhar a moldura (a
// entrada, os eixos, o CSS global, os dois idiomas). É o que o service worker
// guarda de antemão; o resto ele guarda quando a pessoa abre.
const shellFiles = new Set<string>();

type BundleChunk = { type: 'chunk'; fileName: string; code: string; isEntry: boolean; imports: string[]; facadeModuleId?: string | null; viteMetadata?: { importedCss: Set<string> } };
type BundleAsset = { type: 'asset'; fileName: string; source: string | Uint8Array };

function stableHubs(): Plugin {
  return {
    name: 'stable-hubs',
    apply: 'build',
    generateBundle: {
      // Por último: o Vite ainda reescreve os import() dos pedaços nesta fase,
      // e a cópia com hash precisa do código final.
      order: 'post',
      handler(_options, rawBundle) {
        const bundle = rawBundle as unknown as Record<string, BundleChunk | BundleAsset>;
        hubMap.clear();
        shellFiles.clear();
        const hubFile = (name: string) => `${HUB_DIR}/${name}.js`;
        // Dentro de um eixo, o import de OUTRO eixo sai como "./x.js" (mesma
        // pasta). Na cópia que vai para /static isso vira "../core/x.js": o
        // mesmo endereço estável, que o mapa resolve.
        const sibling = /((?:\bfrom|\bimport)\s*|\bimport\s*\(\s*)(["'])\.\/([\w.-]+)\.js\2/g;
        for (const name of STABLE_HUBS ? HUBS : []) {
          const chunk = bundle[hubFile(name)];
          if (!chunk || chunk.type !== 'chunk') continue;
          const code = chunk.code.replace(sibling, (all: string, pre: string, quote: string, target: string) =>
            HUBS.includes(target) ? `${pre}${quote}../${HUB_DIR}/${target}.js${quote}` : all,
          );
          const hash = createHash('sha256').update(code).digest('base64url').slice(0, 8);
          const fileName = `static/${name}-${hash}.js`;
          this.emitFile({ type: 'asset', fileName, source: code });
          hubMap.set(`/${hubFile(name)}`, `/${fileName}`);
        }

        // A casca (para o pré-cache do service worker).
        const chunks = Object.values(bundle).filter((item): item is BundleChunk => item.type === 'chunk');
        const entry = chunks.find((chunk) => chunk.isEntry);
        const seen = new Set<string>();
        const visit = (fileName: string) => {
          if (seen.has(fileName)) return;
          seen.add(fileName);
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk') return;
          // dos eixos, guarda-se a cópia com hash (é a que os navegadores atuais pedem)
          shellFiles.add((hubMap.get(`/${fileName}`) ?? `/${fileName}`).slice(1));
          chunk.viteMetadata?.importedCss.forEach((css) => shellFiles.add(css));
          chunk.imports.forEach(visit);
        };
        if (entry) visit(entry.fileName);
        for (const chunk of chunks) if (/locales\/(pt|en)\.json$/.test(chunk.facadeModuleId ?? '')) shellFiles.add(chunk.fileName);

        // O mapa e a pré-carga dos eixos, no começo do <head>.
        const html = bundle['index.html'];
        if (html && html.type === 'asset' && hubMap.size) {
          const importMap = JSON.stringify({ imports: Object.fromEntries(hubMap) });
          // Lê o próprio mapa (navegador antigo não o aplica, mas o texto está lá)
          // e pede cada eixo pelo endereço que este navegador vai usar.
          const preload = `(function(){var m=JSON.parse(document.getElementById('co-hubs').textContent).imports,s=!!(window.HTMLScriptElement&&HTMLScriptElement.supports&&HTMLScriptElement.supports('importmap'));for(var p in m){var k=document.createElement('link');k.rel='modulepreload';k.crossOrigin='';k.href=s?m[p]:p;document.head.appendChild(k)}})()`;
          const tags = `<script type="importmap" id="co-hubs">${importMap}</script>\n    <script>${preload}</script>`;
          const source = String(html.source);
          if (!/<meta charset[^>]*>/i.test(source)) this.error('stable-hubs: o index.html precisa de <meta charset> (é depois dele que o import map entra)');
          html.source = source.replace(/<meta charset[^>]*>/i, (meta) => `${meta}\n    ${tags}`);
        }
      },
    },
  };
}

// O que o service worker guarda de antemão além da casca (ver "workbox" abaixo).
// Os ícones, o manifesto e os includeAssets o próprio plugin acrescenta.
const PRECACHE_EXTRAS = new Set([
  'index.html',
  'offline.html',
  // a única fonte da primeira tela (as outras entram no cache quando aparecem)
  'fonts/pixelify-sans-latin-wght-normal.woff2',
]);

export default defineConfig({
  plugins: [
    react(),
    preloadLocale(),
    stableHubs(),
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
        // 18/11/2026 (Reborn, pacote): PRÉ-CACHE ENXUTO. Antes o service worker
        // baixava de antemão TODOS os JS e CSS do site (136 arquivos, ≈1,15 MB
        // comprimidos), inclusive pôquer, Sala do Diretor e curadoria, que a
        // maioria nunca abre — e começava no meio da primeira abertura. Agora
        // ele guarda de antemão só a CASCA (o index.html e o que ele precisa
        // para abrir: entrada, eixos, CSS global, os dois idiomas, a Pixelify)
        // e cada tela entra no cache quando a pessoa a abre (regra "app-static"
        // abaixo; os nomes em /static mudam com o conteúdo, então "guardou,
        // vale para sempre"). A lista da casca é calculada no build
        // (stableHubs → shellFiles), não escrita à mão.
        // Imagens .webp (cartas dos oráculos, molduras, banners) e as outras
        // fontes também entram só quando aparecem ("app-images", "app-fonts").
        globPatterns: ['**/*.{js,css,html,woff2}'],
        manifestTransforms: [
          async (entries) => ({
            warnings: shellFiles.size ? [] : ['stable-hubs: a casca do service worker veio vazia'],
            manifest: entries.filter((entry) => shellFiles.has(entry.url) || PRECACHE_EXTRAS.has(entry.url)),
          }),
        ],
        runtimeCaching: [
          {
            // As telas (JS e CSS com hash no nome): a primeira vez vem da rede e
            // fica guardada; depois, do aparelho. Um nome que não existe mais
            // (deploy novo) responde 404, que não é guardado: o site se
            // recupera sozinho (src/lib/appUpdate.ts).
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/static/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-static',
              cacheableResponse: { statuses: [200] },
              expiration: {
                maxEntries: 240,
                maxAgeSeconds: 60 * 60 * 24 * 45, // 45 dias sem uso
                purgeOnQuotaError: true
              }
            }
          },
          {
            // Os eixos com nome fixo (/core): só os navegadores antigos, sem
            // import map, pedem estes. Sempre a versão do servidor; a guardada
            // serve apenas sem rede.
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/core/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-core-fallback',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 20 }
            }
          },
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
          // 18/11/2026 (Reborn, pacote): o CSS global (src/index.css e o que ele
          // importa) fica com a entrada, não com o app-core. O Vite põe o nome do
          // arquivo .css no cálculo do hash do pedaço dono: com o CSS no app-core,
          // mexer em qualquer estilo global trocava o conteúdo do app-core.
          if (/\.css(\?|$)/.test(id)) return undefined;
          const info = getModuleInfo(id);
          // Quem abre telas sob demanda (import() de arquivos do app) guarda o
          // nome com hash dessas telas: fica na entrada, senão o app-core mudaria
          // junto com qualquer tela.
          if (!info || info.isEntry || info.dynamicallyImportedIds.some((d) => d.includes('/src/'))) return undefined;
          // 19/11/2026 (Reborn, render 2b): o ajudante das imagens do TMDB é
          // minúsculo (589 bytes), não importa nada e é usado por 42 arquivos de
          // telas sob demanda. Solto, virava um pedaço próprio no topo da
          // "cascata" do check:size (mexer nele trocava o nome de 42 arquivos e
          // custava um pedido a mais em toda tela); no app-core, de nome
          // estável, não troca o nome de ninguém.
          if (id.endsWith('/src/lib/tmdbImage.ts')) return 'app-core';
          return inEntryGraph(id, getModuleInfo) ? 'app-core' : undefined;
        },
        // 18/11/2026 (Reborn, pacote): os eixos saem com nome fixo em /core (ver
        // stableHubs, no alto); o resto continua com hash em /static.
        chunkFileNames: (chunk) => (STABLE_HUBS && HUBS.includes(chunk.name) ? `${HUB_DIR}/[name].js` : 'static/[name]-[hash].js'),
        // Os nomes pelos quais um pedaço exporta para os outros ficam os do
        // código (useAuth, getTrending…), não letras sorteadas (a, b, c…). Com
        // letras, acrescentar UMA função ao app-core remanejava as letras e
        // mudava o texto de todos os que importam dele: a cascata voltava.
        minifyInternalExports: false,
      },
    },
    modulePreload: {
      // Os eixos já são pedidos pelo script do index.html, com o endereço certo
      // para cada navegador; aqui saem da lista de pré-carga dos import() (um
      // <link rel="modulepreload"> não passa pelo import map e baixaria a
      // cópia de /core à toa).
      resolveDependencies: (_file, deps) => deps.filter((dep) => !dep.startsWith(`${HUB_DIR}/`)),
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