import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server.js';
import { ExtractionError } from '../server/extract.js';
import { VatLookupError } from '../server/vat.js';
import { EXTRACTED_A } from './helpers/fixtures.js';

let server;
let baseUrl;
let apiKey = 'sk-test';
let extractCalls = [];
let extractImpl = async () => ({ data: EXTRACTED_A, model: 'gpt-test' });
let vatImpl;

before(async () => {
  server = createServer({
    extract: async (args) => {
      extractCalls.push(args);
      return extractImpl(args);
    },
    getApiKey: async () => apiKey,
    maxFileBytes: 1024,
    lookupVat: (party) => vatImpl(party),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('GET /api/vat-status: nodod identifikatorus un pasniedz rezultātu bez saglabāšanas', async () => {
  vatImpl = async (party) => {
    assert.deepEqual(party, { country: 'LV', regNo: '40003052786', vatNo: '' });
    return { status: 'active', vatNo: 'LV40003052786' };
  };
  const res = await fetch(`${baseUrl}/api/vat-status?country=LV&regNo=40003052786`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { status: 'active', vatNo: 'LV40003052786' });
  assert.equal((await fetch(`${baseUrl}/api/vat-status`, { method: 'POST' })).status, 405);
});

test('PVN API kļūdas atgriež latviski ar atbilstošu HTTP statusu', async () => {
  for (const status of [400, 502, 504]) {
    vatImpl = async () => { throw new VatLookupError(status, 'Neizdevās pārbaudīt PVN statusu.'); };
    const res = await fetch(`${baseUrl}/api/vat-status?vatNo=LV40003052786`);
    assert.equal(res.status, status);
    assert.equal((await res.json()).error, 'Neizdevās pārbaudīt PVN statusu.');
  }
  vatImpl = async () => { throw new Error('internal exception'); };
  const res = await fetch(`${baseUrl}/api/vat-status`);
  assert.equal(res.status, 502);
  assert.doesNotMatch((await res.json()).error, /internal exception/);
});

after(() => new Promise((resolve) => server.close(resolve)));

// Neapstrādāts pieprasījums, lai ceļš netiktu normalizēts (pārbauda direktoriju šķērsošanu).
function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, { method: 'GET', path }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function upload(body, headers = {}) {
  return fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('rēķins.pdf'), ...headers },
    body,
  });
}

test('pasniedz lietotnes lapu ar drošības galvenēm', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await res.text(), /E-rēķinu sagatavošana/);
  const js = await fetch(`${baseUrl}/js/validation.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('API atslēga un servera kods nav pieejami caur HTTP', async () => {
  for (const path of ['/ApiKey.txt', '/../ApiKey.txt', '/%2e%2e/ApiKey.txt', '/..%5cApiKey.txt', '/..%2f..%2fApiKey.txt',
    '/server.js', '/../server.js', '/server/extract.js', '/js/..%5c..%5cserver.js', '/package.json']) {
    const res = await rawGet(path);
    assert.equal(res.status, 404, path);
    assert.ok(!res.body.includes('sk-'), path);
  }
});

test('POST /api/extract: nodod failu datu iegūšanai un atgriež rezultātu', async () => {
  extractCalls = [];
  const res = await upload(Buffer.from('%PDF-1.7 test'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { data: EXTRACTED_A, model: 'gpt-test', fileName: 'rēķins.pdf' });
  assert.equal(extractCalls.length, 1);
  assert.equal(extractCalls[0].fileName, 'rēķins.pdf');
  assert.equal(extractCalls[0].apiKey, 'sk-test');
  assert.equal(extractCalls[0].buffer.toString(), '%PDF-1.7 test');
});

test('POST /api/extract: kļūdu gadījumi', async () => {
  assert.equal((await fetch(`${baseUrl}/api/extract`)).status, 405);

  const empty = await upload(Buffer.alloc(0));
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, 'Fails ir tukšs.');

  const tooLarge = await upload(Buffer.alloc(2048, 1));
  assert.equal(tooLarge.status, 413);
  assert.match((await tooLarge.json()).error, /pārāk liels/);

  apiKey = null;
  const noKey = await upload(Buffer.from('%PDF-'));
  assert.equal(noKey.status, 503);
  assert.match((await noKey.json()).error, /ApiKey\.txt/);
  apiKey = 'sk-test';

  extractImpl = async () => { throw new ExtractionError(415, 'Neatbalstīts faila formāts.'); };
  const unsupported = await upload(Buffer.from('teksts'));
  assert.equal(unsupported.status, 415);
  assert.equal((await unsupported.json()).error, 'Neatbalstīts faila formāts.');

  extractImpl = async () => { throw new Error('negaidīta kļūda'); };
  const originalError = console.error;
  console.error = () => {};
  const crash = await upload(Buffer.from('%PDF-'));
  console.error = originalError;
  assert.equal(crash.status, 500);
  assert.doesNotMatch((await crash.json()).error, /negaidīta/);
});
