/**
 * Servidor estatico minimalista (zero dependencias).
 *
 * Existe apenas para servir a aplicacao via HTTP, porque modulos ES
 * (`<script type="module">`) sao bloqueados pelo CORS quando abertos
 * diretamente pelo protocolo file://.
 *
 * Uso: `npm start` -> http://localhost:5173
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // normalize + prefixo obrigatorio evitam path traversal (../../etc/passwd)
  const target = normalize(join(ROOT, urlPath === '/' ? '/index.html' : urlPath));

  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    // SPA fallback: rotas desconhecidas devolvem o index (o roteador e por hash,
    // mas isso mantem o comportamento previsivel se a URL for digitada a mao).
    try {
      const html = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
    } catch {
      res.writeHead(404).end('Not Found');
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  Controle de Chamada rodando em http://localhost:${PORT}\n`);
});
