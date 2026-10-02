# Dizains

Lietotnei jābūt vienkāršai, pārskatāmai un piemērotai darbam ar lielu datu daudzumu.

Efektīvi izmanto pieejamo ekrāna vietu.

Lielos satura blokus — piemēram, nosūtītāju, saņēmēju, rēķina datus, pozīcijas un kopsummas — vizuāli skaidri nodali.

Izmanto konsekventas krāsas, atstarpes, tipogrāfiju un Bootstrap komponentus.

Detalizētus dizaina lēmumus dokumentē `docs` mapē.

## Izkārtojums

Lapa ir viena darba forma, nevis soļu vednis — visus datus var redzēt un labot vienlaikus.

- Galvene: lietotnes nosaukums ar versijas numuru un poga “Jauns rēķins”.
- Galvenā kolonna (desktop ¾ platuma) ar numurētām sadaļu kartēm:
  1. Rēķina dokuments (augšupielāde, nav obligāta);
  2. Rēķina pamatinformācija;
  3. Nosūtītājs (piegādātājs) ar maksājuma rekvizītiem un 4. Saņēmējs (pircējs) — blakus;
  5. Rēķina pozīcijas — kompakta tabula ar ievades laukiem;
  6. PVN un kopsummas — PVN sadalījums un kopsummas.
- Sānu panelis (¼ platuma), kas paliek redzams ritinot: 7. Datu pārbaude un 8. E-rēķina XML.

Platumā zem 1200 px sānu panelis atrodas zem formas. Zem 992 px pozīciju tabulas rindas kļūst par kartītēm ar lauku nosaukumiem.

## Vizuālie principi

- Bootstrap 5.3 komponentes (kartes, formas, tabulas, brīdinājumu bloki) un Bootstrap Icons.
- Kompakti lauki (`form-control-sm`) un šauras atstarpes, lai vienā ekrānā redzētu pēc iespējas vairāk datu.
- Tumši zila galvene un sadaļu numuri; krāsas ar vienotu nozīmi: sarkana — kļūda (bloķē XML), dzeltena — brīdinājums (nebloķē), zaļa — veiksmīga darbība.
- Summas tabulās ir izlīdzinātas pa labi ar vienāda platuma cipariem.

## Obligātie lauki un kļūdas

- Obligātie lauki ir atzīmēti ar sarkanu zvaigznīti. Zvaigznītes tiek atjaunotas atkarībā no datiem (piem., IBAN ir obligāts pārskaitījumam, PVN atbrīvojuma pamatojums — ja ir atbrīvotas pozīcijas). Pāriem “vismaz viens no abiem” zvaigznīte redzama, kamēr neviens nav aizpildīts.
- Kļūda pie lauka parādās, kad lietotājs lauku ir atstājis, pēc augšupielādes vai pēc XML izveides mēģinājuma — lai, sākot ievadi no jauna, forma nebūtu pilna ar sarkaniem laukiem.
- Sānu panelī vienmēr ir pilns kļūdu un brīdinājumu saraksts formas secībā; klikšķis uz ieraksta pāriet uz lauku.
- Automātiski iegūtās kopsummas tiek rādītas kolonnā “Dokumentā” blakus aprēķinātajām; neatbilstības ir izceltas.
