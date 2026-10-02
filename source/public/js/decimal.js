// Precīza decimālskaitļu aritmētika naudas summām un daudzumiem.
// Vērtība ir objekts { n: BigInt, s: number }, kas nozīmē n / 10^s.
// Peldošā punkta skaitļi netiek izmantoti, lai aprēķini būtu determinēti.

const DECIMAL_RE = /^[+-]?\d+(?:[.,]\d+)?$/;

export const ZERO = Object.freeze({ n: 0n, s: 0 });

function pow10(k) {
  return 10n ** BigInt(k);
}

function numberToPlainString(x) {
  const str = String(x);
  return /e/i.test(str) ? x.toFixed(12).replace(/\.?0+$/, '') : str;
}

// Pieņem "1234.56", "1234,56", "1 234,56", "-5". Atgriež null, ja vērtība nav skaitlis.
export function parseDecimal(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    input = numberToPlainString(input);
  }
  if (typeof input !== 'string') return null;
  const compact = input.trim().replace(/[\s  ]/g, '');
  if (!DECIMAL_RE.test(compact)) return null;
  const unsigned = compact.replace(/^[+-]/, '').replace(',', '.');
  const [intPart, frac = ''] = unsigned.split('.');
  const n = BigInt(intPart + frac);
  return { n: compact.startsWith('-') ? -n : n, s: frac.length };
}

function align(a, b) {
  const s = Math.max(a.s, b.s);
  return [a.n * pow10(s - a.s), b.n * pow10(s - b.s), s];
}

export function add(a, b) {
  const [x, y, s] = align(a, b);
  return { n: x + y, s };
}

export function sub(a, b) {
  const [x, y, s] = align(a, b);
  return { n: x - y, s };
}

export function mul(a, b) {
  return { n: a.n * b.n, s: a.s + b.s };
}

export function cmp(a, b) {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sum(values) {
  return values.reduce((acc, v) => add(acc, v), ZERO);
}

// Noapaļo līdz `scale` zīmēm aiz komata (puse prom no nulles, kā komercaprēķinos).
export function round(a, scale) {
  if (a.s <= scale) return { n: a.n * pow10(scale - a.s), s: scale };
  const f = pow10(a.s - scale);
  const neg = a.n < 0n;
  const abs = neg ? -a.n : a.n;
  let q = abs / f;
  if ((abs % f) * 2n >= f) q += 1n;
  return { n: neg ? -q : q, s: scale };
}

// Procenti no summas: amount * percent / 100, noapaļots līdz 2 zīmēm.
export function percentOf(amount, percent) {
  const product = mul(amount, percent);
  return round({ n: product.n, s: product.s + 2 }, 2);
}

// Skaitļu zīmju skaits aiz komata, neskaitot beigu nulles.
export function significantScale(a) {
  let { n, s } = a;
  while (s > 0 && n % 10n === 0n) {
    n /= 10n;
    s -= 1;
  }
  return s;
}

// Teksts ar punktu kā decimāldaļas atdalītāju (XML formātam).
// Rāda vismaz `minScale` zīmes aiz komata; liekās beigu nulles noņem.
export function toPlainString(a, minScale = 0) {
  let { n, s } = a;
  while (s > minScale && n % 10n === 0n) {
    n /= 10n;
    s -= 1;
  }
  if (s < minScale) {
    n *= pow10(minScale - s);
    s = minScale;
  }
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(s + 1, '0');
  const text = s > 0 ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits;
  return neg ? `-${text}` : text;
}

// Teksts ievades laukam: "1234,5" (decimālkomats, bez tūkstošu atdalītājiem).
export function toInputString(a, minScale = 0) {
  return toPlainString(a, minScale).replace('.', ',');
}

// Teksts lietotāja saskarnei: "1 234,56" (latviešu formāts).
export function toDisplayString(a, minScale = 2) {
  const plain = toPlainString(a, minScale);
  const neg = plain.startsWith('-');
  const [intPart, frac] = plain.replace('-', '').split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}
