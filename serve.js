/* ==========================================================================
   VCSS 4G — zero-dependency local static server
   Brotli/gzip negotiation, ETag/304, immutable versioned assets, and the
   security headers used by the v1.1 baseline.

   Usage:
     node serve.js [root] [port] [host]
     node serve.js                 # serves this folder on 127.0.0.1:8765
     node serve.js . 9000 0.0.0.0 # optional LAN demo bind

   No frameworks, no npm install, no runtime dependency.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(process.argv[2] || __dirname);
const PORT = Number(process.argv[3] || process.env.PORT || 8765);
const HOST = process.argv[4] || process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt', '.map']);
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const compressionCache = new Map();

function resolveRequestPath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  } catch (error) {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

function etagFor(stat) {
  return 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
}

function isVersioned(rawUrl) {
  return /[?&]v=[^&]+/.test(rawUrl || '');
}

function compressed(encoding, raw, stat) {
  const key = encoding + ':' + stat.size + ':' + Math.floor(stat.mtimeMs);
  if (compressionCache.has(key)) return compressionCache.get(key);
  let body;
  if (encoding === 'br') {
    body = zlib.brotliCompressSync(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
  } else {
    body = zlib.gzipSync(raw, { level: 6 });
  }
  compressionCache.set(key, body);
  if (compressionCache.size > 64) {
    const oldest = compressionCache.keys().next().value;
    compressionCache.delete(oldest);
  }
  return body;
}

function sendError(res, status, message, extra = {}) {
  const body = Buffer.from(message + '\n', 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Audit tools abort page loads mid-response; swallow the resulting EPIPE
  // instead of letting an unhandled 'error' event take the process down.
  req.on('error', () => {});
  res.on('error', () => {});
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let filePath = resolveRequestPath(req.url);
  if (!filePath) {
    sendError(res, 400, 'Bad request');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.statSync(filePath);
    }
  } catch (error) {
    sendError(res, 404, 'Not found');
    return;
  }

  if (!stat.isFile()) {
    sendError(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const versioned = isVersioned(req.url);
  const cacheControl = ext === '.html'
    ? 'no-cache'
    : versioned
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
  const etag = etagFor(stat);

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': cacheControl,
      Vary: 'Accept-Encoding',
      ...SECURITY_HEADERS,
    });
    res.end();
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch (error) {
    sendError(res, 500, 'Unable to read file');
    return;
  }

  const accepts = String(req.headers['accept-encoding'] || '').toLowerCase();
  let encoding = 'identity';
  let body = raw;
  if (COMPRESSIBLE.has(ext) && raw.length > 512) {
    if (/\bbr\b/.test(accepts)) {
      encoding = 'br';
      body = compressed('br', raw, stat);
    } else if (/\bgzip\b/.test(accepts)) {
      encoding = 'gzip';
      body = compressed('gzip', raw, stat);
    }
  }

  const headers = {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': cacheControl,
    ETag: etag,
    Vary: 'Accept-Encoding',
    'Last-Modified': stat.mtime.toUTCString(),
    ...SECURITY_HEADERS,
  };
  if (encoding !== 'identity') headers['Content-Encoding'] = encoding;

  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else res.end(body);
});

server.listen(PORT, HOST, () => {
  console.log('VCSS 4G serving ' + ROOT);
  console.log('  http://' + HOST + ':' + PORT + '/');
  console.log('  Brotli/gzip enabled · ETag/304 enabled · CSP + security headers enabled');
});

server.on('clientError', (error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.on('error', (error) => {
  console.error('VCSS 4G server error: ' + error.message);
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
