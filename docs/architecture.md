# Arhitektūra

Lietotnei jābūt pēc iespējas vienkāršai un izmantojamai bez papildu programmatūras instalēšanas.

Frontend izmanto HTML, CSS, JavaScript un Bootstrap 5.3:
https://getbootstrap.com/docs/5.3/getting-started/introduction/

OpenAI API izsaukumus veic servera pusē.

Lokālās izstrādes laikā OpenAI API atslēgu glabā projekta saknes failā `ApiKey.txt`. Šo failu nedrīkst iekļaut Git repozitorijā, un tam jābūt norādītam `.gitignore`.

`ApiKey.txt` nedrīkst atrasties publiski servētajā frontend mapē vai būt pieejams pārlūka JavaScript kodam.

Automātiski iegūtos OpenAI datus uzskati par nepārbaudītiem datiem. Pirms XML ģenerēšanas tos validē neatkarīgi no OpenAI rezultāta.

## Komponentes

Lietotne sastāv no neliela Node.js servera un statiskas pārlūka lietotnes. Nav npm atkarību, datubāzes vai būvēšanas soļa.

```
source/
  server.js                 HTTP serveris: pasniedz public/ un apstrādā POST /api/extract
  server/extract.js         OpenAI Responses API izsaukums, faila veida noteikšana, kļūdu paziņojumi
  server/extraction-schema.js  strukturētās izvades JSON shēma un norādījumi modelim
  public/                   vienīgā publiski pasniegtā mape
    index.html, css/app.css
    js/app.js               lietotāja saskarne (DOM, notikumi, attēlošana)
    js/invoice.js           datu modelis, aprēķini, OpenAI datu pārnešana formā
    js/validation.js        determinētā validācija
    js/ubl.js               e-rēķina XML ģenerēšana
    js/codelists.js         kodu saraksti
    js/decimal.js           precīza decimālaritmētika (BigInt)
  test/                     automātiskie testi (node --test)
  tools/extract-examples.js datu iegūšanas pārbaude ar examples mapes piemēriem
```

Moduļi `invoice.js`, `validation.js`, `ubl.js`, `codelists.js` un `decimal.js` ir tīri ES moduļi bez DOM un Node.js API. Tos izmanto gan pārlūks, gan testi, tāpēc validācija un XML ģenerēšana ir vienuviet.

## Datu plūsma

1. Lietotājs augšupielādē PDF, DOCX, PNG vai JPG failu (līdz 20 MB). Pārlūks to nosūta uz `POST /api/extract` kā bināru saturu; faila nosaukums ir galvenē `X-File-Name`.
2. Serveris nosaka faila veidu pēc satura (nevis pēc nosaukuma), nolasa API atslēgu un izsauc OpenAI Responses API.
3. Serveris atgriež modeļa strukturēto JSON. Pārlūks to pārnes formā (`invoiceFromExtraction`) — nederīgas vērtības (piem., neeksistējošs datums, nezināms kods) netiek pieņemtas.
4. Katrā izmaiņā pārlūks pārrēķina summas un izpilda validāciju (`validateInvoice`). Kļūdas un brīdinājumi tiek parādīti pie laukiem un sānu panelī.
5. XML tiek izveidots pārlūkā (`buildInvoiceXml`) un lejupielādēts. Funkcija pati vēlreiz izpilda validāciju un atsakās veidot XML, ja ir kļūdas.

Manuālā ievadē 1.–3. solis tiek izlaists. Rēķina dati netiek saglabāti ne serverī, ne pārlūkā.

## OpenAI datu iegūšana

- API: `POST https://api.openai.com/v1/responses` ar strukturēto izvadi (`text.format.type = json_schema`, `strict: true`).
- PDF un DOCX tiek nosūtīti kā `input_file` (DOCX gadījumā OpenAI izmanto dokumenta tekstu), PNG un JPG — kā `input_image` ar `detail: high`.
- Noklusējuma modelis ir `gpt-5.5` ar `reasoning.effort = low`. Salīdzinājumā ar `gpt-5.4-mini` un `gpt-5.4` tas bija visprecīzākais skenētos attēlos pie līdzīga ātruma (5–8 s). Modeli var mainīt ar vides mainīgo `OPENAI_MODEL`.
- `store: false` — dokumenta saturs netiek saglabāts OpenAI pusē.
- Modelim norādīts kopēt tikai dokumentā redzamās vērtības un neaprēķināt kopsummas; kopsummas tiek izmantotas tikai iegūto pozīciju pārbaudei.
- OpenAI kļūdas (nederīga atslēga, limits, pakalpojuma kļūme, noildze) tiek pārvērstas latviešu valodas paziņojumos; tehniskā informācija tiek rakstīta tikai servera žurnālā.

## Drošība

- API atslēgu lasa tikai serveris no `ApiKey.txt` projekta saknē vai vides mainīgā `OPENAI_API_KEY`. Atslēga tiek sūtīta tikai OpenAI `Authorization` galvenē.
- Serveris pasniedz tikai failus no `source/public` ar atļautiem paplašinājumiem; ceļi ārpus šīs mapes (arī kodēti `..`) atgriež 404.
- Atbildēm ir `Content-Security-Policy` (skripti tikai no pašas lietotnes, stili un fonti arī no `cdn.jsdelivr.net`), `X-Content-Type-Options` un `Referrer-Policy` galvenes. Bootstrap tiek ielādēts no jsDelivr ar SRI kontrolsummām.
- Serveris pēc noklusējuma klausās tikai `127.0.0.1`.

## Palaišana un testi

Nepieciešams Node.js 20 vai jaunāks.

```
cd source
npm start                  # http://127.0.0.1:3000
npm test                   # automātiskie testi
npm run extract-examples   # OpenAI iegūšanas pārbaude ar examples/*.pdf (maksas API izsaukumi)
```

Vides mainīgie: `PORT` (3000), `HOST` (127.0.0.1), `OPENAI_MODEL` (gpt-5.5), `OPENAI_API_KEY` (aizstāj `ApiKey.txt`).
