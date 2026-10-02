# Saturs

Visi lietotāja saskarnes teksti ir latviešu valodā un paredzēti lietotājam, kurš nepārzina e-rēķina XML tehniskās detaļas.

## Rakstības principi

- Lauku nosaukumi ir tādi, kādus lieto grāmatvedībā un papīra rēķinos; tehniskos kodus (BT-…, UBL elementi, shēmu kodi) saskarnē nerāda. Izņēmums ir e-rēķina adreses veids, kur kods palīdz izvēlēties pareizo shēmu.
- Kļūdu paziņojumi ir pavēles izteiksmē un pasaka, kas jādara: “Norādiet cenu.” Ja prasība nav pašsaprotama, īsi paskaidrots, kāpēc: “… — e-rēķinā jābūt vismaz vienam no tiem.”
- Brīdinājumi skaidri atšķirami no kļūdām un nebloķē XML izveidi.
- Automātiski iegūtie dati vienmēr tiek pasniegti kā sākotnējie dati, kas jāpārbauda.
- Summas saskarnē rāda latviešu formātā (`1 234,56`), ievadē pieņem gan komatu, gan punktu; XML izmanto punktu.

## Terminoloģija

| Saskarnē | Nozīme |
|---|---|
| Nosūtītājs (piegādātājs) | rēķina izrakstītājs, pārdevējs (Seller) |
| Saņēmējs (pircējs) | rēķina saņēmējs, pircējs (Buyer) |
| E-rēķina adrese | elektroniskā adrese, uz kuru saņem e-rēķinus (Endpoint ID) |
| Pircēja atsauce | pircēja norādīts identifikators rēķina apstrādei (Buyer reference) |
| PVN veids | PVN kategorija (S, Z, E, AE, K, G, O) |
| Atbrīvojuma pamatojums | PVN atbrīvojuma iemesls (VAT exemption reason) |
| Apgrieztā maksāšana | reverse charge (AE) |
| Piegāde uz citu ES valsti | Kopienas iekšējā piegāde (K) |
| Neapliek ar PVN | ārpus PVN piemērošanas jomas (O) |
| Avansā samaksāts | iepriekš samaksātā summa (Paid amount) |
| Datu pārbaude | validācija |
