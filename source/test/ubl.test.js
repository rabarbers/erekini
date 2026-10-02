import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInvoiceXml, xmlFileName, InvoiceValidationError, TAX_REGISTRATION_SCHEME_ID } from '../public/js/ubl.js';
import { parseDecimal, add, sub, mul, cmp, sum, round, percentOf } from '../public/js/decimal.js';
import { parseXml, find, findAll, textAt, walk } from './helpers/xml-tree.js';
import { exampleAInvoice, multiRateInvoice, line } from './helpers/fixtures.js';

const EXAMPLE_XML = readFileSync(new URL('../../examples/e-rekins_A.xml', import.meta.url), 'utf8');
const SUPPLIER = 'cac:AccountingSupplierParty/cac:Party';
const CUSTOMER = 'cac:AccountingCustomerParty/cac:Party';

// Vērtības, kurām jāsakrīt ar piemēru examples/e-rekins_A.xml.
const COMPARED_PATHS = [
  'cbc:CustomizationID', 'cbc:ProfileID', 'cbc:ID', 'cbc:IssueDate', 'cbc:DueDate', 'cbc:Note',
  'cbc:DocumentCurrencyCode', 'cbc:BuyerReference', 'cac:ContractDocumentReference/cbc:ID',
  ...[SUPPLIER, CUSTOMER].flatMap((p) => [
    `${p}/cbc:EndpointID`, `${p}/cac:PartyIdentification/cbc:ID`, `${p}/cac:PartyName/cbc:Name`,
    `${p}/cac:PostalAddress/cac:Country/cbc:IdentificationCode`, `${p}/cac:PartyTaxScheme/cbc:CompanyID`,
    `${p}/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID`, `${p}/cac:PartyLegalEntity/cbc:RegistrationName`,
    `${p}/cac:PartyLegalEntity/cbc:CompanyID`,
  ]),
  'cac:PaymentMeans/cbc:PaymentMeansCode', 'cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID',
  'cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID',
  'cac:TaxTotal/cbc:TaxAmount', 'cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount', 'cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount',
  'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID', 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent',
  'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason',
  'cac:LegalMonetaryTotal/cbc:LineExtensionAmount', 'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount',
  'cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount', 'cac:LegalMonetaryTotal/cbc:PrepaidAmount',
  'cac:LegalMonetaryTotal/cbc:PayableAmount',
  'cac:InvoiceLine/cbc:ID', 'cac:InvoiceLine/cbc:InvoicedQuantity', 'cac:InvoiceLine/cbc:LineExtensionAmount',
  'cac:InvoiceLine/cac:Item/cbc:Name', 'cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:ID',
  'cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent', 'cac:InvoiceLine/cac:Price/cbc:PriceAmount',
  'cac:InvoiceLine/cac:Price/cbc:BaseQuantity',
];

test('piemēra A dati: XML vērtības un atribūti sakrīt ar examples/e-rekins_A.xml', () => {
  const expected = parseXml(EXAMPLE_XML);
  const actual = parseXml(buildInvoiceXml(exampleAInvoice()));
  assert.deepEqual(actual.attrs, expected.attrs, 'nosaukumvietas');
  for (const path of COMPARED_PATHS) {
    const e = find(expected, path);
    const a = find(actual, path);
    assert.ok(e, `piemērā nav ${path}`);
    assert.ok(a, `ģenerētajā XML nav ${path}`);
    assert.equal(a.text.trim(), e.text.trim(), path);
    assert.deepEqual(a.attrs, e.attrs, `${path} atribūti`);
  }
});

test('piemēra A dati: apzinātās atšķirības no piemēra', () => {
  const expected = parseXml(EXAMPLE_XML);
  const actual = parseXml(buildInvoiceXml(exampleAInvoice()));
  // Piemērā izmantots 80 (debeta paziņojums); parastam rēķinam UNTDID 1001 kods ir 380.
  assert.equal(textAt(expected, 'cbc:InvoiceTypeCode'), '80');
  assert.equal(textAt(actual, 'cbc:InvoiceTypeCode'), '380');
  // Piemērā visa adrese ir vienā rindā (BT-162); ģenerētajā XML — strukturēti lauki (BT-35, BT-37, BT-38).
  assert.equal(textAt(expected, `${SUPPLIER}/cac:PostalAddress/cac:AddressLine/cbc:Line`), 'Stērstu iela 7 - 6, Rīga, LV-1004');
  assert.equal(textAt(actual, `${SUPPLIER}/cac:PostalAddress/cbc:StreetName`), 'Stērstu iela 7 - 6');
  assert.equal(textAt(actual, `${SUPPLIER}/cac:PostalAddress/cbc:CityName`), 'Rīga');
  assert.equal(textAt(actual, `${SUPPLIER}/cac:PostalAddress/cbc:PostalZone`), 'LV-1004');
});

test('elementu secība atbilst piemēram (visiem kopīgajiem elementiem)', () => {
  const expected = parseXml(EXAMPLE_XML);
  const actual = parseXml(buildInvoiceXml(exampleAInvoice()));
  const orders = (root) => {
    const map = new Map();
    walk(root, (node, path) => map.set(path, node.children.map((c) => c.name)));
    return map;
  };
  const expectedOrders = orders(expected);
  for (const [path, children] of orders(actual)) {
    const reference = expectedOrders.get(path);
    if (!reference) continue;
    const common = children.filter((name) => reference.includes(name));
    const referenceCommon = reference.filter((name) => common.includes(name));
    assert.deepEqual([...new Set(common)], [...new Set(referenceCommon)], path);
  }
});

test('nav tukšu elementu (PEPPOL-EN16931-R008) un speciālās rakstzīmes tiek aizstātas', () => {
  const invoice = multiRateInvoice();
  invoice.lines[0].name = 'Produkts "Alfa" & <Beta> \u0007';
  invoice.note = 'A & B < C > D';
  invoice.contractReference = '   ';
  const xml = buildInvoiceXml(invoice);
  assert.ok(xml.includes('Produkts "Alfa" &amp; &lt;Beta&gt;</cbc:Name>'));
  assert.ok(!xml.includes('\u0007'));
  const root = parseXml(xml);
  assert.equal(find(root, 'cac:ContractDocumentReference'), null);
  assert.equal(textAt(root, 'cbc:Note'), 'A & B < C > D');
  walk(root, (node, path) => {
    if (node.children.length === 0) assert.ok(node.text.trim(), `tukšs elements ${path}`);
  });
});

test('kopsummas XML atbilst EN16931 aprēķinu noteikumiem (BR-CO-10, 13, 14, 15, 16, BR-S-08, BR-S-09)', () => {
  const root = parseXml(buildInvoiceXml(multiRateInvoice()));
  const amount = (node, path) => parseDecimal(textAt(node, path));
  const lines = findAll(root, 'cac:InvoiceLine');
  const lineSum = sum(lines.map((l) => amount(l, 'cbc:LineExtensionAmount')));
  const totals = find(root, 'cac:LegalMonetaryTotal');
  assert.equal(cmp(amount(totals, 'cbc:LineExtensionAmount'), lineSum), 0, 'BR-CO-10');
  assert.equal(cmp(amount(totals, 'cbc:TaxExclusiveAmount'), lineSum), 0, 'BR-CO-13');
  const taxTotal = find(root, 'cac:TaxTotal');
  const subtotals = findAll(taxTotal, 'cac:TaxSubtotal');
  assert.equal(cmp(amount(taxTotal, 'cbc:TaxAmount'), sum(subtotals.map((s) => amount(s, 'cbc:TaxAmount')))), 0, 'BR-CO-14');
  assert.equal(cmp(amount(totals, 'cbc:TaxInclusiveAmount'),
    add(amount(totals, 'cbc:TaxExclusiveAmount'), amount(taxTotal, 'cbc:TaxAmount'))), 0, 'BR-CO-15');
  assert.equal(cmp(amount(totals, 'cbc:PayableAmount'),
    sub(amount(totals, 'cbc:TaxInclusiveAmount'), amount(totals, 'cbc:PrepaidAmount'))), 0, 'BR-CO-16');
  for (const subtotal of subtotals) {
    const rate = amount(subtotal, 'cac:TaxCategory/cbc:Percent');
    const matching = lines.filter((l) => textAt(l, 'cac:Item/cac:ClassifiedTaxCategory/cbc:ID') === 'S'
      && cmp(amount(l, 'cac:Item/cac:ClassifiedTaxCategory/cbc:Percent'), rate) === 0);
    assert.equal(cmp(amount(subtotal, 'cbc:TaxableAmount'), sum(matching.map((l) => amount(l, 'cbc:LineExtensionAmount')))), 0, 'BR-S-08');
    assert.equal(cmp(amount(subtotal, 'cbc:TaxAmount'), percentOf(amount(subtotal, 'cbc:TaxableAmount'), rate)), 0, 'BR-S-09');
  }
  for (const l of lines) { // PEPPOL-EN16931-R120 (bāzes daudzums ir 1)
    const expected = round(mul(amount(l, 'cbc:InvoicedQuantity'), amount(l, 'cac:Price/cbc:PriceAmount')), 2);
    assert.equal(cmp(amount(l, 'cbc:LineExtensionAmount'), expected), 0);
  }
  assert.deepEqual(subtotals.map((s) => textAt(s, 'cbc:TaxableAmount')), ['1677.50', '56.70']);
  assert.equal(textAt(totals, 'cbc:PayableAmount'), '1589.32');
});

test('PVN maksātājs: PVN numurs (BT-31), bez nodokļu reģistrācijas koda (BT-32)', () => {
  const root = parseXml(buildInvoiceXml(multiRateInvoice()));
  const schemes = findAll(find(root, SUPPLIER), 'cac:PartyTaxScheme');
  assert.equal(schemes.length, 1);
  assert.equal(textAt(schemes[0], 'cbc:CompanyID'), 'LV40003123453');
  assert.equal(textAt(schemes[0], 'cac:TaxScheme/cbc:ID'), 'VAT');
});

test('nav PVN maksātājs: reģistrācijas numurs kā BT-32 ar nodokļu shēmu, kas nav VAT', () => {
  const root = parseXml(buildInvoiceXml(exampleAInvoice()));
  assert.equal(textAt(root, `${SUPPLIER}/cac:PartyTaxScheme/cac:TaxScheme/cbc:ID`), TAX_REGISTRATION_SCHEME_ID);
  assert.notEqual(TAX_REGISTRATION_SCHEME_ID, 'VAT');
});

test('PVN kategorijas AE, K, G, O: atbrīvojuma kodi, piegādes dati, likme', () => {
  const ae = multiRateInvoice();
  ae.lines = [line('Būvdarbi', '1', 'LS', '5000', 'AE')];
  let root = parseXml(buildInvoiceXml(ae));
  assert.equal(textAt(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode'), 'VATEX-EU-AE');
  assert.equal(textAt(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason'), null);

  const k = multiRateInvoice();
  Object.assign(k, { deliveryDate: '2025-10-10', deliveryCountry: 'EE' });
  k.lines = [line('Kokmateriāli', '12', 'MTQ', '85,50', 'K')];
  k.vatReasons.K = 'Preču piegāde uz citu ES dalībvalsti';
  root = parseXml(buildInvoiceXml(k));
  assert.equal(textAt(root, 'cac:Delivery/cbc:ActualDeliveryDate'), '2025-10-10');
  assert.equal(textAt(root, 'cac:Delivery/cac:DeliveryLocation/cac:Address/cac:Country/cbc:IdentificationCode'), 'EE');
  assert.equal(textAt(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode'), 'VATEX-EU-IC');
  assert.equal(textAt(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason'), 'Preču piegāde uz citu ES dalībvalsti');

  const o = multiRateInvoice();
  o.lines = [line('Biedru nauda', '1', 'ANN', '120', 'O')];
  o.seller.vatNo = '';
  o.buyer.vatNo = '';
  root = parseXml(buildInvoiceXml(o));
  assert.equal(find(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent'), null, 'BR-O-05');
  assert.equal(find(root, 'cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent'), null);
  assert.equal(textAt(root, 'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode'), 'VATEX-EU-O');
  assert.equal(find(root, `${CUSTOMER}/cac:PartyTaxScheme`), null);
});

test('maksājums skaidrā naudā: bez konta rekvizītiem', () => {
  const invoice = exampleAInvoice();
  invoice.payment.meansCode = '10';
  const root = parseXml(buildInvoiceXml(invoice));
  assert.equal(textAt(root, 'cac:PaymentMeans/cbc:PaymentMeansCode'), '10');
  assert.equal(find(root, 'cac:PaymentMeans/cac:PayeeFinancialAccount'), null);
});

test('ārvalstu pircējs ar norādītu e-adresi un bez Latvijas identifikatoru shēmas', () => {
  const invoice = multiRateInvoice();
  Object.assign(invoice.buyer, {
    name: 'UAB "Pirkėjas"', regNo: '300000000', vatNo: 'LT100001234567', country: 'LT', endpointScheme: '9937', endpointId: 'LT100001234567',
  });
  const root = parseXml(buildInvoiceXml(invoice));
  const endpoint = find(root, `${CUSTOMER}/cbc:EndpointID`);
  assert.deepEqual([endpoint.text, endpoint.attrs.schemeID], ['LT100001234567', '9937']);
  assert.equal(find(root, `${CUSTOMER}/cac:PartyIdentification`), null);
  const legal = find(root, `${CUSTOMER}/cac:PartyLegalEntity/cbc:CompanyID`);
  assert.deepEqual([legal.text, legal.attrs], ['300000000', {}]);
});

test('XML netiek ģenerēts, ja datos ir kļūdas', () => {
  const invoice = exampleAInvoice();
  invoice.lines[0].price = '';
  assert.throws(() => buildInvoiceXml(invoice), (err) => err instanceof InvoiceValidationError
    && err.errors.some((e) => e.field === 'lines.0.price'));
});

test('lejupielādes faila nosaukums', () => {
  assert.equal(xmlFileName(exampleAInvoice()), 'e-rekins_LRC171-25.xml');
  assert.equal(xmlFileName({ invoiceNumber: 'TB-2025/0417 ā' }), 'e-rekins_TB-2025_0417.xml');
  assert.equal(xmlFileName({ invoiceNumber: '' }), 'e-rekins_bez-numura.xml');
});
