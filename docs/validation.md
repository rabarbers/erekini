# Validācija

E-rēķina korektumu nosaka determinēta validācijas loģika, nevis OpenAI atbilde.

Pārbaudi obligātos laukus, datu formātus, aprēķinus un e-rēķina specifikācijas prasības.

Validācijas kļūdām jābūt saprotamām un, ja iespējams, sasaistītām ar konkrēto ievades lauku.

## Principi

- Validācija ir `source/public/js/validation.js` (`validateInvoice`). To izmanto lietotāja saskarne un testi; XML ģenerators to izpilda vēlreiz un nerada XML, ja ir kļūdas.
- Rezultātā ir divu veidu ieraksti:
  - **kļūda** — dati neatbilst e-rēķina prasībām vai nav derīgi; XML izveide nav iespējama;
  - **brīdinājums** — dati ir derīgi, bet, iespējams, nepareizi (piem., neatbilst augšupielādētajam dokumentam); XML izveidi nebloķē.
- Katram ierakstam ir lauka ceļš (piem., `seller.vatNo`, `lines.2.price`), paziņojums latviešu valodā un, ja iespējams, EN16931/Peppol noteikuma ID.
- Summas netiek ievadītas — tās aprēķina no pozīcijām (`calculate` failā `invoice.js`), tāpēc XML vienmēr atbilst aprēķinu noteikumiem BR-CO-10…16, BR-S-08/09, PEPPOL-EN16931-R120.

## Pārbaudes

**Rēķins:** numurs (BR-02), datums (BR-03), datumu formāts un eksistence (PEPPOL-EN16931-F001), dokumenta veids (P0100), valūta (BR-05, BR-CL-04), pircēja atsauce vai pasūtījuma numurs (PEPPOL-EN16931-R003), apmaksas termiņš vai noteikumi, ja summa apmaksai > 0 (BR-CO-25). Brīdinājums, ja apmaksas termiņš ir agrāks par rēķina datumu.

**Puses:** nosaukums (BR-06, BR-07), valsts (BR-09, BR-11, BR-CL-14), pārdevēja identifikators (BR-CO-26), PVN numura valsts prefikss (BR-CO-09) un formāts, e-rēķina adrese (PEPPOL-EN16931-R010/R020, BR-62/63, BR-CL-25) un tās formāts shēmām 0218, 0088, 0192, 0184, 0208, 0007 (PEPPOL-COMMON-R040…R049). Latvijas reģistrācijas numuram — 11 cipari (kļūda) un kontrolcipars (brīdinājums); Latvijas PVN numuram — `LV` + 11 cipari. Brīdinājums, ja nav adreses.

**Maksājums:** maksājuma veids (BR-49), IBAN pārskaitījumam (BR-61), IBAN kontrolcipari un Latvijas IBAN garums, IBAN SEPA pārskaitījumam, BIC formāts.

**Pozīcijas:** vismaz viena pozīcija (BR-16), nosaukums (BR-25), daudzums (BR-22), mērvienība (BR-23), cena (BR-26) un tās nenegativitāte (BR-27), PVN veids (BR-CO-04), standarta likme > 0 (BR-S-05) un ≤ 100.

**PVN kategorijas:**

| Kategorija | Prasības |
|---|---|
| S, Z, E, AE | pārdevēja PVN numurs vai nodokļu maksātāja numurs (BR-x-02) |
| K, G | pārdevēja PVN numurs (BR-IC-02, BR-G-02) |
| AE | pircēja PVN vai reģistrācijas numurs (BR-AE-02) |
| K | pircēja PVN numurs (BR-IC-02), piegādes datums (BR-IC-11) un valsts (BR-IC-12) |
| E | atbrīvojuma pamatojuma teksts (BR-E-10) |
| AE, K, G, O | atbrīvojuma kods tiek pievienots automātiski (BR-AE-10, BR-IC-10, BR-G-10, BR-O-10) |
| O | nav PVN numuru (BR-O-02) un citu kategoriju (BR-O-11…14) |

Brīdinājums, ja rēķinā ir PVN ar likmi, bet pārdevējam nav PVN numura.

**VID PVN statuss:** atsevišķa servera pārbaude abām Latvijas pusēm; par datu avotu un pieprasījumu skatīt `architecture.md`. Ja ievadītais PVN numurs nav aktīvs vai nav atrodams VID atvērtajos datos, saskarne rāda brīdinājumu pie PVN lauka un pārbaudes panelī. Pakalpojuma kļūme ir brīdinājums par neizdevušos pārbaudi. Aktīvam Latvijas numuram, kas atšķiras no norādītā reģistrācijas numura, rāda neatbilstības brīdinājumu. Šie brīdinājumi nebloķē XML: pārbaude rāda pašreizējo publicēto statusu, kas var atšķirties no statusa rēķina datumā. PVN numura esamība un tā formāts joprojām pakļauti determinētajiem e-rēķina noteikumiem. Automātiska aizpildīšana nemaina pozīciju PVN veidus; ja pievienotais numurs neatbilst tiem (piem., O kategorijai), to norāda esošā validācija.

**Kopsummas:** avansa summa — skaitlis, nav negatīva, līdz 2 zīmēm aiz komata (BR-DEC-16).

## OpenAI rezultātu pārbaude

OpenAI iegūtie dati ir tikai sākotnējie formas dati; uz tiem attiecas visas iepriekš minētās pārbaudes. Papildus:

- nederīgas vērtības netiek pārnestas formā (neeksistējošs datums, nezināms valūtas, valsts, mērvienības vai PVN kods) — tās lietotājam jāievada pašam;
- katras pozīcijas aprēķinātā summa tiek salīdzināta ar dokumentā norādīto, un kopsummas (bez PVN, PVN, ar PVN, apmaksai) — ar dokumenta kopsummām; neatbilstība ir brīdinājums pie attiecīgās pozīcijas vai kopsummas;
- reģistrācijas un PVN numuru kontrolcipari un IBAN kontrolcipari atklāj nepareizi nolasītus ciparus.

## Kā pārbaudīta atbilstība specifikācijai

- `npm test` pārbauda validācijas noteikumus, aprēķinus un XML (tai skaitā salīdzinājumu ar `examples/e-rekins_A.xml`).
- Izstrādes laikā ģenerētie XML (piemēra dati un scenāriji ar kategorijām S, Z, E, AE, K, G, O, vairākām likmēm, noapaļošanu, ārvalstu pircēju, speciālām rakstzīmēm, avansa un negatīvu rēķinu) tika pārbaudīti ar oficiālajiem Peppol BIS Billing 3.0.20 validācijas artefaktiem: UBL 2.1 XSD, `CEN-EN16931-UBL.sch` un `PEPPOL-EN16931-UBL.sch` (SchXslt + Saxon-HE). Visi izturēja pārbaudi bez kļūdām un brīdinājumiem; tika pārbaudīts arī, ka oficiālie noteikumi noraida datus, kurus noraida šīs lietotnes validācija (piem., nederīgs GLN).
- Artefakti: https://github.com/OpenPEPPOL/peppol-bis-invoice-3/tree/master/rules/sch un https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/. Mainot XML struktūru vai validāciju, ieteicams pārbaudi atkārtot.
