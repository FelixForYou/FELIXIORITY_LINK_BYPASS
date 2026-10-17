import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, extname, resolve as pathResolve } from 'node:path';
import { resolveShortlink, publicError } from './lib/resolve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.url === '/api/resolve') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.writeHead(405); return res.end(JSON.stringify({ ok: false, message: 'Gunakan POST.' })); }
    let data = '';
    try {
      for await (const chunk of req) {
        data += chunk;
        if (data.length > 4096) { res.writeHead(413); return res.end(JSON.stringify({ ok: false, message: 'Data terlalu panjang.' })); }
      }
      const input = JSON.parse(data);
      const result = await resolveShortlink(input.url);
      res.writeHead(result.ok ? 200 : 422);
      return res.end(JSON.stringify(result));
    } catch (e) {
      const { status, body } = e instanceof SyntaxError ? { status: 400, body: { ok: false, message: 'Format permintaan salah.' } } : publicError(e);
      res.writeHead(status);
      return res.end(JSON.stringify(body));
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const filename = path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, '');
    const full = pathResolve(root, filename);
    if (!full.startsWith(root + '/') && full !== join(root, 'index.html')) { res.writeHead(403); return res.end(); }
    const info = await stat(full);
    if (!info.isFile()) throw new Error('Not a file');
    const content = await readFile(full);
    res.setHeader('Content-Type', types[extname(full)] || 'application/octet-stream');
    res.setHeader('Cache-Control', extname(full) === '.html' ? 'no-cache' : 'public, max-age=3600');
    res.writeHead(200);
    return res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); return res.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => console.log(`FELIXIORITY LINK BYPASS berjalan di http://localhost:${port}`));
