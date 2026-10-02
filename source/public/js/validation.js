// Determinēta e-rēķina datu validācija (EN16931 + Peppol BIS Billing 3.0 noteikumi, kas attiecas uz
// šajā versijā atbalstītajiem laukiem). OpenAI rezultāts netiek uzskatīts par pārbaudītu — pārbaude
// vienmēr notiek šeit.
//
// Rezultāts: { errors, warnings, calc }. Kļūdas bloķē XML ģenerēšanu, brīdinājumi — nē.
// Katrs ieraksts: { field, message, rule?, alsoFields? }, kur field ir formas lauka ceļš, piem.
// "seller.name" vai "lines.2.price".

import { parseDecimal, cmp, significantScale, toDisplayString } from './decimal.js';
import {
  COUNTRY_CODES, CURRENCY_CODES, VAT_PREFIXES, INVOICE_TYPES, UNITS, PAYMENT_MEANS,
  ENDPOINT_SCHEMES, VAT_CATEGORIES,
} from './codelists.js';
import {
  calculate, clean, compactId, effectiveEndpoint, sellerTaxRegistrationId, usedVatCategories, isLvRegNo, isValidDate,
} from './invoice.js';

const UNIT_CODES = new Set(UNITS.map((u) => u.code));
const SCHEME_CODES = new Set(ENDPOINT_SCHEMES.map((s) => s.code));

// ---------- Identifikatoru pārbaudes ----------

export { isValidDate };

// Latvijas juridiskās personas reģistrācijas numura kontrolcipars (svari 9,1,4,8,3,10,2,5,7,6,1; summa mod 11 = 3).
// Fizisko personu kodiem (sākas ar 0–3) kontrolciparu nepārbauda.
export function lvRegNoChecksumOk(regNo) {
  if (!isLvRegNo(regNo) || regNo[0] <= '3') return true;
  const weights = [9, 1, 4, 8, 3, 10, 2, 5, 7, 6, 1];
  const total = weights.reduce((acc, w, i) => acc + w * Number(regNo[i]), 0);
  return total % 11 === 3;
}

export function isValidIban(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('LV') && iban.length !== 21) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function isValidBic(bic) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}

function glnOk(value) { // PEPPOL-COMMON-R040
  if (!/^\d+$/.test(value) || value.length < 2) return false;
  const digits = value.slice(0, -1).split('').reverse().map(Number);
  const total = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === Number(value.at(-1));
}

function mod11Ok(value) { // PEPPOL-COMMON-R041
  if (!/^\d{9}$/.test(value) || Number(value) === 0) return false;
  const digits = value.slice(0, -1).split('').reverse().map(Number);
  const total = digits.reduce((acc, d, i) => acc + d * ((i % 6) + 2), 0);
  return (11 - (total % 11)) % 11 === Number(value.at(-1));
}

function beEnterpriseOk(value) { // PEPPOL-COMMON-R043
  return /^\d{10}$/.test(value) && 97 - (Number(value.slice(0, 8)) % 97) === Number(value.slice(8));
}

function seOrgNoOk(value) { // PEPPOL-COMMON-R049
  if (!/^\d{10}$/.test(value)) return false;
  const main = value.slice(0, 9).split('').reverse().map(Number);
  const total = main.reduce((acc, d, i) => acc + (i % 2 === 0 ? ((d * 2) % 10) + Math.floor((d * 2) / 10) : d), 0);
  return (10 - (total % 10)) % 10 === Number(value[9]);
}

const ENDPOINT_FORMATS = {
  '0218': { test: isLvRegNo, message: 'Latvijas reģistrācijas numuram jābūt 11 cipariem.' },
  '0088': { test: glnOk, message: 'GLN numurs nav derīgs — pārbaudiet ciparus.', rule: 'PEPPOL-COMMON-R040' },
  '0192': { test: mod11Ok, message: 'Norvēģijas organizācijas numurs nav derīgs.', rule: 'PEPPOL-COMMON-R041' },
  '0184': {
    test: (v) => /^DK\d{8}$/.test(v) || /^\d{8}$/.test(v),
    message: 'Dānijas CVR numuram jābūt 8 cipariem (var sākties ar DK).',
    rule: 'PEPPOL-COMMON-R042',
  },
  '0208': { test: beEnterpriseOk, message: 'Beļģijas uzņēmuma numurs nav derīgs.', rule: 'PEPPOL-COMMON-R043' },
  '0007': { test: seOrgNoOk, message: 'Zviedrijas organizācijas numurs nav derīgs.', rule: 'PEPPOL-COMMON-R049' },
};

// ---------- Validācija ----------

const PARTY_LABELS = { seller: 'nosūtītāja', buyer: 'saņēmēja' };

export function validateInvoice(invoice) {
  const errors = [];
  const warnings = [];
  const error = (field, message, rule, alsoFields) => errors.push({ field, message, rule, alsoFields });
  const warn = (field, message, rule, extra) => warnings.push({ field, message, rule, ...extra });
  const calc = calculate(invoice);
  const categories = usedVatCategories(invoice);

  const checkDate = (field, required, emptyMessage, rule) => {
    const value = clean(invoice[field]);
    if (!value) {
      if (required) error(field, emptyMessage, rule);
    } else if (!isValidDate(value)) {
      error(field, 'Datums nav derīgs (formāts GGGG-MM-DD).', 'PEPPOL-EN16931-F001');
    }
    return value && isValidDate(value) ? value : null;
  };

  // --- Rēķina pamatinformācija ---
  if (!clean(invoice.invoiceNumber)) error('invoiceNumber', 'Norādiet rēķina numuru.', 'BR-02');
  const issueDate = checkDate('issueDate', true, 'Norādiet rēķina datumu.', 'BR-03');
  const dueDate = checkDate('dueDate', false);
  if (issueDate && dueDate && dueDate < issueDate) {
    warn('dueDate', 'Apmaksas termiņš ir agrāks par rēķina datumu.');
  }
  if (!INVOICE_TYPES.some((t) => t.code === invoice.typeCode)) {
    error('typeCode', 'Izvēlieties dokumenta veidu.', 'PEPPOL-EN16931-P0100');
  }
  if (!clean(invoice.currency)) error('currency', 'Izvēlieties valūtu.', 'BR-05');
  else if (!CURRENCY_CODES.includes(invoice.currency)) {
    error('currency', 'Valūtas kods nav derīgs (jābūt ISO 4217 kodam, piem., EUR).', 'BR-CL-04');
  }
  if (!clean(invoice.buyerReference) && !clean(invoice.orderReference)) {
    error('buyerReference', 'Norādiet pircēja atsauci vai pasūtījuma numuru — e-rēķinā jābūt vismaz vienam no tiem.',
      'PEPPOL-EN16931-R003', ['orderReference']);
  }
  if (calc.payable.n > 0n && !dueDate && !clean(invoice.paymentTerms)
      && !errors.some((e) => e.field === 'dueDate')) {
    error('dueDate', 'Norādiet apmaksas termiņu vai apmaksas noteikumus — tie ir obligāti, ja rēķins jāapmaksā.',
      'BR-CO-25', ['paymentTerms']);
  }
  checkDate('deliveryDate', false);
  const deliveryCountry = clean(invoice.deliveryCountry);
  if (deliveryCountry && !COUNTRY_CODES.includes(deliveryCountry)) {
    error('deliveryCountry', 'Valsts kods nav derīgs.', 'BR-CL-14');
  }
  if (categories.includes('K')) {
    if (!clean(invoice.deliveryDate)) {
      error('deliveryDate', 'Preču piegādei uz citu ES valsti jānorāda piegādes datums.', 'BR-IC-11');
    }
    if (!deliveryCountry) {
      error('deliveryCountry', 'Preču piegādei uz citu ES valsti jānorāda piegādes valsts.', 'BR-IC-12');
    }
  }

  // --- Nosūtītājs un saņēmējs ---
  for (const role of ['seller', 'buyer']) {
    validateParty(invoice[role], role, error, warn);
  }
  const seller = invoice.seller;
  const sellerVat = compactId(seller.vatNo);
  const sellerRegNo = compactId(seller.regNo);
  if (!sellerVat && !sellerRegNo) {
    error('seller.regNo', 'Norādiet nosūtītāja reģistrācijas numuru vai PVN numuru.', 'BR-CO-26', ['seller.vatNo']);
  }

  // --- Maksājuma rekvizīti ---
  const means = PAYMENT_MEANS.find((m) => m.code === invoice.payment.meansCode);
  const iban = compactId(invoice.payment.iban);
  const bic = compactId(invoice.payment.bic);
  if (!means) error('payment.meansCode', 'Izvēlieties maksājuma veidu.', 'BR-49');
  if (means?.requiresAccount && !iban) {
    error('payment.iban', 'Norādiet konta numuru (IBAN) vai izvēlieties citu maksājuma veidu.', 'BR-61');
  }
  if (iban) {
    const looksLikeIban = /^[A-Z]{2}\d{2}/.test(iban);
    if (looksLikeIban && !isValidIban(iban)) {
      error('payment.iban', 'Konta numurs (IBAN) nav derīgs — pārbaudiet, vai visi simboli ir pareizi.');
    } else if (!looksLikeIban && means?.requiresIban) {
      error('payment.iban', 'SEPA pārskaitījumam jānorāda IBAN konta numurs.');
    } else if (!/^[A-Z0-9]+$/.test(iban)) {
      error('payment.iban', 'Konta numurā drīkst būt tikai latīņu burti un cipari.');
    }
    if (means && !means.requiresAccount) {
      warn('payment.iban', 'Konta numurs netiks iekļauts e-rēķinā, jo izvēlētais maksājuma veids nav pārskaitījums.');
    }
  }
  if (bic && !isValidBic(bic)) {
    error('payment.bic', 'BIC/SWIFT kods nav derīgs (8 vai 11 simboli, piem., HABALV22).');
  }

  // --- Pozīcijas ---
  if (invoice.lines.length === 0) error('lines', 'Pievienojiet vismaz vienu rēķina pozīciju.', 'BR-16');
  invoice.lines.forEach((line, i) => validateLine(line, i, calc.lines[i].amount, error, warn));

  // --- PVN kategoriju prasības ---
  const hasTaxRegistration = Boolean(sellerTaxRegistrationId(seller));
  const buyerVat = compactId(invoice.buyer.vatNo);
  const buyerRegNo = compactId(invoice.buyer.regNo);
  // BR-S-02, BR-Z-02, BR-E-02, BR-AE-02 (PVN vai nodokļu reģistrācijas numurs) un BR-IC-02, BR-G-02 (tikai PVN numurs)
  const needSellerVat = categories.filter((c) => VAT_CATEGORIES[c].sellerId === 'vat'
    || (VAT_CATEGORIES[c].sellerId === 'vatOrTax' && !hasTaxRegistration));
  if (needSellerVat.length && !sellerVat) {
    const labels = needSellerVat.map((c) => `“${VAT_CATEGORIES[c].label}”`).join(', ');
    const alternative = seller.country === 'LV' && needSellerVat.every((c) => VAT_CATEGORIES[c].sellerId === 'vatOrTax')
      ? ' vai reģistrācijas numurs (11 cipari)' : '';
    const first = needSellerVat[0];
    error('seller.vatNo', `Pozīcijām ar PVN veidu ${labels} jānorāda nosūtītāja PVN numurs${alternative}.`,
      first === 'K' ? 'BR-IC-02' : `BR-${first}-02`);
  }
  for (const c of categories) {
    const cat = VAT_CATEGORIES[c];
    if (cat.buyerId === 'vatOrLegal' && !buyerVat && !buyerRegNo) {
      error('buyer.vatNo', 'Apgrieztās maksāšanas gadījumā jānorāda saņēmēja PVN numurs vai reģistrācijas numurs.',
        'BR-AE-02');
    }
    if (cat.buyerId === 'vat' && !buyerVat) {
      error('buyer.vatNo', 'Piegādei uz citu ES valsti jānorāda saņēmēja PVN numurs.', 'BR-IC-02');
    }
    if (cat.exemption === 'required' && !cat.vatex && !clean(invoice.vatReasons[c])) {
      error(`vatReasons.${c}`, 'Norādiet PVN atbrīvojuma pamatojumu (piem., “Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs”).',
        `BR-${c}-10`);
    }
  }
  if (categories.includes('O')) {
    if (sellerVat) {
      error('seller.vatNo', 'Pozīcijām “Neapliek ar PVN” e-rēķinā nedrīkst norādīt nosūtītāja PVN numuru.', 'BR-O-02');
    }
    if (buyerVat) {
      error('buyer.vatNo', 'Pozīcijām “Neapliek ar PVN” e-rēķinā nedrīkst norādīt saņēmēja PVN numuru.', 'BR-O-02');
    }
    const other = invoice.lines.findIndex((l) => VAT_CATEGORIES[l.vatCategory] && l.vatCategory !== 'O');
    if (other >= 0) {
      error(`lines.${other}.vat`, 'Ja rēķinā ir pozīcijas “Neapliek ar PVN”, visām pozīcijām jābūt ar šo PVN veidu.',
        'BR-O-12');
    }
  }
  if (categories.includes('S') && !sellerVat && hasTaxRegistration) {
    warn('seller.vatNo', 'Rēķinā ir pozīcijas ar PVN likmi, bet nosūtītājam nav norādīts PVN numurs. PVN var piemērot tikai PVN maksātājs.');
  }

  // --- Kopsummas ---
  const prepaidText = clean(invoice.prepaidAmount);
  if (prepaidText) {
    const prepaid = parseDecimal(prepaidText);
    if (!prepaid) error('prepaidAmount', 'Summai jābūt skaitlim.');
    else if (prepaid.n < 0n) error('prepaidAmount', 'Avansā samaksātā summa nevar būt negatīva.');
    else if (significantScale(prepaid) > 2) {
      error('prepaidAmount', 'Summā drīkst būt ne vairāk kā 2 cipari aiz komata.', 'BR-DEC-16');
    }
  }
  compareSourceTotals(invoice, calc, warn);

  return { errors, warnings, calc };
}

function validateParty(party, role, error, warn) {
  const who = PARTY_LABELS[role];
  const f = (name) => `${role}.${name}`;
  if (!clean(party.name)) error(f('name'), 'Norādiet nosaukumu.', role === 'seller' ? 'BR-06' : 'BR-07');
  if (!clean(party.country)) error(f('country'), 'Izvēlieties valsti.', role === 'seller' ? 'BR-09' : 'BR-11');
  else if (!COUNTRY_CODES.includes(party.country)) error(f('country'), 'Valsts kods nav derīgs.', 'BR-CL-14');

  const regNo = compactId(party.regNo);
  if (regNo && party.country === 'LV') {
    if (!isLvRegNo(regNo)) error(f('regNo'), 'Latvijas reģistrācijas numuram jābūt 11 cipariem.');
    else if (!lvRegNoChecksumOk(regNo)) {
      warn(f('regNo'), 'Reģistrācijas numura kontrolcipars neatbilst — pārbaudiet, vai numurs ievadīts pareizi.');
    }
  }

  const vatNo = compactId(party.vatNo);
  if (vatNo) {
    if (!VAT_PREFIXES.has(vatNo.slice(0, 2))) {
      error(f('vatNo'), 'PVN numuram jāsākas ar valsts kodu, piem., LV40003012345.', 'BR-CO-09');
    } else if (!/^[A-Z0-9]{2}[A-Z0-9+*.]{2,12}$/.test(vatNo)) {
      error(f('vatNo'), 'PVN numurā pēc valsts koda drīkst būt tikai latīņu burti un cipari (līdz 12 simboliem).');
    } else if (vatNo.startsWith('LV')) {
      if (!/^LV\d{11}$/.test(vatNo)) error(f('vatNo'), 'Latvijas PVN numuram jābūt formātā LV un 11 cipari.');
      else if (!lvRegNoChecksumOk(vatNo.slice(2))) {
        warn(f('vatNo'), 'PVN numura kontrolcipars neatbilst — pārbaudiet, vai numurs ievadīts pareizi.');
      }
    }
  }

  const endpoint = effectiveEndpoint(party);
  const invalidLvRegNo = party.country === 'LV' && regNo && !isLvRegNo(regNo);
  if (!endpoint) {
    // Ja Latvijas reģistrācijas numurs ir nederīgs, pietiek ar kļūdu pie tā.
    if (!invalidLvRegNo) {
      error(f('endpointId'),
        `Norādiet ${who} e-rēķina adresi. Latvijas uzņēmumiem to veido automātiski no reģistrācijas numura.`,
        role === 'seller' ? 'PEPPOL-EN16931-R020' : 'PEPPOL-EN16931-R010', [f('regNo')]);
    }
  } else if (!endpoint.derived) {
    if (!endpoint.scheme) error(f('endpointScheme'), 'Izvēlieties e-rēķina adreses veidu.', role === 'seller' ? 'BR-62' : 'BR-63');
    else if (!SCHEME_CODES.has(endpoint.scheme)) error(f('endpointScheme'), 'Neatbalstīts e-rēķina adreses veids.', 'BR-CL-25');
    if (!endpoint.id) error(f('endpointId'), 'Norādiet e-rēķina adreses identifikatoru.');
    else if (/\s/.test(endpoint.id) || !/^[\x21-\x7E]+$/.test(endpoint.id)) {
      error(f('endpointId'), 'Identifikatorā drīkst būt tikai latīņu burti, cipari un simboli bez atstarpēm.');
    } else if (ENDPOINT_FORMATS[endpoint.scheme] && !ENDPOINT_FORMATS[endpoint.scheme].test(endpoint.id)) {
      const format = ENDPOINT_FORMATS[endpoint.scheme];
      error(f('endpointId'), format.message, format.rule);
    }
  }

  if (!clean(party.street) && !clean(party.city)) {
    warn(f('street'), 'Adrese nav norādīta. Rēķinā parasti jānorāda juridiskā adrese.');
  }
}

function validateLine(line, index, amount, error, warn) {
  const f = (name) => `lines.${index}.${name}`;
  if (!clean(line.name)) error(f('name'), 'Norādiet preces vai pakalpojuma nosaukumu.', 'BR-25');

  const quantityText = clean(line.quantity);
  if (!quantityText) error(f('quantity'), 'Norādiet daudzumu.', 'BR-22');
  else if (!parseDecimal(quantityText)) error(f('quantity'), 'Daudzumam jābūt skaitlim.');

  if (!UNIT_CODES.has(line.unitCode)) error(f('unitCode'), 'Izvēlieties mērvienību.', 'BR-23');

  const priceText = clean(line.price);
  const price = parseDecimal(priceText);
  if (!priceText) error(f('price'), 'Norādiet cenu.', 'BR-26');
  else if (!price) error(f('price'), 'Cenai jābūt skaitlim.');
  else if (price.n < 0n) {
    error(f('price'), 'Cena nedrīkst būt negatīva. Atlaidi var norādīt kā pozīciju ar negatīvu daudzumu.', 'BR-27');
  }

  const category = VAT_CATEGORIES[line.vatCategory];
  if (!category) error(f('vat'), 'Izvēlieties PVN likmi vai veidu.', 'BR-CO-04');
  else if (category.rate === 'positive') {
    const rateText = clean(line.vatRate);
    const rate = parseDecimal(rateText);
    if (!rateText) error(f('vatRate'), 'Norādiet PVN likmi.', 'BR-S-05');
    else if (!rate) error(f('vatRate'), 'PVN likmei jābūt skaitlim.');
    else if (rate.n <= 0n) {
      error(f('vatRate'), 'PVN likmei jābūt lielākai par 0. Ja PVN nepiemēro, izvēlieties atbilstošo PVN veidu.', 'BR-S-05');
    } else if (cmp(rate, { n: 100n, s: 0 }) > 0) error(f('vatRate'), 'PVN likme nevar pārsniegt 100%.');
  }

  const source = line.sourceAmount ? parseDecimal(line.sourceAmount) : null;
  if (source && amount && cmp(source, amount) !== 0) {
    warn(f('amount'), `Dokumentā norādītā summa (${toDisplayString(source)}) atšķiras no aprēķinātās `
      + `(${toDisplayString(amount)}). Pārbaudiet daudzumu un cenu.`, undefined,
    { short: `Dokumentā: ${toDisplayString(source)}` });
  }
}

const SOURCE_TOTALS = [
  ['totalWithoutVat', 'taxExclusive', 'Summa bez PVN'],
  ['totalVat', 'taxTotal', 'PVN summa'],
  ['totalWithVat', 'taxInclusive', 'Summa ar PVN'],
  ['amountDue', 'payable', 'Summa apmaksai'],
];

// Salīdzina aprēķinātās kopsummas ar augšupielādētajā dokumentā norādītajām (OpenAI rezultāta pārbaude).
function compareSourceTotals(invoice, calc, warn) {
  const totals = invoice.source?.totals;
  if (!totals || !calc.complete) return;
  for (const [sourceKey, calcKey, label] of SOURCE_TOTALS) {
    const source = totals[sourceKey] ? parseDecimal(totals[sourceKey]) : null;
    if (source && cmp(source, calc[calcKey]) !== 0) {
      warn(`totals.${calcKey}`, `${label}: aprēķinātā vērtība (${toDisplayString(calc[calcKey])}) nesakrīt ar dokumentā `
        + `norādīto (${toDisplayString(source)}).`);
    }
  }
}

// Lauki, kas pašreizējos datos ir obligāti (lietotāja saskarnē tos atzīmē ar zvaigznīti).
export function requiredFields(invoice) {
  const required = new Set([
    'invoiceNumber', 'issueDate', 'typeCode', 'currency', 'payment.meansCode',
    'seller.name', 'seller.country', 'seller.endpointId', 'buyer.name', 'buyer.country', 'buyer.endpointId',
  ]);
  const categories = usedVatCategories(invoice);
  const seller = invoice.seller;
  // Pāri "vismaz viens no abiem": zvaigznīti rāda, kamēr neviens nav aizpildīts.
  if (!clean(invoice.buyerReference) && !clean(invoice.orderReference)) {
    required.add('buyerReference');
    required.add('orderReference');
  }
  if (calculate(invoice).payable.n > 0n && !clean(invoice.dueDate) && !clean(invoice.paymentTerms)) {
    required.add('dueDate');
    required.add('paymentTerms');
  }
  const means = PAYMENT_MEANS.find((m) => m.code === invoice.payment.meansCode);
  if (means?.requiresAccount) required.add('payment.iban');
  if (!compactId(seller.vatNo)) required.add('seller.regNo');
  // Latvijas pārdevējam PVN numura vietā var izmantot reģistrācijas numuru (BT-32), ja PVN kategorija to pieļauj.
  const canUseTaxRegistration = seller.country === 'LV' && isLvRegNo(compactId(seller.regNo));
  const needsSellerVat = categories.some((c) => VAT_CATEGORIES[c].sellerId === 'vat')
    || (categories.some((c) => VAT_CATEGORIES[c].sellerId === 'vatOrTax') && !canUseTaxRegistration);
  if (needsSellerVat) required.add('seller.vatNo');
  if (categories.includes('K')) {
    required.add('buyer.vatNo');
    required.add('deliveryDate');
    required.add('deliveryCountry');
  }
  if (categories.includes('AE') && !compactId(invoice.buyer.regNo)) required.add('buyer.vatNo');
  for (const c of categories) {
    const cat = VAT_CATEGORIES[c];
    if (cat.exemption === 'required' && !cat.vatex) required.add(`vatReasons.${c}`);
  }
  return required;
}
