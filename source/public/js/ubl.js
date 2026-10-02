// E-rēķina XML (UBL 2.1 Invoice, Peppol BIS Billing 3.0) ģenerēšana.
// Elementu secība atbilst Peppol BIS 3.0 UBL Invoice sintaksei; struktūra un formatējums —
// piemēram examples/e-rekins_A.xml. XML tiek ģenerēts tikai no datiem bez validācijas kļūdām.

import { parseDecimal, toPlainString } from './decimal.js';
import { VAT_CATEGORIES, PAYMENT_MEANS, LV_REGISTRATION_SCHEME } from './codelists.js';
import { clean, compactId, effectiveEndpoint, sellerTaxRegistrationId, isLvRegNo, lineVatRate } from './invoice.js';
import { validateInvoice } from './validation.js';

export const CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

// BT-32 (pārdevēja nodokļu maksātāja reģistrācijas kods): specifikācija prasa nodokļu shēmas ID,
// kas nav "VAT". Izmantota tā pati vērtība kā piemērā examples/e-rekins_A.xml.
export const TAX_REGISTRATION_SCHEME_ID = '!=VAT';

const NAMESPACES = {
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
};

export class InvoiceValidationError extends Error {
  constructor(errors) {
    super(`E-rēķinu nevar izveidot: ${errors.length} kļūda(s) datos.`);
    this.errors = errors;
  }
}

// ---------- Vienkāršs XML koks ----------

function node(name, content, attrs = {}) {
  return { name, content, attrs };
}

// XML 1.0 neatļautās vadības rakstzīmes (piem., no kopēta teksta) tiek izņemtas.
function removeControlChars(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

// Teksta elements; tukšas vērtības netiek iekļautas (PEPPOL-EN16931-R008: tukši elementi nav atļauti).
function textNode(name, value, attrs = {}) {
  const text = clean(removeControlChars(value));
  return text ? node(name, text, attrs) : null;
}

function escapeXml(value, attribute = false) {
  const text = removeControlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return attribute ? text.replace(/"/g, '&quot;') : text;
}

function serialize(n, depth) {
  const indent = '\t'.repeat(depth);
  const attrs = Object.entries(n.attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${escapeXml(v, true)}"`)
    .join('');
  if (typeof n.content === 'string') {
    return `${indent}<${n.name}${attrs}>${escapeXml(n.content)}</${n.name}>`;
  }
  const children = n.content.filter(Boolean).map((c) => serialize(c, depth + 1)).filter(Boolean);
  if (children.length === 0) return null;
  return `${indent}<${n.name}${attrs}>\n${children.join('\n')}\n${indent}</${n.name}>`;
}

// ---------- Rēķina daļas ----------

function taxSchemeVat() {
  return node('cac:TaxScheme', [textNode('cbc:ID', 'VAT')]);
}

function partyNode(party, role) {
  const endpoint = effectiveEndpoint(party);
  const regNo = compactId(party.regNo);
  const lvRegNo = party.country === 'LV' && isLvRegNo(regNo) ? regNo : null;
  const vatNo = compactId(party.vatNo);
  const taxRegistration = role === 'seller' ? sellerTaxRegistrationId(party) : null;

  return node('cac:Party', [
    textNode('cbc:EndpointID', endpoint.id, { schemeID: endpoint.scheme }),
    lvRegNo && node('cac:PartyIdentification', [textNode('cbc:ID', lvRegNo, { schemeID: LV_REGISTRATION_SCHEME })]),
    node('cac:PartyName', [textNode('cbc:Name', party.name)]),
    node('cac:PostalAddress', [
      textNode('cbc:StreetName', party.street),
      textNode('cbc:CityName', party.city),
      textNode('cbc:PostalZone', party.postalCode),
      node('cac:Country', [textNode('cbc:IdentificationCode', party.country)]),
    ]),
    vatNo && node('cac:PartyTaxScheme', [textNode('cbc:CompanyID', vatNo), taxSchemeVat()]),
    taxRegistration && node('cac:PartyTaxScheme', [
      textNode('cbc:CompanyID', taxRegistration),
      node('cac:TaxScheme', [textNode('cbc:ID', TAX_REGISTRATION_SCHEME_ID)]),
    ]),
    node('cac:PartyLegalEntity', [
      textNode('cbc:RegistrationName', party.name),
      regNo && textNode('cbc:CompanyID', regNo, lvRegNo ? { schemeID: LV_REGISTRATION_SCHEME } : {}),
    ]),
  ]);
}

function taxSubtotalNode(group, invoice, amount) {
  const category = VAT_CATEGORIES[group.category];
  return node('cac:TaxSubtotal', [
    amount('cbc:TaxableAmount', group.taxable),
    amount('cbc:TaxAmount', group.tax),
    node('cac:TaxCategory', [
      textNode('cbc:ID', group.category),
      group.rate && textNode('cbc:Percent', toPlainString(group.rate)),
      category.vatex && textNode('cbc:TaxExemptionReasonCode', category.vatex),
      category.exemption === 'required' && textNode('cbc:TaxExemptionReason', invoice.vatReasons[group.category]),
      taxSchemeVat(),
    ]),
  ]);
}

function invoiceLineNode(line, index, lineAmount, currency, amount) {
  const rate = lineVatRate(line);
  return node('cac:InvoiceLine', [
    textNode('cbc:ID', String(index + 1)),
    node('cbc:InvoicedQuantity', toPlainString(parseDecimal(line.quantity), 2), { unitCode: line.unitCode }),
    amount('cbc:LineExtensionAmount', lineAmount),
    node('cac:Item', [
      textNode('cbc:Name', line.name),
      node('cac:ClassifiedTaxCategory', [
        textNode('cbc:ID', line.vatCategory),
        rate && textNode('cbc:Percent', toPlainString(rate)),
        taxSchemeVat(),
      ]),
    ]),
    node('cac:Price', [
      node('cbc:PriceAmount', toPlainString(parseDecimal(line.price), 2), { currencyID: currency }),
      node('cbc:BaseQuantity', '1.00'),
    ]),
  ]);
}

// Izveido e-rēķina XML tekstu. Ja datos ir validācijas kļūdas, izmet InvoiceValidationError.
export function buildInvoiceXml(invoice) {
  const { errors, calc } = validateInvoice(invoice);
  if (errors.length > 0) throw new InvoiceValidationError(errors);

  const currency = invoice.currency;
  const amount = (name, value) => node(name, toPlainString(value, 2), { currencyID: currency });
  const means = PAYMENT_MEANS.find((m) => m.code === invoice.payment.meansCode);
  const bic = compactId(invoice.payment.bic);
  const deliveryCountry = clean(invoice.deliveryCountry);

  const root = node('Invoice', [
    textNode('cbc:CustomizationID', CUSTOMIZATION_ID),
    textNode('cbc:ProfileID', PROFILE_ID),
    textNode('cbc:ID', invoice.invoiceNumber),
    textNode('cbc:IssueDate', invoice.issueDate),
    textNode('cbc:DueDate', invoice.dueDate),
    textNode('cbc:InvoiceTypeCode', invoice.typeCode),
    textNode('cbc:Note', invoice.note),
    textNode('cbc:DocumentCurrencyCode', currency),
    textNode('cbc:BuyerReference', invoice.buyerReference),
    node('cac:OrderReference', [textNode('cbc:ID', invoice.orderReference)]),
    node('cac:ContractDocumentReference', [textNode('cbc:ID', invoice.contractReference)]),
    node('cac:AccountingSupplierParty', [partyNode(invoice.seller, 'seller')]),
    node('cac:AccountingCustomerParty', [partyNode(invoice.buyer, 'buyer')]),
    node('cac:Delivery', [
      textNode('cbc:ActualDeliveryDate', invoice.deliveryDate),
      deliveryCountry && node('cac:DeliveryLocation', [
        node('cac:Address', [node('cac:Country', [textNode('cbc:IdentificationCode', deliveryCountry)])]),
      ]),
    ]),
    node('cac:PaymentMeans', [
      textNode('cbc:PaymentMeansCode', means.code),
      means.requiresAccount && node('cac:PayeeFinancialAccount', [
        textNode('cbc:ID', compactId(invoice.payment.iban)),
        bic && node('cac:FinancialInstitutionBranch', [textNode('cbc:ID', bic)]),
      ]),
    ]),
    node('cac:PaymentTerms', [textNode('cbc:Note', invoice.paymentTerms)]),
    node('cac:TaxTotal', [
      amount('cbc:TaxAmount', calc.taxTotal),
      ...calc.breakdown.map((group) => taxSubtotalNode(group, invoice, amount)),
    ]),
    node('cac:LegalMonetaryTotal', [
      amount('cbc:LineExtensionAmount', calc.lineTotal),
      amount('cbc:TaxExclusiveAmount', calc.taxExclusive),
      amount('cbc:TaxInclusiveAmount', calc.taxInclusive),
      amount('cbc:PrepaidAmount', calc.prepaid),
      amount('cbc:PayableAmount', calc.payable),
    ]),
    ...invoice.lines.map((line, i) => invoiceLineNode(line, i, calc.lines[i].amount, currency, amount)),
  ], NAMESPACES);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root, 0)}\n`;
}

// Lejupielādējamā faila nosaukums, piem., "e-rekins_LRC171-25.xml".
export function xmlFileName(invoice) {
  const safe = clean(invoice.invoiceNumber).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `e-rekins_${safe || 'bez-numura'}.xml`;
}
