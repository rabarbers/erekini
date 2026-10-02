// Rēķina datu modelis, aprēķini un OpenAI iegūto datu pārnešana formas datos.
// Visas formas vērtības glabā kā tekstu; skaitļus parsē tikai aprēķinos un validācijā.

import { parseDecimal, add, sub, mul, round, percentOf, sum, cmp, ZERO, toPlainString, toInputString } from './decimal.js';
import {
  VAT_CATEGORIES, VAT_CATEGORY_ORDER, VAT_OPTIONS, UNITS, LV_REGISTRATION_SCHEME,
  COUNTRY_CODES, CURRENCY_CODES,
} from './codelists.js';

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `l${keyCounter}`;
}

export function emptyParty() {
  return {
    name: '', regNo: '', vatNo: '',
    street: '', city: '', postalCode: '', country: 'LV',
    endpointScheme: '', endpointId: '',
  };
}

export function emptyLine() {
  return {
    key: newKey(), name: '', quantity: '1', unitCode: 'H87', price: '',
    vatCategory: 'S', vatRate: '21',
    customRate: false, // lietotājs izvēlējies "Cita likme…" un likmi ievada pats
    sourceAmount: null, // rindas summa augšupielādētajā dokumentā (tikai salīdzināšanai)
  };
}

export function emptyInvoice() {
  return {
    invoiceNumber: '', issueDate: '', dueDate: '', typeCode: '380', currency: 'EUR',
    buyerReference: '', orderReference: '', contractReference: '',
    paymentTerms: '', note: '', deliveryDate: '', deliveryCountry: '',
    seller: emptyParty(),
    buyer: emptyParty(),
    payment: { meansCode: '30', iban: '', bic: '' },
    lines: [emptyLine()],
    vatReasons: { E: '', AE: '', K: '', G: '', O: '' },
    prepaidAmount: '',
    source: null, // augšupielādētā dokumenta atsauces dati: { fileName, documentType, totals }
  };
}

export function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Datums formātā GGGG-MM-DD, kas eksistē kalendārā (piem., 2025-02-30 nav derīgs).
export function isValidDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// Identifikatoros atstarpes nav nozīmīgas (piem., "LV 4010 3512 178").
export function compactId(value) {
  return clean(value).replace(/\s+/g, '').toUpperCase();
}

// ---------- Aprēķini ----------

// PVN likme pozīcijai: S — ievadītā likme, citām kategorijām 0, kategorijai O — nav likmes.
export function lineVatRate(line) {
  const category = VAT_CATEGORIES[line.vatCategory];
  if (!category || category.rate === 'none') return null;
  if (category.rate === 'zero') return ZERO;
  return parseDecimal(line.vatRate);
}

// Pozīcijas summa bez PVN = daudzums × cena, noapaļota līdz centiem (PEPPOL-EN16931-R120, BR-DEC-23).
export function lineAmount(line) {
  const quantity = parseDecimal(line.quantity);
  const price = parseDecimal(line.price);
  if (!quantity || !price) return null;
  return round(mul(quantity, price), 2);
}

function categoryOrder(code) {
  return VAT_CATEGORY_ORDER.indexOf(code);
}

// Aprēķina pozīciju summas, PVN sadalījumu (BG-23) un kopsummas (BG-22).
export function calculate(invoice) {
  const lines = invoice.lines.map((line) => ({ amount: lineAmount(line) }));
  const groups = new Map();
  invoice.lines.forEach((line, i) => {
    const amount = lines[i].amount;
    const category = VAT_CATEGORIES[line.vatCategory];
    if (!amount || !category) return;
    const rate = lineVatRate(line);
    if (category.rate === 'positive' && (!rate || rate.n <= 0n)) return;
    const key = `${line.vatCategory}:${rate ? toPlainString(rate) : ''}`;
    const group = groups.get(key) ?? { category: line.vatCategory, rate, taxable: ZERO };
    group.taxable = add(group.taxable, amount);
    groups.set(key, group);
  });

  const breakdown = [...groups.values()]
    .map((g) => ({
      category: g.category,
      rate: g.rate,
      taxable: round(g.taxable, 2),
      tax: g.category === 'S' ? percentOf(g.taxable, g.rate) : round(ZERO, 2),
    }))
    .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category)
      || (a.rate && b.rate ? cmp(b.rate, a.rate) : 0));

  const lineTotal = round(sum(lines.filter((l) => l.amount).map((l) => l.amount)), 2);
  const taxTotal = round(sum(breakdown.map((g) => g.tax)), 2);
  const taxInclusive = add(lineTotal, taxTotal);
  const prepaidParsed = clean(invoice.prepaidAmount) ? parseDecimal(invoice.prepaidAmount) : ZERO;
  const prepaid = round(prepaidParsed ?? ZERO, 2);

  return {
    lines,
    breakdown,
    lineTotal,
    taxExclusive: lineTotal, // v1 neatbalsta dokumenta līmeņa atlaides un uzcenojumus
    taxTotal,
    taxInclusive,
    prepaid,
    payable: round(sub(taxInclusive, prepaid), 2),
    complete: lines.length > 0 && lines.every((l) => l.amount !== null),
  };
}

// ---------- Identifikatori ----------

export function isLvRegNo(value) {
  return /^\d{11}$/.test(value);
}

// E-rēķina adrese (BT-34/BT-49). Ja nav norādīta, Latvijas uzņēmumiem to veido no reģistrācijas
// numura ar shēmu 0218, kā piemērā examples/e-rekins_A.xml.
export function effectiveEndpoint(party) {
  const scheme = clean(party.endpointScheme);
  const id = compactId(party.endpointId);
  if (scheme || id) return { scheme, id, derived: false };
  const regNo = compactId(party.regNo);
  if (party.country === 'LV' && isLvRegNo(regNo)) {
    return { scheme: LV_REGISTRATION_SCHEME, id: regNo, derived: true };
  }
  return null;
}

// Pārdevēja nodokļu maksātāja reģistrācijas kods (BT-32). Latvijā tas sakrīt ar uzņēmuma
// reģistrācijas numuru; izmanto tikai tad, ja pārdevējam nav PVN numura (kā piemērā).
export function sellerTaxRegistrationId(seller) {
  if (compactId(seller.vatNo)) return null;
  const regNo = compactId(seller.regNo);
  return seller.country === 'LV' && isLvRegNo(regNo) ? regNo : null;
}

export function usedVatCategories(invoice) {
  const used = new Set(invoice.lines.map((l) => l.vatCategory).filter((c) => VAT_CATEGORIES[c]));
  return VAT_CATEGORY_ORDER.filter((c) => used.has(c));
}

// Pozīcijas PVN izvēles vērtība tabulas izvēlnei (skat. VAT_OPTIONS).
export function vatOptionValue(line) {
  if (line.vatCategory !== 'S') return VAT_CATEGORIES[line.vatCategory] ? line.vatCategory : '';
  if (line.customRate) return 'S:citi';
  const rate = parseDecimal(line.vatRate);
  const preset = VAT_OPTIONS.find((o) => o.category === 'S' && o.rate && rate
    && cmp(parseDecimal(o.rate), rate) === 0);
  return preset ? preset.value : 'S:citi';
}

export function applyVatOption(line, value) {
  const option = VAT_OPTIONS.find((o) => o.value === value);
  const hadCustomRate = line.vatCategory === 'S' && vatOptionValue(line) === 'S:citi';
  line.customRate = value === 'S:citi';
  if (!option) {
    line.vatCategory = '';
    line.vatRate = '';
    return;
  }
  line.vatCategory = option.category;
  if (option.rate !== null) line.vatRate = option.rate;
  else if (option.category === 'S') line.vatRate = hadCustomRate ? line.vatRate : ''; // "Cita likme…"
  else line.vatRate = '';
}

// ---------- OpenAI iegūto datu pārnešana ----------

const UNIT_CODES = new Set(UNITS.map((u) => u.code));
const DOCUMENT_TYPES = { invoice: '380', prepayment_invoice: '386' };
const PAYMENT_METHODS = { bank_transfer: '30', cash: '10', card: '48' };

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberText(value, minScale = 0) {
  const d = typeof value === 'number' || typeof value === 'string' ? parseDecimal(value) : null;
  return d ? toInputString(d, minScale) : '';
}

function isoDate(value) {
  const v = text(value);
  return isValidDate(v) ? v : '';
}

function code(value, allowed) {
  const v = text(value).toUpperCase();
  return allowed.includes(v) ? v : '';
}

function partyFromExtraction(p = {}) {
  return {
    ...emptyParty(),
    name: text(p?.name),
    regNo: compactId(p?.registrationNumber),
    vatNo: compactId(p?.vatNumber),
    street: text(p?.street),
    city: text(p?.city),
    postalCode: text(p?.postalCode),
    country: code(p?.countryCode, COUNTRY_CODES),
  };
}

// Pārveido OpenAI strukturēto atbildi formas datos. Tie ir tikai sākotnējie dati —
// to pareizību vienmēr pārbauda validateInvoice().
export function invoiceFromExtraction(data, fileName = '') {
  const invoice = emptyInvoice();
  const d = data && typeof data === 'object' ? data : {};

  invoice.invoiceNumber = text(d.invoiceNumber);
  invoice.issueDate = isoDate(d.issueDate);
  invoice.dueDate = isoDate(d.dueDate);
  invoice.deliveryDate = isoDate(d.deliveryDate);
  invoice.typeCode = DOCUMENT_TYPES[d.documentType] ?? '380';
  invoice.currency = code(d.currency, CURRENCY_CODES) || (d.currency ? '' : 'EUR');
  invoice.buyerReference = text(d.buyerReference);
  invoice.orderReference = text(d.orderReference);
  invoice.contractReference = text(d.contractReference);
  invoice.paymentTerms = text(d.paymentTerms);
  invoice.note = text(d.note);
  invoice.seller = partyFromExtraction(d.seller);
  invoice.buyer = partyFromExtraction(d.buyer);

  const payment = d.payment ?? {};
  invoice.payment = {
    meansCode: PAYMENT_METHODS[payment.method] ?? '30',
    iban: compactId(payment.iban),
    bic: compactId(payment.bic),
  };

  invoice.lines = (Array.isArray(d.lines) ? d.lines : []).map((l) => {
    const line = emptyLine();
    line.name = text(l?.name);
    line.quantity = numberText(l?.quantity);
    line.unitCode = UNIT_CODES.has(l?.unitCode) ? l.unitCode : '';
    line.price = numberText(l?.unitPrice, 2);
    line.vatCategory = VAT_CATEGORIES[l?.vatCategory] ? l.vatCategory : '';
    line.vatRate = line.vatCategory === 'S' ? numberText(l?.vatRate) : '';
    if (line.vatCategory && line.vatCategory !== 'S' && line.vatCategory !== 'O') line.vatRate = '0';
    line.customRate = line.vatCategory === 'S' && vatOptionValue(line) === 'S:citi';
    line.sourceAmount = numberText(l?.lineAmount, 2) || null;
    return line;
  });

  const reason = text(d.vatExemptionReason);
  if (reason) {
    for (const c of usedVatCategories(invoice)) {
      if (VAT_CATEGORIES[c].exemption === 'required') invoice.vatReasons[c] = reason;
    }
  }

  const totals = d.totals ?? {};
  const prepaid = parseDecimal(totals.prepaidAmount ?? '');
  invoice.prepaidAmount = prepaid && prepaid.n !== 0n ? toInputString(prepaid, 2) : '';
  invoice.source = {
    fileName,
    documentType: typeof d.documentType === 'string' ? d.documentType : 'invoice',
    totals: {
      totalWithoutVat: numberText(totals.totalWithoutVat, 2) || null,
      totalVat: numberText(totals.totalVat, 2) || null,
      totalWithVat: numberText(totals.totalWithVat, 2) || null,
      amountDue: numberText(totals.amountDue, 2) || null,
    },
  };
  return invoice;
}
