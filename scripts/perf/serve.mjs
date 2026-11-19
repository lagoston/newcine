// Servidor estático para testar um build do CineOracle como ele roda no Netlify
// (18/11/2026, Protocolo Reborn, pacote). Usado pelo teste de fumaça
// (scripts/smoke.mjs) e pela medição da abertura (scripts/perf/measure.mjs).
//
// Imita o que importa do Netlify:
//   • brotli/gzip já comprimidos (o tamanho que o celular baixa é o real);
//   • os cabeçalhos de cache do public/_headers: /static e /fonts imutáveis;
//     todo o resto "confira com o servidor" (ETag + 304);
//   • o public/_redirects: um arquivo de /static ou /core que não existe
//     responde 404 (não o index.html); qualquer outra rota cai no index.html.
//
// Uso direto:  node scripts/perf/serve.mjs <pasta do build> [porta=5204]
// Em script:   const server = await startServer(pasta, porta, { onRequest: (caminho, status) => … }); … await server.close();
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };
const COMPRESSIBLE = /\.(js|css|html|json|svg|webmanifest|txt)$/;
const IMMUTABLE = /^\/(static|fonts)\//;
const NO_FALLBACK = /^\/(static|core|fonts)\//;

export function startServer(dir, port = 5204, { log = false, onRequest = null } = {}) {
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`não achei index.html em ${root}`);
  const cache = new Map();
  const etags = new Map();
  // Comprime tudo antes de abrir a porta (o Netlify serve arquivos já comprimidos).
  (function warm(folder) {
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder, name);
      if (fs.statSync(file).isDirectory()) {
        warm(file);
        continue;
      }
      const raw = fs.readFileSync(file);
      etags.set(file, `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`);
      cache.set(`${file}|null`, raw);
      if (!COMPRESSIBLE.test(name)) continue;
      cache.set(`${file}|br`, zlib.brotliCompressSync(raw));
      cache.set(`${file}|gzip`, zlib.gzipSync(raw, { level: 9 }));
    }
  })(root);

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(root, pathname);
    let status = 200;
    if (!file.startsWith(root) || !cache.has(`${file}|null`)) {
      if (NO_FALLBACK.test(pathname)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('404');
        if (log) console.log(404, pathname);
        onRequest?.(pathname, 404);
        return;
      }
      file = path.join(root, 'index.html');
    }
    const ext = path.extname(file);
    const accept = req.headers['accept-encoding'] || '';
    const encoding = COMPRESSIBLE.test(ext) ? (accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null) : null;
    const body = cache.get(`${file}|${encoding}`);
    const etag = etags.get(file);
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': IMMUTABLE.test(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) status = 304;
    if (status === 304) {
      res.writeHead(304, headers);
      res.end();
    } else {
      if (encoding) headers['Content-Encoding'] = encoding;
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(body);
    }
    if (log) console.log(status, pathname);
    onRequest?.(pathname, status);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        port,
        root,
        close: () => new Promise((done) => {
          server.closeAllConnections?.();
          server.close(() => done());
        }),
      }),
    );
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2);
  if (!dir) {
    console.error('Uso: node scripts/perf/serve.mjs <pasta do build> [porta=5204]');
    process.exit(1);
  }
  startServer(dir, Number(port) || 5204, { log: process.argv.includes('--log') }).then((server) => console.log('serving', server.root, 'on', server.port));
}
