import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const MAX_URL = 2048;
const MAX_HTML = 350_000;
const MAX_HOPS = 9;
const SFL_HOSTS = new Set(['sfl.gl', 'safelinku.com', 'linku.to', 'lokerwfh.net']);
const KNOWN_SHORT_HOSTS = new Set(['bit.ly', 'tinyurl.com', 'is.gd', 'cutt.ly', 'shorturl.at', 't.co', 'sfl.gl', 'linku.to', 'safelinku.com', 'lokerwfh.net', 'rebrand.ly', 'ow.ly', 'buff.ly']);
const QUERY_KEYS = new Set(['url', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'redirect_uri', 'go', 'to', 'link', 'u', 'r', 'out']);

function error(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function normalize(input) {
  if (typeof input !== 'string' || input.length > MAX_URL) throw error('INVALID_URL', 'Masukkan URL yang valid (maksimal 2.048 karakter).');
  let raw = input.trim();
  if (!raw) throw error('INVALID_URL', 'Kolom URL tidak boleh kosong.');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw) && /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(raw)) raw = 'https://' + raw;
  let url;
  try { url = new URL(raw); } catch { throw error('INVALID_URL', 'Format link tidak dikenali. Gunakan URL http atau https.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw error('INVALID_URL', 'Hanya link HTTP dan HTTPS yang diizinkan.');
  if (url.username || url.password) throw error('INVALID_URL', 'URL dengan username atau password tidak didukung.');
  if (!url.hostname || url.href.length > MAX_URL) throw error('INVALID_URL', 'Alamat URL tidak valid atau terlalu panjang.');
  if (url.port && !['80', '443'].includes(url.port)) throw error('BLOCKED_TARGET', 'Port selain 80 dan 443 diblokir untuk keamanan.');
  url.hash = '';
  return url;
}

function isPublicIPv4(ip) {
  const a = ip.split('.').map(Number);
  if (a.length !== 4 || a.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [x, y, z] = a;
  if (x === 0 || x === 10 || x === 127 || x >= 224) return false;
  if (x === 100 && y >= 64 && y <= 127) return false;
  if (x === 169 && y === 254) return false;
  if (x === 172 && y >= 16 && y <= 31) return false;
  if (x === 192 && (y === 168 || y === 0 || (y === 88 && z === 99))) return false;
  if (x === 198 && (y === 18 || y === 19 || (y === 51 && z === 100))) return false;
  if (x === 203 && y === 0 && z === 113) return false;
  // Other address ranges not appropriate for an external URL resolution service.
  if (x === 192 && y === 0 && z === 2) return false;
  if (x === 198 && y === 51 && z === 100) return false;
  return true;
}

async function pinnedIPv4(url) {
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid') || host.endsWith('.arpa')) {
    throw error('BLOCKED_TARGET', 'Alamat lokal atau internal tidak boleh diperiksa.');
  }
  if (net.isIP(host)) {
    if (!isPublicIPv4(host)) throw error('BLOCKED_TARGET', 'Alamat IP privat atau internal diblokir.');
    return host;
  }
  let addresses;
  try { addresses = await dns.lookup(host, { all: true, verbatim: true }); }
  catch { throw error('DNS_ERROR', 'Domain tidak ditemukan atau DNS sedang bermasalah.', 422); }
  const ipv4 = addresses.filter(item => item.family === 4);
  if (!ipv4.length) throw error('BLOCKED_TARGET', 'Domain tanpa alamat IPv4 publik belum didukung.', 422);
  if (ipv4.some(item => !isPublicIPv4(item.address))) throw error('BLOCKED_TARGET', 'Domain mengarah ke alamat jaringan internal.');
  return ipv4[0].address;
}

function uncompress(body, encoding) {
  try {
    const e = String(encoding || '').toLowerCase();
    if (e === 'gzip') return gunzipSync(body, { maxOutputLength: MAX_HTML });
    if (e === 'br') return brotliDecompressSync(body, { maxOutputLength: MAX_HTML });
    if (e === 'deflate') return inflateSync(body, { maxOutputLength: MAX_HTML });
  } catch { return Buffer.alloc(0); }
  return body;
}

async function getPage(url, signal) {
  const ip = await pinnedIPv4(url);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };
    const req = transport.request(url, {
      method: 'GET',
      lookup: (_host, _options, cb) => cb(null, ip, 4),
      maxHeaderSize: 16_384,
      headers: {
        'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
        'accept-encoding': 'identity',
        'user-agent': 'Mozilla/5.0 (compatible; FELIXIORITY-Link-Resolver/1.0)'
      },
      timeout: 8500,
      signal
    }, res => {
      const status = res.statusCode || 0;
      const headers = res.headers;
      const location = headers.location;
      const type = String(headers['content-type'] || '').toLowerCase();
      if (location || (type && !type.includes('html') && !type.includes('text/plain'))) {
        res.destroy();
        done(resolve, { status, headers, body: '', isHtml: false });
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', part => {
        size += part.length;
        if (size <= MAX_HTML) chunks.push(part);
        else { res.destroy(); done(resolve, { status, headers, body: Buffer.concat(chunks).toString('utf8'), isHtml: true, truncated: true }); }
      });
      res.on('end', () => done(resolve, { status, headers, body: uncompress(Buffer.concat(chunks), headers['content-encoding']).toString('utf8'), isHtml: true }));
      res.on('error', e => done(reject, e));
    });
    req.on('error', e => done(reject, e));
    req.end();
  });
}

function candidateUrl(raw, base) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/&amp;/g, '&').replace(/^['"]|['"]$/g, '');
  const attempts = [trimmed];
  try { attempts.push(decodeURIComponent(trimmed)); } catch { /* Keep original */ }
  if (/^[a-z\d+/_=-]{16,}$/i.test(trimmed)) {
    try { attempts.push(Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { /* Ignore */ }
  }
  for (const attempt of attempts) {
    try {
      const candidate = new URL(attempt, base);
      if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') continue;
      if (candidate.username || candidate.password) continue;
      candidate.hash = '';
      if (candidate.href !== base.href) return candidate;
    } catch { /* Ignore */ }
  }
  return null;
}

export function queryRedirect(url) {
  // Only parse explicit destination parameters on shorteners or links whose path looks like a redirect endpoint.
  const eligible = KNOWN_SHORT_HOSTS.has(url.hostname.toLowerCase()) || /(?:\/go|\/out|\/redirect|\/link|\/away)(?:\/|$)/i.test(url.pathname);
  if (!eligible) return null;
  for (const [key, value] of url.searchParams) {
    if (!QUERY_KEYS.has(key.toLowerCase())) continue;
    const target = candidateUrl(value, url);
    if (target && target.origin !== url.origin) return target;
  }
  return null;
}

function decodeHtml(s) {
  return s.replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&quot;/gi, '"');
}

export function htmlRedirect(body, base) {
  if (!body) return null;
  const meta = body.match(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i) || body.match(/<meta\b[^>]*content\s*=\s*["'][^"']*url\s*=[^"']+["'][^>]*http-equiv\s*=\s*["']?refresh/i);
  if (meta) {
    const content = meta[0].match(/content\s*=\s*["']([^"']+)["']/i);
    const urlMatch = content?.[1]?.match(/url\s*=\s*(.+)$/i);
    if (urlMatch) {
      const target = candidateUrl(decodeHtml(urlMatch[1]), base);
      if (target) return { url: target, via: 'meta refresh' };
    }
  }
  const patterns = [
    /(?:window\.)?location\.href\s*=\s*["'](https?:\/\/[^"']+)["']/i,
    /(?:window\.)?location\.(?:replace|assign)\(\s*["'](https?:\/\/[^"']+)["']\s*\)/i,
    /(?:window\.)?location\s*=\s*["'](https?:\/\/[^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const matched = body.match(pattern);
    if (matched) {
      const target = candidateUrl(decodeHtml(matched[1]), base);
      if (target) return { url: target, via: 'redirect HTML' };
    }
  }
  return null;
}

async function trySafelinkuProvider(url, signal) {
  const key = process.env.ZAPI_API_KEY?.trim();
  if (!key || !SFL_HOSTS.has(url.hostname.toLowerCase())) return null;
  const api = new URL('https://api.zapi.ink/v1/bypass-tools:safelinku/resolve');
  api.searchParams.set('url', url.href);
  try {
    const response = await fetch(api, { headers: { 'x-api-key': key, accept: 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(11000)]) });
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = payload?.data?.finalUrl;
    if (typeof raw !== 'string') return null;
    const target = normalize(raw);
    await pinnedIPv4(target);
    if (target.href === url.href) return null;
    return target;
  } catch { return null; }
}

export async function resolveShortlink(rawInput, externalSignal) {
  const started = Date.now();
  const original = normalize(rawInput);
  await pinnedIPv4(original);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 17000);
  const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
  const chain = [{ url: original.href, via: 'input', status: null }];
  let current = original;
  let success = false;
  let method = 'redirect publik';
  let obstacle = null;
  try {
    const providerResult = await trySafelinkuProvider(original, signal);
    if (providerResult) {
      chain.push({ url: providerResult.href, via: 'Safelinku adapter', status: null });
      return { ok: true, finalUrl: providerResult.href, inputUrl: original.href, chain, method: 'integrasi SFL', elapsedMs: Date.now() - started };
    }
    const seen = new Set();
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (seen.has(current.href)) { obstacle = 'Terdeteksi pengalihan berulang.'; break; }
      seen.add(current.href);
      const param = queryRedirect(current);
      if (param) {
        await pinnedIPv4(param);
        current = param;
        success = true;
        method = 'parameter URL';
        chain.push({ url: current.href, via: 'parameter URL', status: null });
        continue;
      }
      let response;
      try { response = await getPage(current, signal); }
      catch (e) {
        if (e.code === 'BLOCKED_TARGET') throw e;
        obstacle = signal.aborted ? 'Batas waktu pengecekan tercapai.' : 'Website tujuan gagal merespons.';
        break;
      }
      chain[chain.length - 1].status = response.status;
      if (response.status === 403 || response.status === 401 || response.status === 429 || response.status === 503) {
        obstacle = 'Website membatasi akses otomatis atau meminta verifikasi.';
        break;
      }
      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        const next = candidateUrl(String(response.headers.location), current);
        if (!next) { obstacle = 'Header redirect tidak valid.'; break; }
        await pinnedIPv4(next);
        current = next;
        success = true;
        method = 'HTTP redirect';
        chain.push({ url: current.href, via: 'HTTP redirect', status: null });
        continue;
      }
      const html = htmlRedirect(response.body, current);
      if (html) {
        await pinnedIPv4(html.url);
        current = html.url;
        success = true;
        method = html.via;
        chain.push({ url: current.href, via: html.via, status: null });
        continue;
      }
      if (/captcha|turnstile|verify (?:you are|you.re|human)|checking your browser|cloudflare|wait.*(?:seconds|detik)|ready\/go|open link|continue/i.test(response.body.slice(0, 200_000)) && !success) {
        obstacle = 'Halaman memakai timer, skrip, atau verifikasi yang tidak menampilkan URL publik.';
      }
      break;
    }
    if (success && current.href !== original.href) {
      return { ok: true, finalUrl: current.href, inputUrl: original.href, chain, method, elapsedMs: Date.now() - started };
    }
    return {
      ok: false, code: 'NOT_RESOLVED',
      message: obstacle || 'URL tujuan belum bisa ditemukan dari pengalihan publik.',
      hint: SFL_HOSTS.has(original.hostname.toLowerCase()) && !process.env.ZAPI_API_KEY ? 'Untuk link SFL yang memakai verifikasi khusus, tambahkan ZAPI_API_KEY pada server. Tanpa kunci, resolver tetap mencoba metode publik.' : 'Link ini mungkin memerlukan aksi di browser, cookie, atau CAPTCHA. Tool tidak memalsukan hasil.',
      inputUrl: original.href, chain, elapsedMs: Date.now() - started
    };
  } finally { clearTimeout(timer); }
}

export function publicError(e) {
  if (e?.code && ['INVALID_URL', 'BLOCKED_TARGET', 'DNS_ERROR'].includes(e.code)) return { status: e.status || 400, body: { ok: false, code: e.code, message: e.message } };
  return { status: 500, body: { ok: false, code: 'SERVER_ERROR', message: 'Terjadi gangguan saat memproses link. Silakan coba lagi.' } };
}
