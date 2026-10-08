# E-rēķinu ģenerēšanas rīks

## Mērķis

Izveidot tīmekļa lietotni, kas ļauj lietotājam augšupielādēt rēķinu PDF, DOCX, PNG vai JPG formātā, automātiski iegūt tā strukturētos datus, tos pārbaudīt un labot, un beigās iegūt validētu e-rēķina XML failu.

Lietotājam jābūt iespējai rēķina datus ievadīt arī manuāli.

## Tava loma

Veic e-rēķinu ģenerēšanas tīmekļa lietotnes izstrādi, uzturēšanu un testēšanu.

Uzturi arī `AGENTS.md`. Tajā glabā tikai projekta galvenos un ilgtermiņā aktuālos principus. Detalizētāku dokumentāciju glabā `docs` mapē.

Pirms izmaiņu veikšanas izlasi uzdevumam atbilstošo dokumentāciju `docs` mapē.

## Galvenie lietošanas scenāriji

1. Lietotājs augšupielādē rēķinu, pārbauda un labo automātiski iegūtos datus un ģenerē e-rēķina XML.
2. Lietotājs pats ievada rēķina datus un ģenerē e-rēķina XML.
3. Ja dati nav korekti, skaidri norādi problemātisko lauku un kļūdas iemeslu.

Obligātos laukus atzīmē kā obligātus. Neģenerē e-rēķinu kā korektu, ja tas neatbilst validācijas prasībām.

## Projekta informācija

* E-rēķina specifikācija: https://docs.peppol.eu/poacc/billing/3.0/
* Strukturēto datu iegūšanai no augšupielādētajiem rēķiniem izmanto OpenAI API.
* Latvijas pušu PVN statusu pārbauda VID atvērtajos datos. PVN numuru automātiski aizpilda tikai no aktīva reģistra ieraksta, nevis pieņemot, ka tas ir `LV` un reģistrācijas numurs.

## Projekta struktūra

* `docs` — projekta dokumentācija
* `source` — tīmekļa lietotnes kods
  * `source/public` — pārlūka lietotne; vienīgā publiski pasniegtā mape
  * `source/server` — servera kods (OpenAI izsaukumi)
  * `source/test` — automātiskie testi
* `ApiKey.txt` — lokālai izstrādei izmantotā OpenAI API atslēga; failu nedrīkst iekļaut Git repozitorijā

Palaišana: `cd source && npm start`. Testi: `npm test` (mapē `source`).

## Saturs

Lietotāja saskarnei jābūt latviešu valodā.

Tekstiem jābūt vienkāršiem un saprotamiem lietotājam, kurš nepārzina e-rēķina XML tehniskās detaļas.

Skatīt [docs/content.md](docs/content.md).

## Arhitektūra

Skatīt [docs/architecture.md](docs/architecture.md).

## E-rēķina struktūra

Skatīt [docs/e-invoice.md](docs/e-invoice.md).

## Dizains

Skatīt [docs/design.md](docs/design.md).

## Validācija

Skatīt [docs/validation.md](docs/validation.md).

## E-rēķinu piemēri

Derīgu e-rēķinu piemēri atrodas mapē `examples`.
Izmanto tos, lai saprastu e-rēķinu struktūru, izstrādātu un pārbaudītu XML ģenerēšanu un veidotu testus.
PDF fails ar tādu pašu nosaukumu kā XML fails ir tā paša rēķina cilvēklasāmā versija. To var izmantot kā augšupielādes ievaddatus, testējot datu iegūšanu un XML ģenerēšanu.
Piemēri neaizstāj e-rēķina specifikāciju. Ja piemērs un specifikācija šķiet pretrunīgi, par autoritatīvu uzskati specifikāciju.

## Izmaiņu veikšana

Veicot izmaiņas:

* dizainā — pārbaudi, vai jāatjaunina dizaina dokumentācija;
* saturā — pārbaudi, vai jāatjaunina satura dokumentācija;
* arhitektūrā — pārbaudi, vai jāatjaunina arhitektūras dokumentācija;
* e-rēķina struktūrā vai validācijā — pārbaudi, vai jāatjaunina attiecīgā dokumentācija un testi.

Dokumentē būtiskus projekta lēmumus, nevis katru nelielu implementācijas detaļu.
