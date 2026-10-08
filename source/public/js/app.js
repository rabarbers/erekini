// Lietotāja saskarne: formas veidošana, datu sasaiste, validācijas rezultātu attēlošana,
// dokumenta augšupielāde un e-rēķina XML lejupielāde.

import {
  emptyInvoice, emptyLine, invoiceFromExtraction, vatOptionValue, applyVatOption,
  effectiveEndpoint, usedVatCategories, clean,
} from './invoice.js';
import { validateInvoice, requiredFields } from './validation.js';
import { buildInvoiceXml, xmlFileName } from './ubl.js';
import {
  COUNTRY_CODES, PREFERRED_COUNTRIES, CURRENCY_CODES, PREFERRED_CURRENCIES, INVOICE_TYPES, UNITS,
  PAYMENT_MEANS, ENDPOINT_SCHEMES, VAT_CATEGORIES, VAT_OPTIONS,
} from './codelists.js';
import { parseDecimal, toDisplayString } from './decimal.js';
import { createVatChecker, vatCheckWarning, VID_MANUAL_URL } from './vat-check.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_FILE = /\.(pdf|docx|png|jpe?g)$/i;
const REASON_CATEGORIES = ['E', 'AE', 'K', 'G', 'O'];

const state = {
  invoice: null,
  touched: new Set(), // lauki, kurus lietotājs jau ir apmeklējis — tiem kļūdas rāda uzreiz
  showAll: false, // rādīt visas kļūdas (pēc augšupielādes vai XML izveides mēģinājuma)
  dirty: false,
  busy: false,
};

const vatChecker = createVatChecker({
  async lookup(party, signal) {
    let response;
    try {
      response = await fetch(`/api/vat-status?${new URLSearchParams(party)}`, { signal });
    } catch {
      throw new Error('Neizdevās pārbaudīt PVN statusu. Mēģiniet vēlreiz vai pārbaudiet VID servisā.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(payload?.error ?? 'Neizdevās pārbaudīt PVN statusu. Mēģiniet vēlreiz vai pārbaudiet VID servisā.');
    return payload;
  },
  onChange: scheduleUpdate,
  onAutofill(role) {
    state.touched.add(`${role}.vatNo`);
    syncControls();
    markDirty();
  },
});

function validationWithVat() {
  const result = validateInvoice(state.invoice);
  for (const role of ['seller', 'buyer']) {
    const check = vatChecker.get(role);
    const warning = vatCheckWarning(state.invoice[role], check);
    if (warning) result.warnings.push({ field: `${role}.vatNo`, message: warning, alwaysVisible: true });
    if (check?.status === 'error') result.warnings.push({ field: `${role}.vatNo`, message: check.message, alwaysVisible: true });
  }
  return result;
}

// ---------- DOM palīgfunkcijas ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const $ = (selector) => document.querySelector(selector);
const fieldId = (path) => `f-${path.replace(/\./g, '-')}`;
const byData = (attr, path) => document.querySelector(`[data-${attr}="${CSS.escape(path)}"]`);

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function plural(n, one, many) {
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
}

function money(value) {
  return value ? toDisplayString(value, 2) : '—';
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Izvēlņu saraksti ----------

function displayNames(type) {
  try {
    return new Intl.DisplayNames(['lv'], { type });
  } catch {
    return null;
  }
}
const countryNames = displayNames('region');
const currencyNames = displayNames('currency');

function nameOf(names, code) {
  try {
    const name = names?.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

// Kodi, kuriem pārlūka valstu nosaukumu sarakstā nav nosaukuma (EN16931 tos pieļauj).
const SPECIAL_COUNTRY_NAMES = { '1A': 'Kosova', XI: 'Ziemeļīrija' };

function countryOptions() {
  const label = (c) => SPECIAL_COUNTRY_NAMES[c] ?? nameOf(countryNames, c);
  const option = (c) => ({ value: c, label: label(c) ? `${label(c)} (${c})` : c });
  const rest = COUNTRY_CODES.filter((c) => !PREFERRED_COUNTRIES.includes(c)).map(option)
    .sort((a, b) => a.label.localeCompare(b.label, 'lv'));
  return [
    { value: '', label: '— izvēlieties —' },
    { group: 'Biežāk izmantotās', options: PREFERRED_COUNTRIES.map(option) },
    { group: 'Visas valstis', options: rest },
  ];
}

function currencyOptions() {
  const option = (c) => ({ value: c, label: nameOf(currencyNames, c) ? `${c} — ${nameOf(currencyNames, c)}` : c });
  return [
    { value: '', label: '— izvēlieties —' },
    { group: 'Biežāk izmantotās', options: PREFERRED_CURRENCIES.map(option) },
    { group: 'Visas valūtas', options: CURRENCY_CODES.filter((c) => !PREFERRED_CURRENCIES.includes(c)).sort().map(option) },
  ];
}

const unitOptions = () => [{ value: '', label: '— izvēlieties —' }, ...UNITS.map((u) => ({ value: u.code, label: u.label }))];

const vatSelectOptions = () => [
  { value: '', label: '— izvēlieties —' },
  { group: 'Ar PVN', options: VAT_OPTIONS.filter((o) => o.category === 'S') },
  { group: 'Bez PVN', options: VAT_OPTIONS.filter((o) => o.category !== 'S') },
];

const endpointOptions = () => [
  { value: '', label: 'Automātiski — reģistrācijas nr.' },
  ...ENDPOINT_SCHEMES.map((s) => ({ value: s.code, label: `${s.code} — ${s.label}` })),
];

function optionElements(options) {
  return options.map((o) => (o.group
    ? h('optgroup', { label: o.group }, optionElements(o.options))
    : h('option', { value: o.value }, o.label)));
}

// ---------- Lauku konfigurācija ----------

const BASIC_FIELDS = [
  { path: 'invoiceNumber', label: 'Rēķina numurs', col: 'col-sm-6 col-lg-3' },
  { path: 'issueDate', label: 'Rēķina datums', type: 'date', col: 'col-sm-6 col-lg-3' },
  { path: 'dueDate', label: 'Apmaksas termiņš', type: 'date', col: 'col-sm-6 col-lg-3' },
  { path: 'typeCode', label: 'Dokumenta veids', type: 'select', col: 'col-sm-6 col-lg-3',
    options: () => INVOICE_TYPES.map((t) => ({ value: t.code, label: t.label })) },
  { path: 'buyerReference', label: 'Pircēja atsauce', col: 'col-sm-6 col-lg-3',
    help: 'Pircēja norādīts identifikators, piem., kontaktpersona vai nodaļa.' },
  { path: 'orderReference', label: 'Pasūtījuma numurs', col: 'col-sm-6 col-lg-3',
    help: 'Jānorāda pircēja atsauce vai pasūtījuma numurs (vismaz viens).' },
  { path: 'contractReference', label: 'Līguma numurs', col: 'col-sm-6 col-lg-3' },
  { path: 'currency', label: 'Valūta', type: 'select', col: 'col-sm-6 col-lg-3', options: currencyOptions },
  { path: 'paymentTerms', label: 'Apmaksas noteikumi', col: 'col-lg-6', placeholder: 'piem., Apmaksa 14 dienu laikā',
    help: 'Jānorāda apmaksas termiņš vai apmaksas noteikumi, ja rēķins jāapmaksā.' },
  { path: 'deliveryDate', label: 'Piegādes datums', type: 'date', col: 'col-sm-6 col-lg-3' },
  { path: 'deliveryCountry', label: 'Piegādes valsts', type: 'select', col: 'col-sm-6 col-lg-3', options: countryOptions,
    showIf: (inv) => usedVatCategories(inv).includes('K') || Boolean(clean(inv.deliveryCountry)) },
  { path: 'note', label: 'Piezīmes', type: 'textarea', col: 'col-12', placeholder: 'Papildu informācija rēķinā (nav obligāta)' },
];

const PARTY_FIELDS = [
  { key: 'name', label: 'Nosaukums', col: 'col-12' },
  { key: 'regNo', label: 'Reģistrācijas numurs', col: 'col-sm-6', inputmode: 'numeric' },
  { key: 'vatNo', label: 'PVN maksātāja numurs', col: 'col-sm-6', placeholder: 'piem., LV40003012345',
    help: 'Ja nav PVN maksātājs, atstājiet tukšu.' },
  { key: 'street', label: 'Adrese (iela, māja, dzīvoklis)', col: 'col-12' },
  { key: 'city', label: 'Pilsēta / novads', col: 'col-sm-5' },
  { key: 'postalCode', label: 'Pasta indekss', col: 'col-sm-3', placeholder: 'LV-1001' },
  { key: 'country', label: 'Valsts', type: 'select', col: 'col-sm-4', options: countryOptions },
  { key: 'endpointScheme', label: 'E-rēķina adreses veids', type: 'select', col: 'col-sm-6', options: endpointOptions },
  { key: 'endpointId', label: 'E-rēķina adrese', col: 'col-sm-6' },
];

const PAYMENT_FIELDS = [
  { path: 'payment.meansCode', label: 'Maksājuma veids', type: 'select', col: 'col-sm-5',
    options: () => PAYMENT_MEANS.map((m) => ({ value: m.code, label: m.label })) },
  { path: 'payment.iban', label: 'Konta numurs (IBAN)', col: 'col-sm-7', placeholder: 'LV00BANK0000000000000' },
  { path: 'payment.bic', label: 'BIC/SWIFT kods', col: 'col-sm-5', placeholder: 'piem., HABALV22' },
];

function feedbackElement(path) {
  return h('div', { class: 'feedback', id: `${fieldId(path)}-fb`, dataset: { feedbackFor: path } });
}

function controlElement(cfg) {
  const attrs = {
    id: fieldId(cfg.path),
    dataset: { field: cfg.path },
    'aria-describedby': `${fieldId(cfg.path)}-fb`,
  };
  if (cfg.type === 'select') {
    return h('select', { ...attrs, class: 'form-select form-select-sm' }, optionElements(cfg.options()));
  }
  if (cfg.type === 'textarea') {
    return h('textarea', { ...attrs, class: 'form-control form-control-sm', rows: 2, placeholder: cfg.placeholder });
  }
  return h('input', {
    ...attrs,
    class: 'form-control form-control-sm',
    type: cfg.type ?? 'text',
    placeholder: cfg.placeholder,
    inputmode: cfg.inputmode,
  });
}

function fieldElement(cfg) {
  return h('div', { class: cfg.col, dataset: { wrapperFor: cfg.path } },
    h('label', { class: 'form-label', for: fieldId(cfg.path), dataset: { labelFor: cfg.path } }, cfg.label),
    controlElement(cfg),
    cfg.help && h('div', { class: 'form-text' }, cfg.help),
    cfg.hintId && h('div', { class: 'derived-hint', id: cfg.hintId }),
    feedbackElement(cfg.path));
}

function buildStaticForm() {
  $('#basic-fields').replaceChildren(...BASIC_FIELDS.map(fieldElement));
  for (const role of ['seller', 'buyer']) {
    const fields = PARTY_FIELDS.map((f) => ({
      ...f,
      path: `${role}.${f.key}`,
      hintId: f.key === 'endpointId' ? `hint-${role}-endpoint` : undefined,
    }));
    $(`#${role}-fields`).replaceChildren(...fields.map(fieldElement),
      h('div', { class: 'col-12' },
        h('div', { id: `vat-status-${role}`, role: 'status', 'aria-live': 'polite' }),
        h('div', { class: 'd-flex align-items-center flex-wrap gap-3 mt-2' },
          h('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', dataset: { checkVat: role } }, 'Pārbaudīt PVN statusu'),
          h('a', { href: VID_MANUAL_URL, target: '_blank', rel: 'noopener noreferrer', class: 'small' }, 'Pārbaudīt VID servisā')),
        h('div', { class: 'form-text' }, 'Latvijas PVN numurus pārbauda automātiski. VID atvērtie dati tiek atjaunoti katru dienu.')));
  }
  $('#payment-fields').replaceChildren(...PAYMENT_FIELDS.map(fieldElement));

  $('#vat-reasons').replaceChildren(...REASON_CATEGORIES.map((c) => {
    const category = VAT_CATEGORIES[c];
    return h('div', { class: 'col-12', dataset: { reasonFor: c }, hidden: true },
      fieldElement({
        path: `vatReasons.${c}`,
        label: `Atbrīvojuma pamatojums: ${category.label}`,
        col: '',
        placeholder: c === 'E' ? 'piem., Saskaņā ar PVN likumu uzņēmums nav PVN maksātājs' : 'nav obligāts',
        help: category.vatex ? `E-rēķinā automātiski tiks norādīts kods ${category.vatex}.` : undefined,
      }));
  }));

  const docCell = (key) => h('td', { class: 'text-end doc-value doc-col', id: `doc-${key}` });
  const row = (anchor, label, docKey, extraClass) => h('tr', { class: extraClass, dataset: { anchor }, tabindex: -1 },
    h('th', { scope: 'row' }, label),
    h('td', { class: 'text-end', id: `calc-${anchor}` }),
    docKey ? docCell(docKey) : h('td', { class: 'doc-col' }));
  $('#totals').replaceChildren(h('table', { class: 'totals-table', id: 'totals-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Rādītājs')),
      h('th', { scope: 'col', class: 'text-end', id: 'totals-currency' }, 'Aprēķināts'),
      h('th', { scope: 'col', class: 'text-end doc-col' }, 'Dokumentā'))),
    h('tbody', {},
      row('totals.taxExclusive', 'Summa bez PVN', 'totalWithoutVat'),
      row('totals.taxTotal', 'PVN summa', 'totalVat'),
      row('totals.taxInclusive', 'Summa ar PVN', 'totalWithVat'),
      h('tr', {},
        h('th', { scope: 'row' }, h('label', { for: fieldId('prepaidAmount'), dataset: { labelFor: 'prepaidAmount' } }, 'Avansā samaksāts')),
        h('td', { class: 'text-end' },
          h('input', {
            id: fieldId('prepaidAmount'),
            class: 'form-control form-control-sm prepaid-input',
            dataset: { field: 'prepaidAmount' },
            inputmode: 'decimal',
            placeholder: '0,00',
            'aria-describedby': `${fieldId('prepaidAmount')}-fb`,
          }),
          feedbackElement('prepaidAmount')),
        h('td', { class: 'doc-col' })),
      row('totals.payable', 'Summa apmaksai', 'amountDue', 'total-due'))));
}

// ---------- Pozīciju tabula ----------

function lineRow(line, i) {
  const p = (key) => `lines.${i}.${key}`;
  const labelled = (key, text) => ({ id: fieldId(p(key)), dataset: { field: p(key) }, 'aria-label': `${i + 1}. pozīcija: ${text}`,
    'aria-describedby': `${fieldId(p(key))}-fb` });
  return h('tr', { dataset: { line: String(i) } },
    h('td', { class: 'line-no' }, `${i + 1}.`),
    h('td', { class: 'line-name', 'data-label': 'Nosaukums *' },
      h('input', { ...labelled('name', 'nosaukums'), class: 'form-control form-control-sm' }),
      feedbackElement(p('name'))),
    h('td', { class: 'line-qty', 'data-label': 'Daudzums *' },
      h('input', { ...labelled('quantity', 'daudzums'), class: 'form-control form-control-sm text-end', inputmode: 'decimal' }),
      feedbackElement(p('quantity'))),
    h('td', { class: 'line-unit', 'data-label': 'Mērvienība *' },
      h('select', { ...labelled('unitCode', 'mērvienība'), class: 'form-select form-select-sm' }, optionElements(unitOptions())),
      feedbackElement(p('unitCode'))),
    h('td', { class: 'line-price', 'data-label': 'Cena bez PVN *' },
      h('input', { ...labelled('price', 'cena bez PVN'), class: 'form-control form-control-sm text-end', inputmode: 'decimal' }),
      feedbackElement(p('price'))),
    h('td', { class: 'line-vat', 'data-label': 'PVN *' },
      h('select', { ...labelled('vat', 'PVN'), class: 'form-select form-select-sm' }, optionElements(vatSelectOptions())),
      h('div', { class: 'input-group input-group-sm vat-rate-input', dataset: { rateFor: String(i) }, hidden: true },
        h('input', { ...labelled('vatRate', 'PVN likme procentos'), class: 'form-control text-end', inputmode: 'decimal', placeholder: 'likme' }),
        h('span', { class: 'input-group-text' }, '%')),
      feedbackElement(p('vat')),
      feedbackElement(p('vatRate'))),
    h('td', { class: 'line-amount', 'data-label': 'Summa bez PVN', dataset: { anchor: p('amount') }, tabindex: -1 },
      h('span', { class: 'amount-value' }),
      feedbackElement(p('amount'))),
    h('td', { class: 'line-actions' },
      h('button', {
        type: 'button', class: 'btn btn-sm btn-outline-danger', title: 'Dzēst pozīciju',
        'aria-label': `Dzēst ${i + 1}. pozīciju`, dataset: { removeLine: String(i) },
      }, h('i', { class: 'bi bi-trash', 'aria-hidden': 'true' }))));
}

function renderLines() {
  const lines = state.invoice.lines;
  $('#lines-body').replaceChildren(...lines.map(lineRow));
  $('#lines-empty').hidden = lines.length > 0;
  syncControls($('#lines-body'));
}

function addLine() {
  state.invoice.lines.push(emptyLine());
  markDirty();
  renderLines();
  scheduleUpdate();
  byData('field', `lines.${state.invoice.lines.length - 1}.name`)?.focus();
}

function removeLine(index) {
  state.invoice.lines.splice(index, 1);
  const shifted = new Set();
  for (const f of state.touched) {
    const m = /^lines\.(\d+)\.(.+)$/.exec(f);
    if (!m) shifted.add(f);
    else if (Number(m[1]) < index) shifted.add(f);
    else if (Number(m[1]) > index) shifted.add(`lines.${Number(m[1]) - 1}.${m[2]}`);
  }
  state.touched = shifted;
  markDirty();
  renderLines();
  scheduleUpdate();
}

// ---------- Datu sasaiste ----------

function controlValue(path) {
  const m = /^lines\.(\d+)\.vat$/.exec(path);
  if (m) return vatOptionValue(state.invoice.lines[Number(m[1])]);
  return getPath(state.invoice, path) ?? '';
}

// Ieraksta stāvokļa vērtības formas laukos (pēc ielādes vai rindu pārzīmēšanas).
function syncControls(root = document) {
  for (const el of root.querySelectorAll('[data-field]')) {
    const value = controlValue(el.dataset.field);
    if (el.value !== value) el.value = value;
  }
}

function onFieldInput(event) {
  const el = event.target;
  const path = el.dataset?.field;
  if (!path) return;
  const vatMatch = /^lines\.(\d+)\.vat$/.exec(path);
  if (vatMatch) applyVatOption(state.invoice.lines[Number(vatMatch[1])], el.value);
  else setPath(state.invoice, path, el.value);
  const partyMatch = /^(seller|buyer)\.(regNo|vatNo|country)$/.exec(path);
  if (partyMatch) vatChecker.schedule(partyMatch[1], state.invoice[partyMatch[1]]);
  if (el.tagName === 'SELECT') state.touched.add(path);
  markDirty();
  scheduleUpdate();
}

function markDirty() {
  state.dirty = true;
  setStatus('#xml-status', null);
}

// Apvieno vairākus vienlaicīgus notikumus vienā pārrēķinā (darbojas arī neaktīvā cilnē).
let updateScheduled = false;
function scheduleUpdate() {
  if (updateScheduled) return;
  updateScheduled = true;
  queueMicrotask(() => {
    updateScheduled = false;
    update();
  });
}

// ---------- Attēlošana ----------

function update() {
  const invoice = state.invoice;
  const result = validationWithVat();
  const { calc } = result;

  // Pozīciju summas un "Cita likme…" lauki
  invoice.lines.forEach((line, i) => {
    const row = document.querySelector(`#lines-body tr[data-line="${i}"]`);
    if (!row) return;
    row.querySelector('.amount-value').textContent = money(calc.lines[i].amount);
    row.querySelector('[data-rate-for]').hidden = vatOptionValue(line) !== 'S:citi';
  });
  $('#lines-count').textContent = plural(invoice.lines.length, 'pozīcija', 'pozīcijas');

  // Nosacīti rādāmie lauki
  for (const cfg of BASIC_FIELDS.filter((f) => f.showIf)) {
    byData('wrapper-for', cfg.path).hidden = !cfg.showIf(invoice);
  }
  const used = new Set(usedVatCategories(invoice));
  for (const c of REASON_CATEGORIES) {
    document.querySelector(`[data-reason-for="${c}"]`).hidden = !used.has(c);
  }

  renderEndpointHints();
  renderVatStatus();
  renderTotals(result);
  renderRequired();
  renderInlineIssues(result);
  renderValidationPanel(result);
}

function renderVatStatus() {
  for (const role of ['seller', 'buyer']) {
    const check = vatChecker.get(role);
    const party = state.invoice[role];
    const selector = `#vat-status-${role}`;
    const button = document.querySelector(`[data-check-vat="${role}"]`);
    button.disabled = ['pending', 'loading'].includes(check?.status);
    const warning = vatCheckWarning(party, check);
    if (warning) setStatus(selector, 'warning', warning);
    else if (check?.status === 'active') {
      setStatus(selector, 'success', `Aktīvs PVN maksātājs — ${check.vatNo}.${check.autofilled ? ' Numurs aizpildīts no VID reģistra.' : ''}`);
    } else if (check?.status === 'inactive') {
      setStatus(selector, 'warning', 'VID atvērtajos datos nav aktīvs PVN maksātājs.');
    } else if (check?.status === 'not_found') {
      setStatus(selector, 'warning', 'Numurs VID PVN reģistrā nav atrasts. PVN numurs netika pievienots.');
    } else if (check?.status === 'error') {
      setStatus(selector, 'warning', check.message);
    } else if (['pending', 'loading'].includes(check?.status)) {
      setStatus(selector, 'loading', 'Pārbauda PVN statusu VID atvērtajos datos…');
    } else {
      setStatus(selector, null);
      $(selector).textContent = check?.status === 'unsupported'
        ? 'VID pārbaude pieejama tikai Latvijas PVN numuriem.'
        : 'PVN statusa pārbaudei ievadiet PVN vai Latvijas reģistrācijas numuru.';
      $(selector).classList.add('small');
    }
  }
}

function renderEndpointHints() {
  for (const role of ['seller', 'buyer']) {
    const party = state.invoice[role];
    const hint = $(`#hint-${role}-endpoint`);
    const input = $(`#${fieldId(`${role}.endpointId`)}`);
    const endpoint = effectiveEndpoint(party);
    if (endpoint?.derived) {
      hint.textContent = `Tiks izmantots reģistrācijas numurs ${endpoint.id} (shēma ${endpoint.scheme}).`;
      input.placeholder = endpoint.id;
    } else if (!endpoint) {
      hint.textContent = party.country === 'LV'
        ? 'Latvijas uzņēmumiem tiek aizpildīta automātiski no reģistrācijas numura.'
        : 'Norādiet adreses veidu un identifikatoru, uz kuru saņēmējs pieņem e-rēķinus.';
      input.placeholder = '';
    } else {
      hint.textContent = '';
      input.placeholder = '';
    }
  }
}

function categoryName(group) {
  return VAT_CATEGORIES[group.category].label;
}

function renderTotals(result) {
  const { calc } = result;
  const currency = state.invoice.currency || '';
  const rows = calc.breakdown.length
    ? calc.breakdown.map((g) => h('tr', {},
      h('td', {}, categoryName(g)),
      h('td', { class: 'text-end' }, g.rate ? `${toDisplayString(g.rate, 0)}%` : '—'),
      h('td', { class: 'text-end' }, money(g.taxable)),
      h('td', { class: 'text-end' }, money(g.tax))))
    : [h('tr', {}, h('td', { colspan: 4, class: 'text-body-secondary' }, 'Vēl nav pozīciju ar aprēķināmu summu.'))];
  $('#vat-breakdown').replaceChildren(...rows);

  $('#totals-currency').textContent = currency ? `Aprēķināts, ${currency}` : 'Aprēķināts';
  for (const key of ['taxExclusive', 'taxTotal', 'taxInclusive', 'payable']) {
    document.getElementById(`calc-totals.${key}`).textContent = money(calc[key]);
  }

  // Augšupielādētajā dokumentā norādītās kopsummas — tikai salīdzināšanai ar aprēķinātajām.
  const source = state.invoice.source?.totals;
  const hasSource = Boolean(source && Object.values(source).some(Boolean));
  document.querySelectorAll('#totals-table .doc-col').forEach((el) => { el.hidden = !hasSource; });
  if (!hasSource) return;
  const pairs = { totalWithoutVat: 'taxExclusive', totalVat: 'taxTotal', totalWithVat: 'taxInclusive', amountDue: 'payable' };
  for (const [docKey, calcKey] of Object.entries(pairs)) {
    const cell = $(`#doc-${docKey}`);
    const value = parseDecimal(source[docKey] ?? '');
    cell.textContent = value ? toDisplayString(value, 2) : '—';
    cell.classList.toggle('mismatch', result.warnings.some((w) => w.field === `totals.${calcKey}`));
  }
}

function renderRequired() {
  const required = requiredFields(state.invoice);
  for (const label of document.querySelectorAll('[data-label-for]')) {
    const path = label.dataset.labelFor;
    label.classList.toggle('required', required.has(path));
    const control = byData('field', path);
    if (control) control.toggleAttribute('aria-required', required.has(path));
  }
}

function issueVisible(issue) {
  if (issue.alwaysVisible) return true;
  if (state.showAll) return true;
  return [issue.field, ...(issue.alsoFields ?? [])].some((f) => state.touched.has(f)
    || (f.endsWith('.vatRate') && state.touched.has(f.replace('.vatRate', '.vat'))));
}

function focusTarget(path) {
  if (/^lines\.\d+\.vatRate$/.test(path)) {
    const rate = byData('field', path);
    if (rate && !rate.closest('[hidden]')) return rate;
    return byData('field', path.replace(/vatRate$/, 'vat'));
  }
  return byData('field', path) ?? byData('anchor', path);
}

function renderInlineIssues(result) {
  document.querySelectorAll('.is-invalid, .has-warning').forEach((el) => el.classList.remove('is-invalid', 'has-warning'));
  document.querySelectorAll('[data-feedback-for]').forEach((el) => {
    el.textContent = '';
    el.className = 'feedback';
  });
  const mark = (path, kind, message) => {
    const target = focusTarget(path);
    if (target?.matches('input, select, textarea') && !(kind === 'warning' && target.classList.contains('is-invalid'))) {
      target.classList.add(kind === 'error' ? 'is-invalid' : 'has-warning');
    }
    if (target?.id === 'lines-empty') target.classList.add('is-invalid');
    const feedback = byData('feedback-for', path);
    if (feedback && message && !feedback.textContent) {
      feedback.textContent = message;
      feedback.className = kind === 'error' ? 'invalid-feedback d-block' : 'warning-feedback';
    }
  };
  for (const issue of result.errors.filter(issueVisible)) {
    mark(issue.field, 'error', issue.message);
    for (const f of issue.alsoFields ?? []) mark(f, 'error', null);
  }
  for (const issue of result.warnings.filter(issueVisible)) mark(issue.field, 'warning', issue.short ?? issue.message);
  $('#lines-empty').classList.toggle('is-invalid', result.errors.some((e) => e.field === 'lines'));
}

// Kārto kļūdas tādā secībā, kādā lauki izvietoti formā.
function sectionRank(field) {
  const line = /^lines\.(\d+)\./.exec(field);
  if (line) return 40 + Number(line[1]) / 1e4;
  if (field === 'lines') return 40;
  if (field.startsWith('seller.')) return 20;
  if (field.startsWith('payment.')) return 25;
  if (field.startsWith('buyer.')) return 30;
  if (field.startsWith('vatReasons.') || field.startsWith('totals.') || field === 'prepaidAmount') return 50;
  return 10;
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => sectionRank(a.field) - sectionRank(b.field));
}

function sectionName(field) {
  if (field.startsWith('seller.')) return 'Nosūtītājs';
  if (field.startsWith('payment.')) return 'Nosūtītājs — maksājuma rekvizīti';
  if (field.startsWith('buyer.')) return 'Saņēmējs';
  if (field === 'lines') return 'Rēķina pozīcijas';
  if (field.startsWith('lines.')) return `${Number(field.split('.')[1]) + 1}. pozīcija`;
  if (field.startsWith('vatReasons.') || field.startsWith('totals.') || field === 'prepaidAmount') return 'PVN un kopsummas';
  return 'Rēķina pamatinformācija';
}

function issueButton(issue, kind) {
  return h('li', {}, h('button', { type: 'button', class: `issue ${kind}`, dataset: { focusField: issue.field } },
    h('span', { class: 'issue-section' }, sectionName(issue.field)),
    issue.message));
}

function renderValidationPanel(result) {
  const errors = sortIssues(result.errors);
  const warnings = sortIssues(result.warnings);
  const summary = errors.length === 0
    ? h('div', { class: 'validation-ok' }, h('i', { class: 'bi bi-check-circle-fill', 'aria-hidden': 'true' }),
      h('div', {}, 'Dati atbilst e-rēķina prasībām',
        h('div', { class: 'small fw-normal text-body-secondary' },
          warnings.length ? `Pārskatiet ${plural(warnings.length, 'brīdinājumu', 'brīdinājumus')}.` : 'XML var izveidot.')))
    : h('div', { class: 'validation-bad' }, h('i', { class: 'bi bi-x-circle-fill', 'aria-hidden': 'true' }),
      h('div', {}, `Jāizlabo: ${plural(errors.length, 'kļūda', 'kļūdas')}`,
        h('div', { class: 'small fw-normal text-body-secondary' },
          'Noklikšķiniet uz ieraksta, lai pārietu uz attiecīgo lauku.')));
  $('#validation-summary').replaceChildren(summary);

  const items = [...errors.map((e) => issueButton(e, 'error'))];
  if (warnings.length) {
    items.push(h('li', { class: 'issue-group-title' }, 'Brīdinājumi (netraucē XML izveidi)'));
    items.push(...warnings.map((w) => issueButton(w, 'warning')));
  }
  $('#validation-list').replaceChildren(...items);
}

function focusField(path) {
  const target = focusTarget(path);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

function setStatus(selector, kind, message, notes = []) {
  const box = $(selector);
  if (!kind) {
    box.replaceChildren();
    return;
  }
  const icon = { success: 'bi-check-circle', danger: 'bi-exclamation-octagon', warning: 'bi-exclamation-triangle' }[kind];
  box.replaceChildren(h('div', { class: `alert alert-${kind === 'loading' ? 'info' : kind} py-2 px-3 mb-0 small` },
    kind === 'loading'
      ? h('span', { class: 'spinner-border spinner-border-sm me-2', 'aria-hidden': 'true' })
      : h('i', { class: `bi ${icon} me-1`, 'aria-hidden': 'true' }),
    message,
    notes.length ? h('ul', { class: 'mb-0 mt-1 ps-3' }, notes.map((n) => h('li', {}, n))) : null));
}

// ---------- Darbības ----------

function newManualInvoice() {
  const invoice = emptyInvoice();
  invoice.issueDate = todayIso();
  return invoice;
}

function loadInvoice(invoice, { showAll }) {
  vatChecker.reset();
  state.invoice = invoice;
  state.touched = new Set();
  state.showAll = showAll;
  renderLines();
  syncControls();
  update();
  for (const role of ['seller', 'buyer']) vatChecker.schedule(role, invoice[role], { immediate: true });
}

async function handleFile(file) {
  if (!file || state.busy) return;
  if (!ACCEPTED_FILE.test(file.name)) {
    setStatus('#upload-status', 'danger', 'Neatbalstīts faila formāts. Izvēlieties PDF, DOCX, PNG vai JPG failu.');
    return;
  }
  if (file.size === 0) {
    setStatus('#upload-status', 'danger', 'Fails ir tukšs.');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus('#upload-status', 'danger', 'Fails ir pārāk liels. Maksimālais faila izmērs ir 20 MB.');
    return;
  }
  if (state.dirty && !window.confirm('Formā ievadītie dati tiks aizstāti ar datiem no augšupielādētā faila. Turpināt?')) return;

  state.busy = true;
  $('#dropzone').classList.add('busy');
  setStatus('#upload-status', 'loading', `Nolasa failu “${file.name}”… Parasti tas aizņem 5–30 sekundes.`);
  try {
    let response;
    try {
      response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: file,
      });
    } catch {
      throw new Error('Neizdevās sazināties ar serveri. Pārbaudiet, vai lietotnes serveris darbojas.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error ?? 'Neizdevās nolasīt failu. Mēģiniet vēlreiz vai ievadiet datus manuāli.');
    }
    loadInvoice(invoiceFromExtraction(payload.data, file.name), { showAll: true });
    state.dirty = true;
    const notes = [];
    if (payload.data.documentType === 'credit_note') {
      notes.push('Dokuments izskatās pēc kredītrēķina. Šī versija veido tikai rēķinus — pārbaudiet, vai tas ir pareizais dokuments.');
    } else if (payload.data.documentType === 'other') {
      notes.push('Dokuments, iespējams, nav rēķins — rūpīgi pārbaudiet iegūtos datus.');
    }
    const { errors, warnings } = validationWithVat();
    if (errors.length || warnings.length) {
      notes.push(`Pārbaudes rezultāts: ${plural(errors.length, 'kļūda', 'kļūdas')}, ${plural(warnings.length, 'brīdinājums', 'brīdinājumi')} — skatiet sadaļu “Datu pārbaude”.`);
    }
    setStatus('#upload-status', 'success',
      `Dati nolasīti no faila “${file.name}”. Tie ir tikai sākotnējie dati — pārbaudiet un, ja nepieciešams, labojiet visus laukus.`,
      notes);
  } catch (err) {
    setStatus('#upload-status', 'danger', err.message);
  } finally {
    state.busy = false;
    $('#dropzone').classList.remove('busy');
  }
}

function downloadText(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }));
  const link = h('a', { href: url, download: fileName, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateXml() {
  const { errors, warnings } = validationWithVat();
  if (errors.length) {
    state.showAll = true;
    update();
    setStatus('#xml-status', 'danger',
      `E-rēķinu nevar izveidot: datos ir ${plural(errors.length, 'kļūda', 'kļūdas')}. Izlabojiet tās — saraksts ir sadaļā “Datu pārbaude”.`);
    focusField(sortIssues(errors)[0].field);
    return;
  }
  const xml = buildInvoiceXml(state.invoice);
  const fileName = xmlFileName(state.invoice);
  downloadText(xml, fileName);
  setStatus('#xml-status', 'success', `E-rēķins “${fileName}” ir izveidots un lejupielādēts.`,
    warnings.length ? [`Ņemiet vērā ${plural(warnings.length, 'brīdinājumu', 'brīdinājumus')} sadaļā “Datu pārbaude”.`] : []);
}

function startNewInvoice() {
  if (state.dirty && !window.confirm('Visi ievadītie dati tiks dzēsti. Sākt jaunu rēķinu?')) return;
  loadInvoice(newManualInvoice(), { showAll: false });
  state.dirty = false;
  setStatus('#upload-status', null);
  setStatus('#xml-status', null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindEvents() {
  const form = $('#invoice-form');
  form.addEventListener('input', onFieldInput);
  form.addEventListener('change', onFieldInput);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('click', (e) => {
    const button = e.target.closest('[data-check-vat]');
    if (button) vatChecker.schedule(button.dataset.checkVat, state.invoice[button.dataset.checkVat], { force: true, immediate: true });
  });
  form.addEventListener('focusout', (e) => {
    const path = e.target.dataset?.field;
    if (path && !state.touched.has(path)) {
      state.touched.add(path);
      scheduleUpdate();
    }
  });

  $('#lines-body').addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove-line]');
    if (button) removeLine(Number(button.dataset.removeLine));
  });
  $('#btn-add-line').addEventListener('click', addLine);
  $('#validation-list').addEventListener('click', (e) => {
    const button = e.target.closest('[data-focus-field]');
    if (button) focusField(button.dataset.focusField);
  });
  $('#btn-generate').addEventListener('click', generateXml);
  $('#btn-new').addEventListener('click', startNewInvoice);

  const fileInput = $('#file-input');
  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
  const dropzone = $('#dropzone');
  for (const type of ['dragenter', 'dragover']) {
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, () => dropzone.classList.remove('dragover'));
  }
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer?.files?.[0]);
  });
  // Neļauj pārlūkam atvērt failu, ja tas nomests ārpus augšupielādes lauka.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
}

buildStaticForm();
bindEvents();
loadInvoice(newManualInvoice(), { showAll: false });
