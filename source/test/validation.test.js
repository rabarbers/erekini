import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInvoice, requiredFields, isValidIban, isValidBic, isValidDate, lvRegNoChecksumOk,
} from '../public/js/validation.js';
import { invoiceFromExtraction } from '../public/js/invoice.js';
import { exampleAInvoice, multiRateInvoice, line, EXTRACTED_A } from './helpers/fixtures.js';

const errorsFor = (invoice) => validateInvoice(invoice).errors;
const fields = (issues) => issues.map((i) => i.field);

function expectError(invoice, field, rule) {
  const errors = errorsFor(invoice);
  const match = errors.find((e) => e.field === field && (!rule || e.rule === rule));
  assert.ok(match, `gaidīta kļūda ${field} ${rule ?? ''}, saņemts: ${JSON.stringify(errors.map((e) => [e.field, e.rule]))}`);
  assert.match(match.message, /\S/);
  return match;
}

test('korekti rēķini neuzrāda kļūdas un brīdinājumus', () => {
  for (const invoice of [exampleAInvoice(), multiRateInvoice(), invoiceFromExtraction(EXTRACTED_A, 'a.pdf')]) {
    const { errors, warnings } = validateInvoice(invoice);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  }
});

test('obligātie lauki: numurs, datums, puses, pozīcijas', () => {
  const invoice = exampleAInvoice();
  Object.assign(invoice, { invoiceNumber: '  ', issueDate: '' });
  invoice.seller.name = '';
  invoice.buyer.name = '';
  invoice.buyer.country = '';
  const errors = errorsFor(invoice);
  assert.ok(errors.find((e) => e.field === 'invoiceNumber' && e.rule === 'BR-02'));
  assert.ok(errors.find((e) => e.field === 'issueDate' && e.rule === 'BR-03'));
  assert.ok(errors.find((e) => e.field === 'seller.name' && e.rule === 'BR-06'));
  assert.ok(errors.find((e) => e.field === 'buyer.name' && e.rule === 'BR-07'));
  assert.ok(errors.find((e) => e.field === 'buyer.country' && e.rule === 'BR-11'));

  const noLines = exampleAInvoice();
  noLines.lines = [];
  expectError(noLines, 'lines', 'BR-16');
});

test('pircēja atsauce vai pasūtījuma numurs (PEPPOL-EN16931-R003)', () => {
  const invoice = exampleAInvoice();
  invoice.buyerReference = '';
  const error = expectError(invoice, 'buyerReference', 'PEPPOL-EN16931-R003');
  assert.deepEqual(error.alsoFields, ['orderReference']);
  invoice.orderReference = 'PO-1';
  assert.deepEqual(errorsFor(invoice), []);
});

test('apmaksas termiņš vai noteikumi, ja summa apmaksai ir pozitīva (BR-CO-25)', () => {
  const invoice = exampleAInvoice();
  invoice.dueDate = '';
  expectError(invoice, 'dueDate', 'BR-CO-25');
  invoice.paymentTerms = 'Apmaksa 10 dienu laikā';
  assert.deepEqual(errorsFor(invoice), []);
  invoice.paymentTerms = '';
  invoice.prepaidAmount = '600';
  assert.deepEqual(errorsFor(invoice), [], 'ja summa apmaksai ir 0, termiņš nav obligāts');
});

test('datumu formāts un loģika', () => {
  const invoice = exampleAInvoice();
  invoice.dueDate = '2025-02-30';
  expectError(invoice, 'dueDate', 'PEPPOL-EN16931-F001');
  invoice.dueDate = '2025-09-01';
  const { errors, warnings } = validateInvoice(invoice);
  assert.deepEqual(errors, []);
  assert.deepEqual(fields(warnings), ['dueDate']);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('30.09.2025'), false);
});

test('Latvijas reģistrācijas un PVN numuru formāts un kontrolcipars', () => {
  assert.equal(lvRegNoChecksumOk('40103512178'), true);
  assert.equal(lvRegNoChecksumOk('40103632832'), true);
  assert.equal(lvRegNoChecksumOk('40103512179'), false);
  assert.equal(lvRegNoChecksumOk('01018012345'), true, 'personas kodam kontrolciparu nepārbauda');

  const short = exampleAInvoice();
  short.buyer.regNo = '4010363283';
  expectError(short, 'buyer.regNo');
  assert.ok(!errorsFor(short).some((e) => e.field === 'buyer.endpointId'), 'nav liekas kļūdas par e-adresi');

  const checksum = exampleAInvoice();
  checksum.buyer.regNo = '40103632833';
  const { errors, warnings } = validateInvoice(checksum);
  assert.deepEqual(errors, []);
  assert.deepEqual(fields(warnings), ['buyer.regNo']);

  const vat = exampleAInvoice();
  vat.buyer.vatNo = '40103632832';
  expectError(vat, 'buyer.vatNo', 'BR-CO-09');
  vat.buyer.vatNo = 'LV123';
  expectError(vat, 'buyer.vatNo');
  vat.buyer.vatNo = 'LV40103632833';
  assert.deepEqual(fields(validateInvoice(vat).warnings), ['buyer.vatNo']);
});

test('e-rēķina adrese: obligāta; ārvalstu pusei jānorāda veids un identifikators', () => {
  const invoice = exampleAInvoice();
  invoice.buyer.country = 'LT';
  invoice.buyer.vatNo = 'LT100001234567';
  expectError(invoice, 'buyer.endpointId', 'PEPPOL-EN16931-R010');
  invoice.buyer.endpointId = 'LT100001234567';
  expectError(invoice, 'buyer.endpointScheme', 'BR-63');
  invoice.buyer.endpointScheme = '9937';
  assert.deepEqual(errorsFor(invoice), []);
});

test('e-rēķina adrese: identifikatoru formāti pēc Peppol noteikumiem', () => {
  const cases = [
    ['0088', '4750000000005', '4750000000000', 'PEPPOL-COMMON-R040'],
    ['0192', '987654321', '987654325', 'PEPPOL-COMMON-R041'],
    ['0184', 'DK1234567', 'DK12345678', 'PEPPOL-COMMON-R042'],
    ['0208', '0123456788', '0123456749', 'PEPPOL-COMMON-R043'],
    ['0007', '5560360792', '5560360793', 'PEPPOL-COMMON-R049'],
    ['0218', '4010363283', '40103632832', undefined],
  ];
  for (const [scheme, bad, good, rule] of cases) {
    const invoice = exampleAInvoice();
    Object.assign(invoice.buyer, { endpointScheme: scheme, endpointId: bad });
    expectError(invoice, 'buyer.endpointId', rule);
    invoice.buyer.endpointId = good;
    assert.deepEqual(errorsFor(invoice), [], `${scheme} ${good}`);
  }
});

test('maksājuma rekvizīti: IBAN obligāts pārskaitījumam, IBAN un BIC formāts', () => {
  assert.equal(isValidIban('LV64UNLA0050018532131'), true);
  assert.equal(isValidIban('LV80BANK0000435195001'), true);
  assert.equal(isValidIban('LV80BANK0000435195002'), false);
  assert.equal(isValidIban('LV80BANK000043519500'), false, 'LV IBAN garums ir 21');
  assert.equal(isValidBic('UNLALV2X'), true);
  assert.equal(isValidBic('HABALV22XXX'), true);
  assert.equal(isValidBic('HABA'), false);

  const invoice = exampleAInvoice();
  invoice.payment.iban = '';
  expectError(invoice, 'payment.iban', 'BR-61');
  invoice.payment.iban = 'LV64UNLA0050018532132';
  expectError(invoice, 'payment.iban');
  invoice.payment.iban = 'LV64UNLA0050018532131';
  invoice.payment.bic = 'UNLA';
  expectError(invoice, 'payment.bic');

  const sepa = exampleAInvoice();
  sepa.payment.meansCode = '58';
  sepa.payment.iban = '12345678';
  expectError(sepa, 'payment.iban');

  const cash = exampleAInvoice();
  cash.payment.meansCode = '10';
  const { errors, warnings } = validateInvoice(cash);
  assert.deepEqual(errors, []);
  assert.deepEqual(fields(warnings), ['payment.iban'], 'brīdina, ka konts netiks iekļauts');
});

test('pozīciju lauki: nosaukums, daudzums, mērvienība, cena, PVN', () => {
  const invoice = multiRateInvoice();
  invoice.lines[0].name = '';
  invoice.lines[1].quantity = 'divi';
  invoice.lines[2].unitCode = '';
  invoice.lines[3].price = '-100';
  invoice.lines[4].vatCategory = '';
  const errors = errorsFor(invoice);
  assert.ok(errors.find((e) => e.field === 'lines.0.name' && e.rule === 'BR-25'));
  assert.ok(errors.find((e) => e.field === 'lines.1.quantity'));
  assert.ok(errors.find((e) => e.field === 'lines.2.unitCode' && e.rule === 'BR-23'));
  assert.ok(errors.find((e) => e.field === 'lines.3.price' && e.rule === 'BR-27'));
  assert.ok(errors.find((e) => e.field === 'lines.4.vat' && e.rule === 'BR-CO-04'));
});

test('PVN likme standarta kategorijai: obligāta, > 0, ne vairāk par 100', () => {
  for (const [rate, rule] of [['', 'BR-S-05'], ['0', 'BR-S-05'], ['abc', undefined], ['101', undefined]]) {
    const invoice = multiRateInvoice();
    invoice.lines[0].vatRate = rate;
    expectError(invoice, 'lines.0.vatRate', rule);
  }
  const custom = multiRateInvoice();
  custom.lines[0].vatRate = '25,5';
  assert.deepEqual(errorsFor(custom), []);
});

test('atbrīvojums no PVN (E): pamatojums obligāts, pārdevējam jābūt PVN vai reģistrācijas numuram', () => {
  const invoice = exampleAInvoice();
  invoice.vatReasons.E = '';
  expectError(invoice, 'vatReasons.E', 'BR-E-10');

  const foreign = exampleAInvoice();
  foreign.seller.country = 'EE';
  foreign.seller.endpointScheme = '0191';
  foreign.seller.endpointId = '12345678';
  expectError(foreign, 'seller.vatNo', 'BR-E-02');
});

test('standarta likme bez pārdevēja PVN numura: atļauts ar reģistrācijas numuru, bet brīdina', () => {
  const invoice = multiRateInvoice();
  invoice.seller.vatNo = '';
  const { errors, warnings } = validateInvoice(invoice);
  assert.deepEqual(errors, []);
  assert.deepEqual(fields(warnings), ['seller.vatNo']);
});

test('apgrieztā maksāšana (AE): pircēja PVN vai reģistrācijas numurs', () => {
  const invoice = multiRateInvoice();
  invoice.lines = [line('Būvdarbi', '1', 'LS', '5000', 'AE')];
  Object.assign(invoice.buyer, { vatNo: '', regNo: '' });
  const errors = errorsFor(invoice);
  assert.ok(errors.find((e) => e.field === 'buyer.vatNo' && e.rule === 'BR-AE-02'));
  invoice.buyer.regNo = '40103555552';
  assert.deepEqual(errorsFor(invoice), [], 'VATEX kods tiek pievienots automātiski, teksts nav obligāts');
});

test('piegāde uz citu ES valsti (K): PVN numuri, piegādes datums un valsts', () => {
  const invoice = multiRateInvoice();
  invoice.lines = [line('Kokmateriāli', '12', 'MTQ', '85,50', 'K')];
  invoice.seller.vatNo = '';
  invoice.buyer.vatNo = '';
  const errors = errorsFor(invoice);
  for (const [field, rule] of [['seller.vatNo', 'BR-IC-02'], ['buyer.vatNo', 'BR-IC-02'], ['deliveryDate', 'BR-IC-11'], ['deliveryCountry', 'BR-IC-12']]) {
    assert.ok(errors.find((e) => e.field === field && e.rule === rule), `${field} ${rule}`);
  }
  Object.assign(invoice, { deliveryDate: '2025-10-10', deliveryCountry: 'EE' });
  invoice.seller.vatNo = 'LV40003123453';
  invoice.buyer.vatNo = 'EE100000000';
  assert.deepEqual(errorsFor(invoice), []);
});

test('eksports (G): pārdevēja PVN numurs obligāts', () => {
  const invoice = multiRateInvoice();
  invoice.lines = [line('Iekārta', '2', 'H87', '1500', 'G')];
  invoice.seller.vatNo = '';
  expectError(invoice, 'seller.vatNo', 'BR-G-02');
});

test('neapliek ar PVN (O): nav PVN numuru un citu kategoriju', () => {
  const invoice = multiRateInvoice();
  invoice.lines = [line('Biedru nauda', '1', 'ANN', '120', 'O'), line('Cits', '1', 'H87', '10', 'S', '21')];
  const errors = errorsFor(invoice);
  assert.ok(errors.find((e) => e.field === 'seller.vatNo' && e.rule === 'BR-O-02'));
  assert.ok(errors.find((e) => e.field === 'buyer.vatNo' && e.rule === 'BR-O-02'));
  assert.ok(errors.find((e) => e.field === 'lines.1.vat' && e.rule === 'BR-O-12'));
  invoice.lines.pop();
  invoice.seller.vatNo = '';
  invoice.buyer.vatNo = '';
  assert.deepEqual(errorsFor(invoice), []);
});

test('avansa summa: skaitlis, nav negatīva, ne vairāk kā 2 zīmes aiz komata', () => {
  for (const value of ['abc', '-1', '10,001']) {
    const invoice = multiRateInvoice();
    invoice.prepaidAmount = value;
    expectError(invoice, 'prepaidAmount');
  }
});

test('OpenAI rezultāta pārbaude: dokumenta summas tiek salīdzinātas ar aprēķinātajām', () => {
  const extracted = structuredClone(EXTRACTED_A);
  extracted.lines[0].quantity = 2; // modelis kļūdaini nolasījis daudzumu
  const invoice = invoiceFromExtraction(extracted, 'a.pdf');
  const { errors, warnings } = validateInvoice(invoice);
  assert.deepEqual(errors, []);
  assert.deepEqual(fields(warnings).sort(), [
    'lines.0.amount', 'totals.payable', 'totals.taxExclusive', 'totals.taxInclusive',
  ]);
  const lineWarning = warnings.find((w) => w.field === 'lines.0.amount');
  assert.match(lineWarning.message, /600,00/);
  assert.equal(lineWarning.short, 'Dokumentā: 600,00');
});

test('requiredFields: nosacīti obligātie lauki', () => {
  const invoice = exampleAInvoice();
  let required = requiredFields(invoice);
  assert.ok(required.has('invoiceNumber'));
  assert.ok(required.has('payment.iban'));
  assert.ok(required.has('vatReasons.E'));
  assert.ok(required.has('seller.regNo'), 'pārdevējam nav PVN numura');
  assert.ok(!required.has('seller.vatNo'), 'Latvijas pārdevējam pietiek ar reģistrācijas numuru');
  assert.ok(!required.has('buyerReference'));

  invoice.buyerReference = '';
  invoice.dueDate = '';
  invoice.payment.meansCode = '10';
  invoice.lines[0].vatCategory = 'K';
  required = requiredFields(invoice);
  for (const f of ['buyerReference', 'orderReference', 'dueDate', 'paymentTerms', 'seller.vatNo', 'buyer.vatNo', 'deliveryDate', 'deliveryCountry']) {
    assert.ok(required.has(f), f);
  }
  assert.ok(!required.has('payment.iban'));
});
