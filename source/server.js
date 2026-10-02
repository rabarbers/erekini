// E-rēķinu lietotnes serveris: pasniedz mapi public/ un apstrādā POST /api/extract.
// Palaišana: node server.js  (vides mainīgie: PORT, HOST, OPENAI_MODEL, OPENAI_API_KEY)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractInvoiceData, ExtractionError, MAX_FILE_BYTES, DEFAULT_MODEL } from './server/extract.js';

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(SOURCE_DIR, 'public');
// Atslēgas fails atrodas projekta saknē — ārpus publiski pasniegtās mapes.
const API_KEY_FILE = path.join(SOURCE_DIR, '..', 'ApiKey.txt');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export async function loadApiKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    return (await readFile(API_KEY_FILE, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    // Pārāk lielam pieprasījumam atlikušo saturu nelasa — savienojumu aizver.
    ...(status === 413 ? { Connection: 'close' } : {}),
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

const TOO_LARGE_MESSAGE = 'Fails ir pārāk liels. Maksimālais faila izmērs ir 20 MB.';

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      if (size > limit) return;
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        reject(new ExtractionError(413, TOO_LARGE_MESSAGE));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleExtract(req, res, { extract, getApiKey, model, maxFileBytes }) {
  try {
    if (Number(req.headers['content-length']) > maxFileBytes) throw new ExtractionError(413, TOO_LARGE_MESSAGE);
    let fileName = 'dokuments';
    try {
      fileName = decodeURIComponent(req.headers['x-file-name'] ?? '') || fileName;
    } catch { /* nederīgs nosaukums — izmanto noklusējumu */ }
    const buffer = await readBody(req, maxFileBytes);
    if (buffer.length === 0) throw new ExtractionError(400, 'Fails ir tukšs.');
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new ExtractionError(503, 'OpenAI API atslēga nav iestatīta. Ievietojiet to failā ApiKey.txt projekta saknes mapē vai vides mainīgajā OPENAI_API_KEY.');
    }
    const result = await extract({ buffer, fileName, apiKey, model });
    sendJson(res, 200, { data: result.data, model: result.model, fileName });
  } catch (err) {
    if (err instanceof ExtractionError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Datu iegūšanas laikā radās servera kļūda.' });
    }
  }
}

async function serveStatic(req, res, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    relative = '';
  }
  if (relative.endsWith('/')) relative += 'index.html';
  const filePath = path.resolve(PUBLIC_DIR, `.${relative}`);
  const type = MIME_TYPES[path.extname(filePath).toLowerCase()];
  if (!relative || relative.includes('\0') || !filePath.startsWith(PUBLIC_DIR + path.sep) || !type) {
    return sendJson(res, 404, { error: 'Nav atrasts.' });
  }
  let data;
  try {
    data = await readFile(filePath);
  } catch {
    return sendJson(res, 404, { error: 'Nav atrasts.' });
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS,
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

export function createServer({
  extract = extractInvoiceData,
  getApiKey = loadApiKey,
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  maxFileBytes = MAX_FILE_BYTES,
} = {}) {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === '/api/extract') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metode nav atļauta.' });
        return await handleExtract(req, res, { extract, getApiKey, model, maxFileBytes });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Metode nav atļauta.' });
      return await serveStatic(req, res, pathname);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Servera kļūda.' });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    console.log(`E-rēķinu lietotne darbojas: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
}
