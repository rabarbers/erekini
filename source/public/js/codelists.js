// Kodu saraksti. Vērtības ņemtas no Peppol BIS Billing 3.0 (3.0.20) validācijas noteikumiem.
// Mērvienības un e-adreses shēmas ir apzināti izvēlēta, bieži lietota apakškopa no oficiālajiem sarakstiem.

// ISO 3166-1 alpha-2 (Peppol noteikums BR-CL-14)
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW 1A XI'
).split(' ');

// Valstis, kuras izvēlnē rāda pirmās
export const PREFERRED_COUNTRIES = ['LV', 'LT', 'EE'];

// PVN numura prefiksi (BR-CO-09): valstu kodi un Grieķijas "EL"
export const VAT_PREFIXES = new Set([...COUNTRY_CODES, 'EL']);

// ISO 4217 (Peppol noteikums BR-CL-04)
export const CURRENCY_CODES = (
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF ' +
  'CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ ' +
  'GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD ' +
  'MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG ' +
  'QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STD SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS ' +
  'UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XTS XUA ' +
  'YER ZAR ZMW ZWG XXX CNH'
).split(' ');

export const PREFERRED_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'PLN', 'CHF'];

// Dokumenta veids (UNTDID 1001, Peppol noteikums PEPPOL-EN16931-P0100)
export const INVOICE_TYPES = [
  { code: '380', label: 'Rēķins' },
  { code: '386', label: 'Avansa (priekšapmaksas) rēķins' },
];

// Mērvienības (UN/ECE Rec. 20/21, Peppol noteikums BR-CL-23)
export const UNITS = [
  { code: 'H87', label: 'gab. (gabals)' },
  { code: 'C62', label: 'vien. (vienība)' },
  { code: 'E48', label: 'pakalpojuma vienība' },
  { code: 'LS', label: 'kopsumma (vienreizējs maksājums)' },
  { code: 'SET', label: 'kompl. (komplekts)' },
  { code: 'PR', label: 'pāris' },
  { code: 'XPK', label: 'iepakojums' },
  { code: 'HUR', label: 'h (stunda)' },
  { code: 'MIN', label: 'min (minūte)' },
  { code: 'DAY', label: 'd (diena)' },
  { code: 'WEE', label: 'nedēļa' },
  { code: 'MON', label: 'mēn. (mēnesis)' },
  { code: 'ANN', label: 'gads' },
  { code: 'KGM', label: 'kg (kilograms)' },
  { code: 'GRM', label: 'g (grams)' },
  { code: 'TNE', label: 't (tonna)' },
  { code: 'MTR', label: 'm (metrs)' },
  { code: 'KMT', label: 'km (kilometrs)' },
  { code: 'MTK', label: 'm² (kvadrātmetrs)' },
  { code: 'MTQ', label: 'm³ (kubikmetrs)' },
  { code: 'LTR', label: 'l (litrs)' },
  { code: 'KWH', label: 'kWh (kilovatstunda)' },
];

// Maksājuma veids (UNCL 4461)
export const PAYMENT_MEANS = [
  { code: '30', label: 'Bankas pārskaitījums', requiresAccount: true },
  { code: '58', label: 'SEPA pārskaitījums', requiresAccount: true, requiresIban: true },
  { code: '10', label: 'Skaidrā naudā', requiresAccount: false },
  { code: '48', label: 'Maksājumu karte', requiresAccount: false },
];

// E-rēķina adreses (EndpointID) shēmas (CEF EAS saraksts, Peppol noteikums BR-CL-25)
export const ENDPOINT_SCHEMES = [
  { code: '0218', label: 'Latvija — uzņēmuma reģistrācijas numurs' },
  { code: '9939', label: 'Latvija — PVN numurs' },
  { code: '0200', label: 'Lietuva — uzņēmuma kods' },
  { code: '9937', label: 'Lietuva — PVN numurs' },
  { code: '0191', label: 'Igaunija — reģistrācijas kods' },
  { code: '9931', label: 'Igaunija — PVN numurs' },
  { code: '0212', label: 'Somija — organizācijas identifikators' },
  { code: '0216', label: 'Somija — OVT kods' },
  { code: '0007', label: 'Zviedrija — organizācijas numurs' },
  { code: '0192', label: 'Norvēģija — organizācijas numurs' },
  { code: '0184', label: 'Dānija — CVR numurs' },
  { code: '9930', label: 'Vācija — PVN numurs' },
  { code: '0204', label: 'Vācija — Leitweg-ID' },
  { code: '0208', label: 'Beļģija — uzņēmuma numurs' },
  { code: '0106', label: 'Nīderlande — KvK numurs' },
  { code: '0009', label: 'Francija — SIRET numurs' },
  { code: '0088', label: 'GLN (GS1 atrašanās vietas numurs)' },
  { code: '0060', label: 'DUNS numurs' },
  { code: '0199', label: 'LEI kods' },
];

// Latvijas uzņēmumu reģistrācijas numura shēma (ISO 6523 ICD 0218), izmantota arī piemērā examples/e-rekins_A.xml
export const LV_REGISTRATION_SCHEME = '0218';

// PVN kategorijas (UNCL 5305) un ar tām saistītās EN16931 prasības.
//   rate: 'positive' — likme > 0; 'zero' — likme 0; 'none' — likmi nenorāda
//   sellerId: 'vatOrTax' — pārdevēja PVN numurs vai nodokļu maksātāja numurs (BT-31/BT-32); 'vat' — tikai PVN numurs
//   buyerId: 'vatOrLegal' — pircēja PVN vai reģistrācijas numurs; 'vat' — pircēja PVN numurs
//   exemption: 'forbidden' | 'required'; vatex — automātiski pievienotais atbrīvojuma kods
export const VAT_CATEGORIES = {
  S: { label: 'PVN ar likmi', rate: 'positive', sellerId: 'vatOrTax', exemption: 'forbidden' },
  Z: { label: '0% (nulles likme)', rate: 'zero', sellerId: 'vatOrTax', exemption: 'forbidden' },
  E: { label: 'Atbrīvots no PVN', rate: 'zero', sellerId: 'vatOrTax', exemption: 'required' },
  AE: { label: 'Apgrieztā maksāšana', rate: 'zero', sellerId: 'vatOrTax', buyerId: 'vatOrLegal', exemption: 'required', vatex: 'VATEX-EU-AE' },
  K: { label: 'Piegāde uz citu ES valsti', rate: 'zero', sellerId: 'vat', buyerId: 'vat', exemption: 'required', vatex: 'VATEX-EU-IC' },
  G: { label: 'Eksports ārpus ES', rate: 'zero', sellerId: 'vat', exemption: 'required', vatex: 'VATEX-EU-G' },
  // BR-O-02, BR-O-11..14: pārdevēja un pircēja PVN numuri nav atļauti, citas kategorijas rēķinā nav atļautas
  O: { label: 'Neapliek ar PVN', rate: 'none', exemption: 'required', vatex: 'VATEX-EU-O', exclusive: true },
};

export const VAT_CATEGORY_ORDER = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O'];

// PVN izvēles pozīciju tabulā. Vērtība "S:citi" nozīmē standarta kategoriju ar lietotāja ievadītu likmi.
export const VAT_OPTIONS = [
  { value: 'S:21', label: '21%', category: 'S', rate: '21' },
  { value: 'S:12', label: '12%', category: 'S', rate: '12' },
  { value: 'S:5', label: '5%', category: 'S', rate: '5' },
  { value: 'S:citi', label: 'Cita likme…', category: 'S', rate: null },
  { value: 'Z', label: VAT_CATEGORIES.Z.label, category: 'Z', rate: '0' },
  { value: 'E', label: VAT_CATEGORIES.E.label, category: 'E', rate: '0' },
  { value: 'AE', label: VAT_CATEGORIES.AE.label, category: 'AE', rate: '0' },
  { value: 'K', label: VAT_CATEGORIES.K.label, category: 'K', rate: '0' },
  { value: 'G', label: VAT_CATEGORIES.G.label, category: 'G', rate: '0' },
  { value: 'O', label: VAT_CATEGORIES.O.label, category: 'O', rate: null },
];
