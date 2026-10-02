import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  detectFileType, buildRequest, parseResponse, extractInvoiceData, ExtractionError,
} from '../server/extract.js';
import { EXTRACTION_SCHEMA } from '../server/extraction-schema.js';
import { EXTRACTED_A } from './helpers/fixtures.js';

const PDF = readFileSync(new URL('../../examples/e-rekins_A.pdf', import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const DOCX = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('....[Content_Types].xml....word/document.xml....')]);
const XLSX = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('....xl/workbook.xml....')]);

const okBody = (data) => ({
  model: 'gpt-test',
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] },
  ],
});

function fakeFetch(status, body, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test('faila veidu nosaka pēc satura, nevis nosaukuma', () => {
  assert.equal(detectFileType(PDF), 'pdf');
  assert.equal(detectFileType(PNG), 'png');
  assert.equal(detectFileType(JPEG), 'jpeg');
  assert.equal(detectFileType(DOCX), 'docx');
  assert.equal(detectFileType(XLSX), null);
  assert.equal(detectFileType(Buffer.from('teksts')), null);
});

test('pieprasījums: PDF un DOCX kā input_file, attēli kā input_image, strukturēta izvade', () => {
  const pdf = buildRequest({ buffer: PDF, fileName: 'e-rekins_A.pdf', model: 'gpt-5.5' });
  const [file, instruction] = pdf.input[0].content;
  assert.equal(file.type, 'input_file');
  assert.equal(file.filename, 'e-rekins_A.pdf');
  assert.ok(file.file_data.startsWith('data:application/pdf;base64,'));
  assert.equal(instruction.type, 'input_text');
  assert.deepEqual(pdf.text.format.type, 'json_schema');
  assert.equal(pdf.text.format.strict, true);
  assert.equal(pdf.store, false, 'dokumenta saturs netiek glabāts OpenAI');
  assert.deepEqual(pdf.reasoning, { effort: 'low' });

  const docx = buildRequest({ buffer: DOCX, fileName: 'rekins', model: 'gpt-4.1' });
  assert.equal(docx.input[0].content[0].filename, 'rekins.docx');
  assert.ok(docx.input[0].content[0].file_data.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,'));
  assert.equal(docx.reasoning, undefined, 'modeļiem bez spriešanas parametrs netiek sūtīts');

  const png = buildRequest({ buffer: PNG, fileName: 'x.png', model: 'gpt-5.5' });
  assert.equal(png.input[0].content[0].type, 'input_image');
  assert.ok(png.input[0].content[0].image_url.startsWith('data:image/png;base64,'));

  assert.throws(() => buildRequest({ buffer: XLSX, fileName: 'x.xlsx', model: 'gpt-5.5' }),
    (err) => err instanceof ExtractionError && err.status === 415);
});

test('strukturētās izvades shēma atbilst OpenAI "strict" prasībām', () => {
  const check = (schema, path) => {
    if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
      assert.equal(schema.additionalProperties, false, path);
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), path);
      for (const [key, value] of Object.entries(schema.properties)) check(value, `${path}.${key}`);
    }
    if (schema.items) check(schema.items, `${path}[]`);
  };
  check(EXTRACTION_SCHEMA, 'root');
});

test('atbildes apstrāde: JSON, atteikums, nepilnīga atbilde, nederīgs saturs', () => {
  assert.deepEqual(parseResponse(okBody(EXTRACTED_A)), EXTRACTED_A);
  assert.throws(() => parseResponse({ status: 'incomplete', output: [] }), (e) => e.status === 502);
  assert.throws(() => parseResponse({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }),
    (e) => e.status === 422);
  assert.throws(() => parseResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{nav json' }] }] }),
    (e) => e.status === 502);
  assert.throws(() => parseResponse(okBody({ lines: 'nav masīvs' })), (e) => e.status === 502);
});

test('extractInvoiceData: veiksmīgs izsaukums nosūta atslēgu tikai autorizācijas galvenē', async () => {
  const calls = [];
  const result = await extractInvoiceData({
    buffer: PDF, fileName: 'a.pdf', apiKey: 'sk-test', model: 'gpt-5.5', fetchImpl: fakeFetch(200, okBody(EXTRACTED_A), calls),
  });
  assert.deepEqual(result, { data: EXTRACTED_A, model: 'gpt-test' });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-test');
  assert.ok(!calls[0].options.body.includes('sk-test'));
});

test('extractInvoiceData: OpenAI kļūdas tiek pārvērstas saprotamos latviešu paziņojumos', async (t) => {
  t.mock.method(console, 'error', () => {});
  const run = (fetchImpl) => extractInvoiceData({ buffer: PDF, fileName: 'a.pdf', apiKey: 'sk', model: 'gpt-5.5', fetchImpl });
  await assert.rejects(run(fakeFetch(401, { error: { message: 'Incorrect API key' } })), /atslēga nav derīga/);
  await assert.rejects(run(fakeFetch(429, {})), /limits/);
  await assert.rejects(run(fakeFetch(503, {})), /nav pieejams/);
  await assert.rejects(run(fakeFetch(400, { error: { message: 'Invalid file' } })), (e) => /nevarēja apstrādāt/.test(e.message) && !/Invalid/.test(e.message));
  await assert.rejects(run(async () => { throw new TypeError('fetch failed'); }), /interneta savienojumu/);
  await assert.rejects(run(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }), /neatbildēja laikā/);
});
