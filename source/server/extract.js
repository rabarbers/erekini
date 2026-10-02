// Rēķina datu iegūšana no augšupielādēta dokumenta ar OpenAI Responses API.
// Izpildās tikai serverī — API atslēga nekad netiek nodota pārlūkam.

import { EXTRACTION_SCHEMA, EXTRACTION_INSTRUCTIONS } from './extraction-schema.js';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Izvēlēts pēc salīdzinājuma ar gpt-5.4-mini un gpt-5.4: visprecīzākais skenētos attēlos, līdzīgs ātrums.
export const DEFAULT_MODEL = 'gpt-5.5';
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const TIMEOUT_MS = 180_000;

export class ExtractionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FILE_TYPES = {
  pdf: { mime: 'application/pdf', input: 'file' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', input: 'file' },
  png: { mime: 'image/png', input: 'image' },
  jpeg: { mime: 'image/jpeg', input: 'image' },
};

// Faila veidu nosaka pēc satura, nevis pēc nosaukuma vai pārlūka norādītā tipa.
export function detectFileType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1'))
      && buffer.includes('word/document.xml')) {
    return 'docx';
  }
  return null;
}

function fileContentPart(type, buffer, fileName) {
  const { mime, input } = FILE_TYPES[type];
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  if (input === 'image') return { type: 'input_image', image_url: dataUrl, detail: 'high' };
  const extension = type === 'docx' ? 'docx' : 'pdf';
  const safeName = /\.[a-z0-9]+$/i.test(fileName) ? fileName : `rekins.${extension}`;
  return { type: 'input_file', filename: safeName, file_data: dataUrl };
}

export function buildRequest({ buffer, fileName, model }) {
  const type = detectFileType(buffer);
  if (!type) {
    throw new ExtractionError(415, 'Neatbalstīts faila formāts. Augšupielādējiet rēķinu PDF, DOCX, PNG vai JPG formātā.');
  }
  const body = {
    model,
    instructions: EXTRACTION_INSTRUCTIONS,
    input: [{
      role: 'user',
      content: [
        fileContentPart(type, buffer, fileName),
        { type: 'input_text', text: 'Extract the invoice data from the attached document.' },
      ],
    }],
    text: { format: { type: 'json_schema', name: 'invoice_extraction', strict: true, schema: EXTRACTION_SCHEMA } },
    store: false,
    max_output_tokens: 32000,
  };
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning = { effort: 'low' };
  return body;
}

function openAiErrorMessage(status) {
  if (status === 401) return 'OpenAI API atslēga nav derīga. Pārbaudiet failu ApiKey.txt.';
  if (status === 429) return 'OpenAI API pieprasījumu limits ir sasniegts vai beidzies kredīts. Mēģiniet vēlāk vai ievadiet datus manuāli.';
  if (status >= 500) return 'OpenAI pakalpojums pašlaik nav pieejams. Mēģiniet vēlāk vai ievadiet datus manuāli.';
  return 'OpenAI nevarēja apstrādāt dokumentu. Pārbaudiet, vai fails nav bojāts, vai ievadiet datus manuāli.';
}

// Atgriež modeļa strukturēto atbildi (JSON objektu). Rezultāts ir nepārbaudīti sākotnējie dati.
export function parseResponse(body) {
  if (body?.status === 'incomplete') {
    throw new ExtractionError(502, 'OpenAI atbilde bija nepilnīga (iespējams, dokuments ir pārāk garš). Mēģiniet vēlreiz vai ievadiet datus manuāli.');
  }
  const message = (body?.output ?? []).find((item) => item.type === 'message');
  const parts = message?.content ?? [];
  if (parts.some((p) => p.type === 'refusal')) {
    throw new ExtractionError(422, 'OpenAI atteicās apstrādāt šo dokumentu. Ievadiet datus manuāli.');
  }
  const text = parts.find((p) => p.type === 'output_text')?.text;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ExtractionError(502, 'OpenAI atbildi neizdevās nolasīt. Mēģiniet vēlreiz vai ievadiet datus manuāli.');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.lines)) {
    throw new ExtractionError(502, 'OpenAI atbildei ir negaidīta struktūra. Mēģiniet vēlreiz vai ievadiet datus manuāli.');
  }
  return data;
}

export async function extractInvoiceData({ buffer, fileName, apiKey, model = DEFAULT_MODEL, fetchImpl = fetch }) {
  const request = buildRequest({ buffer, fileName, model });
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ExtractionError(504, 'OpenAI neatbildēja laikā. Mēģiniet vēlreiz vai ievadiet datus manuāli.');
    }
    throw new ExtractionError(502, 'Neizdevās sazināties ar OpenAI API. Pārbaudiet interneta savienojumu.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`OpenAI API kļūda ${response.status}: ${body?.error?.message ?? 'bez apraksta'}`);
    throw new ExtractionError(502, openAiErrorMessage(response.status));
  }
  return { data: parseResponse(body), model: body?.model ?? model };
}
