# E-rēķina struktūra

Lietotne veido UBL 2.1 `Invoice` dokumentu atbilstoši Peppol BIS Billing 3.0 (EN 16931). Ģenerators ir `source/public/js/ubl.js`; elementu secība atbilst Peppol UBL Invoice sintaksei, struktūra un formatējums (tabulācijas atkāpes, nosaukumvietas, skaitļu formāts) — piemēram `examples/e-rekins_A.xml`.

Fiksētās vērtības:

- `cbc:CustomizationID` = `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0`
- `cbc:ProfileID` = `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`

## Lauku atbilstība

| Forma | EN16931 | UBL |
|---|---|---|
| Rēķina numurs, datums, apmaksas termiņš | BT-1, BT-2, BT-9 | `cbc:ID`, `cbc:IssueDate`, `cbc:DueDate` |
| Dokumenta veids | BT-3 | `cbc:InvoiceTypeCode` (380 rēķins, 386 avansa rēķins) |
| Piezīmes | BT-22 | `cbc:Note` |
| Valūta | BT-5 | `cbc:DocumentCurrencyCode`, visi `currencyID` |
| Pircēja atsauce, pasūtījuma nr., līguma nr. | BT-10, BT-13, BT-12 | `cbc:BuyerReference`, `cac:OrderReference/cbc:ID`, `cac:ContractDocumentReference/cbc:ID` |
| E-rēķina adrese | BT-34, BT-49 | `cbc:EndpointID@schemeID` |
| Reģistrācijas numurs | BT-29/30, BT-46/47 | `cac:PartyIdentification/cbc:ID` (tikai LV), `cac:PartyLegalEntity/cbc:CompanyID` |
| Nosaukums | BT-27/28, BT-44/45 | `cac:PartyLegalEntity/cbc:RegistrationName` un `cac:PartyName/cbc:Name` |
| PVN numurs | BT-31, BT-48 | `cac:PartyTaxScheme` ar `cac:TaxScheme/cbc:ID` = `VAT` |
| Adrese | BT-35, BT-37, BT-38, BT-40 (un pircējam atbilstošie) | `cbc:StreetName`, `cbc:CityName`, `cbc:PostalZone`, `cac:Country/cbc:IdentificationCode` |
| Piegādes datums, valsts | BT-72, BT-80 | `cac:Delivery/cbc:ActualDeliveryDate`, `.../cac:DeliveryLocation/cac:Address/cac:Country` |
| Maksājuma veids, IBAN, BIC | BT-81, BT-84, BT-86 | `cac:PaymentMeans` |
| Apmaksas noteikumi | BT-20 | `cac:PaymentTerms/cbc:Note` |
| PVN sadalījums | BG-23 | `cac:TaxTotal/cac:TaxSubtotal` (katrai kategorijai un likmei) |
| Kopsummas, avanss | BG-22, BT-113 | `cac:LegalMonetaryTotal` |
| Pozīcijas | BG-25 | `cac:InvoiceLine` |

## Lēmumi

- **Latvijas puses identifikatori.** Ja e-rēķina adrese nav norādīta, Latvijas uzņēmumam to veido no reģistrācijas numura ar shēmu `0218` (ISO 6523 ICD — Latvijas vienotais reģistrācijas numurs), tāpat kā piemērā. Ar to pašu shēmu tiek norādīts `PartyIdentification` un `PartyLegalEntity/CompanyID`. Ārvalstu pusei e-rēķina adreses veids un identifikators jānorāda.
- **Pārdevējs, kas nav PVN maksātājs.** Latvijas pārdevējam bez PVN numura reģistrācijas numurs tiek norādīts kā nodokļu maksātāja reģistrācijas kods (BT-32) otrā `PartyTaxScheme` ar nodokļu shēmas ID `!=VAT`. Specifikācija prasa jebkuru vērtību, kas nav `VAT`; izmantota tā pati vērtība kā piemērā, un tā iziet oficiālo validāciju.
- **Dokumenta veids.** Piemērā izmantots kods 80 (UNTDID 1001: debeta paziņojums). Parastam rēķinam lietotne izmanto 380 (komercrēķins), kas ir specifikācijas piemēra vērtība; avansa rēķinam — 386.
- **Adrese.** Piemērā visa adrese ir vienā `cac:AddressLine` (BT-162 “adreses 3. rinda”). Lietotne izmanto strukturētus laukus iela/pilsēta/indekss, kas ir specifikācijā paredzētie pamatlauki un ērtāk apstrādājami saņēmējam.
- **Nosaukumi.** `PartyName/cbc:Name` satur to pašu juridisko nosaukumu, kā piemērā.
- **PVN.** Kategorijas S (ar likmi), Z, E, AE, K, G, O. Kategorijām AE, K, G, O tiek pievienots VATEX kods (`VATEX-EU-AE`, `VATEX-EU-IC`, `VATEX-EU-G`, `VATEX-EU-O`) un, ja ievadīts, pamatojuma teksts; kategorijai E pamatojuma teksts ir obligāts. Kategorijai O likme netiek norādīta.
- **Summas un noapaļošana.** Pozīcijas summa = daudzums × cena, noapaļota līdz centiem (puse prom no nulles); PVN aprēķina katrai kategorijai un likmei no apliekamās summas. Summām — 2 zīmes aiz komata; cenā un daudzumā var būt vairāk zīmju. Daudzums un cena tiek rakstīti ar vismaz 2 zīmēm aiz komata un `cbc:BaseQuantity` = `1.00`, kā piemērā. `cbc:PrepaidAmount` tiek iekļauts vienmēr (arī 0.00).
- **Atlaides.** Atlaidi var norādīt kā pozīciju ar negatīvu daudzumu (cena nedrīkst būt negatīva).
- **Maksājums.** `cac:PayeeFinancialAccount` tiek iekļauts tikai pārskaitījumam (kodi 30, 58); skaidrā naudā (10) un ar karti (48) — tikai maksājuma veida kods.
- **Teksti.** Tukši elementi netiek veidoti (PEPPOL-EN16931-R008); XML neatļautās vadības rakstzīmes tiek izņemtas; `&`, `<`, `>` tiek aizstāti.

## Nav iekļauts pirmajā versijā

Kredītrēķins (UBL `CreditNote`), atsauce uz iepriekšējo rēķinu, dokumenta un pozīciju līmeņa atlaides/uzcenojumi (`AllowanceCharge`), rēķina periods, pielikumi, vairāki bankas konti, maksājuma saņēmējs (Payee), nodokļu pārstāvis, PVN uzskaites valūta (BT-6), pozīciju apraksti un identifikatori, kontaktpersonas.
