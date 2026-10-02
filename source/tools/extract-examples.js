// Datu iegūšanas pārbaude ar mapes examples piemēriem. Izmanto īsto OpenAI API (maksas izsaukumi),
// tāpēc nav daļa no `npm test`. Palaišana: npm run extract-examples
//
// Katram examples/*.pdf, kam blakus ir tāda paša nosaukuma .xml fails:
//   1) iegūst datus ar OpenAI tāpat kā lietotne,
//   2) pārbauda tos ar validateInvoice(),
//   3) ģenerē e-rēķina XML un salīdzina galvenās vērtības ar piemēra XML.
// Atšķirības tiek parādītas, bet neizraisa kļūdu, jo PDF var nesaturēt visus XML datus
// (piemēram, pircēja PVN numuru). Kļūda ir, ja neizdodas iegūt datus vai datos ir validācijas kļūdas.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiKey } from '../server.js';
import { extractInvoiceData, DEFAULT_MODEL } from '../server/extract.js';
import { invoiceFromExtraction } from '../public/js/invoice.js';
import { validateInvoice } from '../public/js/validation.js';
import { buildInvoiceXml } from '../public/js/ubl.js';
import { parseXml, textAt, findAll } from '../test/helpers/xml-tree.js';

const EXAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
const SUPPLIER = 'cac:AccountingSupplierParty/cac:Party';
const CUSTOMER = 'cac:AccountingCustomerParty/cac:Party';

const CHECKED = [
  ['Rēķina numurs', 'cbc:ID'],
  ['Rēķina datums', 'cbc:IssueDate'],
  ['Apmaksas termiņš', 'cbc:DueDate'],
  ['Valūta', 'cbc:DocumentCurrencyCode'],
  ['Pircēja atsauce', 'cbc:BuyerReference'],
  ['Pasūtījuma numurs', 'cac:OrderReference/cbc:ID'],
  ['Līguma numurs', 'cac:ContractDocumentReference/cbc:ID'],
  ['Nosūtītājs', `${SUPPLIER}/cac:PartyLegalEntity/cbc:RegistrationName`],
  ['Nosūtītāja e-adrese', `${SUPPLIER}/cbc:EndpointID`],
  ['Nosūtītāja reģ. nr.', `${SUPPLIER}/cac:PartyLegalEntity/cbc:CompanyID`],
  ['Nosūtītāja PVN/nodokļu nr.', `${SUPPLIER}/cac:PartyTaxScheme/cbc:CompanyID`],
  ['Saņēmējs', `${CUSTOMER}/cac:PartyLegalEntity/cbc:RegistrationName`],
  ['Saņēmēja e-adrese', `${CUSTOMER}/cbc:EndpointID`],
  ['Saņēmēja reģ. nr.', `${CUSTOMER}/cac:PartyLegalEntity/cbc:CompanyID`],
  ['Saņēmēja PVN nr.', `${CUSTOMER}/cac:PartyTaxScheme/cbc:CompanyID`],
  ['Konts (IBAN)', 'cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID'],
  ['BIC', 'cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID'],
  ['PVN kategorija', 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID'],
  ['Atbrīvojuma pamatojums', 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason'],
  ['Summa bez PVN', 'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount'],
  ['PVN summa', 'cac:TaxTotal/cbc:TaxAmount'],
  ['Summa apmaksai', 'cac:LegalMonetaryTotal/cbc:PayableAmount'],
];

async function checkExample(pdfFile, apiKey, model) {
  const name = path.basename(pdfFile, '.pdf');
  console.log(`\n=== ${name}.pdf`);
  const started = Date.now();
  const { data } = await extractInvoiceData({ buffer: readFileSync(pdfFile), fileName: `${name}.pdf`, apiKey, model });
  console.log(`Dati iegūti ${((Date.now() - started) / 1000).toFixed(1)} s (modelis ${model}).`);

  const invoice = invoiceFromExtraction(data, `${name}.pdf`);
  const { errors, warnings } = validateInvoice(invoice);
  for (const e of errors) console.log(`  KĻŪDA ${e.field}: ${e.message}`);
  for (const w of warnings) console.log(`  brīdinājums ${w.field}: ${w.message}`);
  if (errors.length) return false;

  const expected = parseXml(readFileSync(path.join(EXAMPLES_DIR, `${name}.xml`), 'utf8'));
  const actual = parseXml(buildInvoiceXml(invoice));
  let differences = 0;
  const rows = [...CHECKED.map(([label, xpath]) => [label, textAt(expected, xpath), textAt(actual, xpath)]),
    ['Pozīciju skaits', String(findAll(expected, 'cac:InvoiceLine').length), String(findAll(actual, 'cac:InvoiceLine').length)]];
  for (const [label, want, got] of rows) {
    const same = (want ?? '') === (got ?? '');
    if (!same) differences += 1;
    console.log(`  ${same ? '✓' : '≠'} ${label.padEnd(27)} piemērā: ${want ?? '—'}${same ? '' : ` | iegūts: ${got ?? '—'}`}`);
  }
  console.log(`Rezultāts: validācijas kļūdu nav; brīdinājumi: ${warnings.length}; atšķirības no piemēra XML: ${differences}.`);
  return true;
}

const apiKey = await loadApiKey();
if (!apiKey) {
  console.error('OpenAI API atslēga nav iestatīta (ApiKey.txt vai OPENAI_API_KEY).');
  process.exit(1);
}
const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
const pdfs = readdirSync(EXAMPLES_DIR)
  .filter((f) => f.toLowerCase().endsWith('.pdf') && existsSync(path.join(EXAMPLES_DIR, f.replace(/\.pdf$/i, '.xml'))))
  .map((f) => path.join(EXAMPLES_DIR, f));

let ok = true;
for (const pdf of pdfs) {
  try {
    ok = (await checkExample(pdf, apiKey, model)) && ok;
  } catch (err) {
    console.log(`  NEIZDEVĀS: ${err.message}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
