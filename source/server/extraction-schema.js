// OpenAI strukturētās izvades shēma un norādījumi rēķina datu iegūšanai.
// Shēmas lauki atbilst funkcijai invoiceFromExtraction() failā public/js/invoice.js.

import { UNITS, VAT_CATEGORY_ORDER } from '../public/js/codelists.js';

const nullableString = (description) => ({ type: ['string', 'null'], description });
const nullableNumber = (description) => ({ type: ['number', 'null'], description });

function object(properties) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const party = object({
  name: nullableString('Full legal name exactly as written.'),
  registrationNumber: nullableString('Company registration number or personal code (Latvian: reģistrācijas nr., vienotais reģ. nr.).'),
  vatNumber: nullableString('VAT payer number with country prefix and without spaces, e.g. LV40003012345. Null if the party is not a VAT payer.'),
  street: nullableString('Street, house and apartment/office, e.g. "Brīvības iela 1 - 2".'),
  city: nullableString('City, town or village; append the municipality (novads) after a comma if it is given separately.'),
  postalCode: nullableString('Postal code, e.g. LV-1004.'),
  countryCode: nullableString('ISO 3166-1 alpha-2 country code, e.g. LV.'),
});

export const EXTRACTION_SCHEMA = object({
  documentType: {
    type: 'string',
    enum: ['invoice', 'prepayment_invoice', 'credit_note', 'other'],
    description: 'invoice = rēķins; prepayment_invoice = avansa/priekšapmaksas rēķins; credit_note = kredītrēķins; other = not an invoice.',
  },
  invoiceNumber: nullableString('Invoice number, e.g. "LRC171-25" (without the "Nr." prefix).'),
  issueDate: nullableString('Invoice date in YYYY-MM-DD format.'),
  dueDate: nullableString('Payment due date (samaksāt līdz, apmaksas termiņš) in YYYY-MM-DD format.'),
  deliveryDate: nullableString('Actual delivery date (piegādes datums) in YYYY-MM-DD format, only if explicitly stated.'),
  currency: nullableString('ISO 4217 currency code, e.g. EUR.'),
  buyerReference: nullableString('Buyer reference (pircēja atsauce), if printed.'),
  orderReference: nullableString('Purchase order number (pasūtījuma nr.), if printed.'),
  contractReference: nullableString('Contract number (līguma nr.) exactly as written, if printed.'),
  paymentTerms: nullableString('Payment terms text, e.g. "Apmaksa 14 dienu laikā", if printed. Do not repeat the due date.'),
  note: nullableString('General invoice note or additional information (papildinformācija), if printed.'),
  seller: party,
  buyer: party,
  payment: object({
    method: {
      type: ['string', 'null'],
      enum: ['bank_transfer', 'cash', 'card', null],
      description: 'bank_transfer if a bank account is given for payment; cash or card only if explicitly stated.',
    },
    iban: nullableString('Seller bank account (IBAN) without spaces. If several accounts are listed, use the first one.'),
    bic: nullableString('Bank SWIFT/BIC code of that account (bankas kods), without spaces.'),
  }),
  lines: {
    type: 'array',
    description: 'Invoice lines in document order.',
    items: object({
      name: nullableString('Item or service name without the line number.'),
      quantity: nullableNumber('Invoiced quantity.'),
      unitCode: {
        type: ['string', 'null'],
        enum: [...UNITS.map((u) => u.code), null],
        description: 'Unit of measure code, see instructions. Null if no unit is stated.',
      },
      unitPrice: nullableNumber('Net unit price excluding VAT.'),
      vatCategory: {
        type: ['string', 'null'],
        enum: [...VAT_CATEGORY_ORDER, null],
        description: 'VAT category code, see instructions.',
      },
      vatRate: nullableNumber('VAT rate in percent (21 for 21%). 0 for Z, E, AE, K, G; null for O.'),
      lineAmount: nullableNumber('Net line total excluding VAT exactly as printed.'),
    }),
  },
  vatExemptionReason: nullableString('VAT exemption or reverse charge justification text as written, e.g. "Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs".'),
  totals: object({
    totalWithoutVat: nullableNumber('Total amount excluding VAT (summa bez PVN) as printed.'),
    totalVat: nullableNumber('Total VAT amount (PVN summa) only if printed as one amount; null if VAT is printed only per rate.'),
    totalWithVat: nullableNumber('Total amount including VAT (kopā ar PVN) as printed.'),
    prepaidAmount: nullableNumber('Amount paid in advance (avansā samaksāts) as printed.'),
    amountDue: nullableNumber('Amount due for payment (summa apmaksai) as printed.'),
  }),
});

const UNIT_HINTS = [
  'H87 = gab., gb., gabals, pcs, piece',
  'C62 = vien., vienība, unit',
  'E48 = pakalpojums as a unit (service unit)',
  'LS = vienreizējs maksājums, lump sum',
  'SET = kompl., komplekts, set',
  'PR = pāris, pair',
  'XPK = iep., iepakojums, package',
  'HUR = h, st., stunda, hour',
  'MIN = min, minūte',
  'DAY = d., diena, day',
  'WEE = ned., nedēļa, week',
  'MON = mēn., mēnesis, month',
  'ANN = gads (time unit), year',
  'KGM = kg',
  'GRM = g, grams',
  'TNE = t, tonna',
  'MTR = m, metrs',
  'KMT = km',
  'MTK = m2, m²',
  'MTQ = m3, m³',
  'LTR = l, litrs',
  'KWH = kWh',
].join('\n');

export const EXTRACTION_INSTRUCTIONS = `You extract structured data from an invoice document (PDF, scanned image or Word document)
so that an EN 16931 / Peppol BIS Billing 3.0 e-invoice can be prepared. Documents are usually in Latvian.

General rules:
- Return only values that are present in the document. Use null when a value is missing or unreadable.
  Never invent, guess or translate values. Copy texts as written (only join words broken by line wraps).
- Seller = the party that issues the invoice (piegādātājs, pārdevējs, izpildītājs).
  Buyer = the party that receives the invoice (pircējs, pasūtītājs, saņēmējs, maksātājs).
- Dates: output YYYY-MM-DD. Latvian documents usually write dates as DD.MM.YYYY.
- Numbers: output JSON numbers with a dot as decimal separator and without thousands separators
  (Latvian "1 234,56" becomes 1234.56).
- Registration numbers: digits only for Latvian numbers. VAT numbers: with country prefix, no spaces.
- Addresses: split into street, city, postal code and country code (Latvian addresses: LV).

Invoice lines:
- One entry per invoice line, in document order. Do not include subtotal or total rows as lines.
- unitPrice is the net price per unit excluding VAT. If the document shows only prices including VAT,
  compute the net price as gross price / (1 + VAT rate / 100).
- lineAmount is the net line total excluding VAT exactly as printed.
- A discount printed as a separate line is a line with a negative quantity and a positive unit price.
- unitCode mapping (choose the closest; null if no unit is given):
${UNIT_HINTS}

VAT category per line (vatCategory):
- S: VAT is charged with a positive rate (Latvia: 21%, 12%, 5%). Set vatRate.
- Z: zero rate (0%, nulles likme) for a taxable supply.
- E: exempt from VAT, including when the seller states it is not a VAT payer
  (e.g. "nav PVN maksātājs", "atbrīvots no PVN", "PVN netiek piemērots").
- AE: reverse charge ("apgrieztā maksāšana", "nodokļa apgrieztā maksāšana", "reverse charge").
- K: intra-community supply of goods to another EU member state (0%).
- G: export of goods outside the EU (0%).
- O: services outside the scope of VAT / not subject to VAT.
Put the VAT exemption or reverse charge justification text into vatExemptionReason.

Totals: copy the totals exactly as printed; never calculate them yourself. They are used only to check
the extracted lines. Read every digit of amounts carefully.`;
