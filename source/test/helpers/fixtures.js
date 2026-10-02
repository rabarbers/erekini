// Testa rēķinu dati.

import { emptyInvoice, emptyLine } from '../../public/js/invoice.js';

export function line(name, quantity, unitCode, price, vatCategory, vatRate = '0') {
  return Object.assign(emptyLine(), { name, quantity, unitCode, price, vatCategory, vatRate });
}

// examples/e-rekins_A.pdf dati, ievadīti tā, kā to darītu lietotājs.
export function exampleAInvoice() {
  const invoice = emptyInvoice();
  Object.assign(invoice, {
    invoiceNumber: 'LRC171-25',
    issueDate: '2025-09-30',
    dueDate: '2025-09-30',
    buyerReference: 'Robotiem',
    contractReference: 'LĪGUMS Nr. 6-9-15.09.2025.-1',
    note: 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta.',
  });
  Object.assign(invoice.seller, {
    name: 'Sabiedrība ar ierobežotu atbildību "Logics Research Centre"', regNo: '40103512178',
    street: 'Stērstu iela 7 - 6', city: 'Rīga', postalCode: 'LV-1004', country: 'LV',
  });
  Object.assign(invoice.buyer, {
    name: 'SIA "Robotiem"', regNo: '40103632832', vatNo: 'LV40103632832',
    street: 'Kārļa Skalbes iela 8 - 1', city: 'Valka, Valkas nov.', postalCode: 'LV-4701', country: 'LV',
  });
  Object.assign(invoice.payment, { meansCode: '30', iban: 'LV64UNLA0050018532131', bic: 'UNLALV2X' });
  invoice.lines = [line('Programmēšanas pakalpojumi', '1,00', 'H87', '600,00', 'E')];
  invoice.vatReasons.E = 'Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs';
  return invoice;
}

// PVN maksātāja rēķins ar vairākām likmēm, atlaidi un avansu.
export function multiRateInvoice() {
  const invoice = emptyInvoice();
  Object.assign(invoice, {
    invoiceNumber: 'TB-2025/0417', issueDate: '2025-10-15', dueDate: '2025-10-29', orderReference: 'PO-2025-117',
    paymentTerms: 'Apmaksa 14 dienu laikā', prepaidAmount: '500,00',
  });
  Object.assign(invoice.seller, {
    name: 'SIA "Testa Būve"', regNo: '40003123453', vatNo: 'LV40003123453',
    street: 'Brīvības iela 101 - 12', city: 'Rīga', postalCode: 'LV-1001', country: 'LV',
  });
  Object.assign(invoice.buyer, {
    name: 'SIA "Paraugs un Partneri"', regNo: '40103555552', vatNo: 'LV40103555552',
    street: 'Rīgas iela 5', city: 'Jelgava', postalCode: 'LV-3001', country: 'LV',
  });
  Object.assign(invoice.payment, { meansCode: '30', iban: 'LV80BANK0000435195001', bic: 'HABALV22' });
  invoice.lines = [
    line('Konsultācijas par e-rēķiniem', '12,5', 'HUR', '45,00', 'S', '21'),
    line('Grāmata "E-rēķini praksē"', '3', 'H87', '18,90', 'S', '5'),
    line('Programmatūras licence (12 mēneši)', '1', 'SET', '1200,00', 'S', '21'),
    line('Atlaide lojālam klientam', '-1', 'H87', '100,00', 'S', '21'),
    line('Piegāde', '1', 'H87', '15,00', 'S', '21'),
  ];
  return invoice;
}

// OpenAI strukturētā atbilde par examples/e-rekins_A.pdf (iegūta ar gpt-5.5).
export const EXTRACTED_A = {
  documentType: 'invoice', invoiceNumber: 'LRC171-25', issueDate: '2025-09-30', dueDate: '2025-09-30', deliveryDate: null,
  currency: 'EUR', buyerReference: 'Robotiem', orderReference: null, contractReference: 'LĪGUMS Nr. 6-9-15.09.2025.-1',
  paymentTerms: null, note: 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta.',
  seller: {
    name: 'Sabiedrība ar ierobežotu atbildību "Logics Research Centre"', registrationNumber: '40103512178', vatNumber: null,
    street: 'Stērstu iela 7 - 6', city: 'Rīga', postalCode: 'LV-1004', countryCode: 'LV',
  },
  buyer: {
    name: 'SIA "Robotiem"', registrationNumber: '40103632832', vatNumber: null,
    street: 'Kārļa Skalbes iela 8 - 1', city: 'Valka, Valkas nov.', postalCode: 'LV-4701', countryCode: 'LV',
  },
  payment: { method: 'bank_transfer', iban: 'LV64UNLA0050018532131', bic: 'UNLALV2X' },
  lines: [{ name: 'Programmēšanas pakalpojumi', quantity: 1, unitCode: 'H87', unitPrice: 600, vatCategory: 'E', vatRate: 0, lineAmount: 600 }],
  vatExemptionReason: 'Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs',
  totals: { totalWithoutVat: 600, totalVat: 0, totalWithVat: 600, prepaidAmount: 0, amountDue: 600 },
};
