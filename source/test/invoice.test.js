import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlainString } from '../public/js/decimal.js';
import {
  calculate, emptyLine, invoiceFromExtraction, vatOptionValue, applyVatOption, effectiveEndpoint,
  sellerTaxRegistrationId, usedVatCategories,
} from '../public/js/invoice.js';
import { exampleAInvoice, multiRateInvoice, line, EXTRACTED_A } from './helpers/fixtures.js';

const money = (value) => toPlainString(value, 2);

test('calculate: rindas, PVN sadalījums un kopsummas rēķinam ar vairākām likmēm', () => {
  const calc = calculate(multiRateInvoice());
  assert.deepEqual(calc.lines.map((l) => money(l.amount)), ['562.50', '56.70', '1200.00', '-100.00', '15.00']);
  assert.deepEqual(calc.breakdown.map((g) => [g.category, toPlainString(g.rate), money(g.taxable), money(g.tax)]), [
    ['S', '21', '1677.50', '352.28'],
    ['S', '5', '56.70', '2.84'],
  ]);
  assert.equal(money(calc.lineTotal), '1734.20');
  assert.equal(money(calc.taxExclusive), '1734.20');
  assert.equal(money(calc.taxTotal), '355.12');
  assert.equal(money(calc.taxInclusive), '2089.32');
  assert.equal(money(calc.prepaid), '500.00');
  assert.equal(money(calc.payable), '1589.32');
  assert.equal(calc.complete, true);
});

test('calculate: rindas summu noapaļo līdz centiem, cenā var būt vairāk zīmju', () => {
  const invoice = multiRateInvoice();
  invoice.lines = [line('Elektroenerģija', '1234,567', 'KWH', '0,12345', 'S', '21')];
  const calc = calculate(invoice);
  assert.equal(money(calc.lines[0].amount), '152.41');
  assert.equal(money(calc.taxTotal), '32.01');
});

test('calculate: nepilnīgas rindas netiek ieskaitītas, un rezultāts ir atzīmēts kā nepilnīgs', () => {
  const invoice = multiRateInvoice();
  invoice.lines[1].price = '';
  const calc = calculate(invoice);
  assert.equal(calc.lines[1].amount, null);
  assert.equal(calc.complete, false);
  assert.equal(money(calc.lineTotal), '1677.50');
});

test('calculate: kategorijas bez likmes (O) un ar nulles likmi grupē atsevišķi', () => {
  const invoice = exampleAInvoice();
  invoice.lines.push(line('Pārvadājums', '2', 'H87', '10', 'Z'));
  const calc = calculate(invoice);
  assert.deepEqual(calc.breakdown.map((g) => [g.category, g.rate && toPlainString(g.rate), money(g.taxable), money(g.tax)]), [
    ['Z', '0', '20.00', '0.00'],
    ['E', '0', '600.00', '0.00'],
  ]);
  invoice.lines = [line('Biedru nauda', '1', 'ANN', '120', 'O')];
  assert.equal(calculate(invoice).breakdown[0].rate, null);
});

test('effectiveEndpoint: Latvijas uzņēmumam no reģistrācijas numura (0218), citādi — norādītā adrese', () => {
  const invoice = exampleAInvoice();
  assert.deepEqual(effectiveEndpoint(invoice.seller), { scheme: '0218', id: '40103512178', derived: true });
  assert.deepEqual(effectiveEndpoint({ ...invoice.buyer, endpointScheme: '9939', endpointId: 'lv 40103632832' }),
    { scheme: '9939', id: 'LV40103632832', derived: false });
  assert.equal(effectiveEndpoint({ ...invoice.buyer, country: 'LT' }), null);
  assert.equal(effectiveEndpoint({ ...invoice.buyer, regNo: '123' }), null);
});

test('sellerTaxRegistrationId: reģistrācijas numurs kā BT-32 tikai, ja nav PVN numura', () => {
  const invoice = exampleAInvoice();
  assert.equal(sellerTaxRegistrationId(invoice.seller), '40103512178');
  assert.equal(sellerTaxRegistrationId({ ...invoice.seller, vatNo: 'LV40103512178' }), null);
  assert.equal(sellerTaxRegistrationId({ ...invoice.seller, country: 'EE' }), null);
});

test('PVN izvēle: priekšiestatītās likmes un "Cita likme…"', () => {
  const l = emptyLine();
  assert.equal(vatOptionValue(l), 'S:21');
  applyVatOption(l, 'S:12');
  assert.deepEqual([l.vatCategory, l.vatRate, vatOptionValue(l)], ['S', '12', 'S:12']);
  applyVatOption(l, 'S:citi');
  assert.deepEqual([l.vatCategory, l.vatRate, vatOptionValue(l)], ['S', '', 'S:citi']);
  l.vatRate = '21'; // lietotājs ievada likmi, kas sakrīt ar priekšiestatījumu — lauks nedrīkst pazust
  assert.equal(vatOptionValue(l), 'S:citi');
  applyVatOption(l, 'S:citi'); // atkārtots notikums nemaina ievadīto likmi
  assert.equal(l.vatRate, '21');
  applyVatOption(l, 'E');
  assert.deepEqual([l.vatCategory, l.vatRate, vatOptionValue(l)], ['E', '0', 'E']);
  applyVatOption(l, 'O');
  assert.deepEqual([l.vatCategory, l.vatRate], ['O', '']);
  applyVatOption(l, '');
  assert.equal(vatOptionValue(l), '');
});

test('invoiceFromExtraction: OpenAI rezultāts tiek pārnests formas laukos', () => {
  const invoice = invoiceFromExtraction(EXTRACTED_A, 'e-rekins_A.pdf');
  assert.equal(invoice.invoiceNumber, 'LRC171-25');
  assert.equal(invoice.issueDate, '2025-09-30');
  assert.equal(invoice.typeCode, '380');
  assert.equal(invoice.currency, 'EUR');
  assert.equal(invoice.seller.regNo, '40103512178');
  assert.equal(invoice.seller.vatNo, '');
  assert.equal(invoice.seller.country, 'LV');
  assert.equal(invoice.payment.meansCode, '30');
  assert.equal(invoice.payment.iban, 'LV64UNLA0050018532131');
  assert.equal(invoice.lines.length, 1);
  assert.deepEqual(
    [invoice.lines[0].name, invoice.lines[0].quantity, invoice.lines[0].unitCode, invoice.lines[0].price, invoice.lines[0].vatCategory],
    ['Programmēšanas pakalpojumi', '1', 'H87', '600,00', 'E'],
  );
  assert.equal(invoice.lines[0].sourceAmount, '600,00');
  assert.equal(invoice.vatReasons.E, 'Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs');
  assert.equal(invoice.prepaidAmount, '');
  assert.deepEqual(invoice.source, {
    fileName: 'e-rekins_A.pdf',
    documentType: 'invoice',
    totals: { totalWithoutVat: '600,00', totalVat: '0,00', totalWithVat: '600,00', amountDue: '600,00' },
  });
});

test('invoiceFromExtraction: nederīgas vai trūkstošas vērtības netiek pieņemtas kā pareizas', () => {
  const invoice = invoiceFromExtraction({
    documentType: 'prepayment_invoice', issueDate: '30.09.2025', dueDate: '2025-02-30', currency: 'EURO',
    seller: { name: '  SIA X ', vatNumber: 'lv 4000 3123 453', countryCode: 'Latvia' },
    buyer: null,
    payment: { method: 'cash', iban: null, bic: null },
    lines: [
      { name: 'A', quantity: 2, unitCode: 'KG', unitPrice: 1.5, vatCategory: 'S', vatRate: 25, lineAmount: 3 },
      { name: 'B', quantity: null, unitCode: null, unitPrice: null, vatCategory: 'X', vatRate: null, lineAmount: null },
    ],
    vatExemptionReason: null,
    totals: { totalWithoutVat: null, totalVat: null, totalWithVat: null, prepaidAmount: 10, amountDue: null },
  });
  assert.equal(invoice.typeCode, '386');
  assert.equal(invoice.issueDate, '');
  assert.equal(invoice.dueDate, '', 'neeksistējošs datums');
  assert.equal(invoice.currency, '', 'nederīgs valūtas kods');
  assert.equal(invoice.seller.name, 'SIA X');
  assert.equal(invoice.seller.vatNo, 'LV40003123453');
  assert.equal(invoice.seller.country, '');
  assert.equal(invoice.buyer.name, '');
  assert.equal(invoice.payment.meansCode, '10');
  assert.equal(invoice.lines[0].unitCode, '', 'mērvienība ārpus atbalstītā saraksta');
  assert.equal(invoice.lines[0].vatRate, '25');
  assert.equal(vatOptionValue(invoice.lines[0]), 'S:citi');
  assert.equal(invoice.lines[1].quantity, '');
  assert.equal(invoice.lines[1].vatCategory, '');
  assert.equal(invoice.lines[1].sourceAmount, null);
  assert.equal(invoice.prepaidAmount, '10,00');
  assert.deepEqual(usedVatCategories(invoice), ['S']);
});

test('invoiceFromExtraction: ja valūta nav norādīta, izmanto EUR', () => {
  assert.equal(invoiceFromExtraction({ currency: null, lines: [] }).currency, 'EUR');
});
