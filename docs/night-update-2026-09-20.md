# Nattoppdatering 20. september 2026

## Målet

Finne nye konsepter med målbar interesse, også når navnet ikke finnes i en liste over tidligere vinnere. Systemet skal vise forskjellen mellom en interessant observasjon og et ferdig kontrollert signal. Ingen automatisk handel er lagt til.

## Endringene

- Et åpent oppdagelsesspor vurderer originalitet mot tidligere Stonk-lanseringer. Navn som ikke matcher de kjente par-assosiasjonene, kan gi en gul OBSERVASJON ved minst 3/5 originalitet og tilstrekkelig markedsaktivitet.
- Originalitet og parmatch er forskjellige mål og får forskjellige navn i Telegram. En ukjent navnekobling blir eksplisitt merket som ubekreftet.
- Sammenligningen finner like navn, enkle «Baby»/«2.0»-kopier og små skrivevarianter når tickeren også er lik. Samme ticker alene regnes ikke som kopi. Bare eldre lanseringer brukes som sammenligningsgrunnlag.
- Absolutt antall grafkoblede wallets er et opplysningspunkt. Andelen tokens de kontrollerer avgjør fortsatt konsentrasjonsgrensen. Dette fjerner den grove regelen som stoppet alle fire eksemplene på antall alene. ALLINUs tidligere målte 9,46 % overstiger fortsatt 8 %-grensen; vi har ikke økt den for å få eksemplene gjennom.
- Utstederadressen hentes nå også fra Stonks lanseringsdetaljer. At adressen mangler fra tokenlisten skal ikke i seg selv gi ukjent utstederbeholdning.
- Nye lanseringer og par følges omtrent hvert minutt, i tillegg til Helius-webhook. Aktive eldre tokens oppdages også hvert 30. minutt, opptil fem nye kandidater per runde. Eksisterende forløp følger sine kontrollpunkter i opptil 21 dager.
- Telegram beholder kort format, lenker og kopierbar adresse. Én observasjon per aktivt tokenforløp; senere oppgradering eller risikofunn kan gi nytt varsel.

## Krav som fortsatt gjelder

Observasjoner trenger ferske kjerneopplysninger, tilbakekalte mint-/freeze-rettigheter, minst $10 000 likviditet og aktivitetsscore minst 70. Eierkontrollen krever enten full eier-/utstederfordeling og målt insiderandel, eller et uttrykkelig delvis GMGN-utvalg på minst 60 wallets som dekker minst 50 % av tokenmengden etter kjente poolunntak. Reserveveien krever at største observerte wallet er høyst 10 % og observerte topp ti høyst 35 %. Ukjent utstederandel og øvrige insiderkoblinger forblir ukjent; varslet sier dette. Volum, antall kjøp, salgspress, markedsverdi og topp-retensjon må også være innenfor kravene. Reawakening krever to tegn på ny aktivitet. Påviste harde risikoer stopper fortsatt varslet.

GEM og øvrige verifiserte signaler krever fremdeles minst 3/5 begrunnet parmatch, komplette spesialistkontroller og et ferskt kjøperutvalg fra kjeden. Manglende målinger blir aldri satt til null. Et gult varsel er ikke en sikkerhetsgodkjenning.

## Snarveier og begrensninger til gjennomgang

1. **Ingen selvtrenende språkmodell:** Første versjon bruker forklarbare regler for originalitet og aktivitet. Den kan oppdage et nytt konsept uten å forstå vitsen eller meme-kulturen. Dypere språklig forståelse kan tilføyes senere med kildekrav og separat evaluering.
2. **Avgrenset sammenligning:** På etablerte par hentes de 100 nyeste og de 100 med høyest markedsverdi, pluss opptil 200 nylige/aktive tokens på andre par. For små par er hele listen med. API-svarene må dekke de forespurte vinduene. Originalitet betyr «i dette utvalget», ikke unikhet på hele internett. Eldre kopier utenfor utvalget kan bli oversett. Dette valget unngår at alle etablerte par stoppes bare fordi de har hundrevis av historiske tokens.
3. **Delvis sikkerhetsdekning:** GMGNs topp-100 og kvote er fortsatt begrensninger. Gule observasjoner kan mangle bundle-, sniper-, felles finansierings-, fersk-wallet- eller unike-kjøperdekning. Ved bruk av reserveveien kan også full eierfordeling, utstederandel og insidergraf mangle. Kunnskapshull vises; verifiserte signaler slipper ikke gjennom disse hullene.
4. **X er fortsatt av:** Ingen kreditter eller abonnement er kjøpt. Oppdagelse bruker Stonk, markedsdata og kjededata. X-nyheter og rene bilde-memes inngår ikke.
5. **Tersklene er foreløpige:** De er ikke statistisk kalibrert mot et komplett historisk utvalg. Fire etterpåvalgte vinnere er ikke tilstrekkelig treningsgrunnlag. Vi bør sammenligne også dårlige og oversette kandidater, tidspunkt, markedsverdi og utfall før neste justering.
6. **Ingen garantert signalmengde eller gevinst:** Løsningen skal varsle når kriteriene er oppfylt. Den lager ikke kunstige kandidater ved rolig marked eller manglende kjerneopplysninger, og kan ikke garantere at neste vinner fanges under $100k.

## Verifikasjon

Automatiserte tester dekker nye navn utenfor ordlisten, navnekopier, manglende og foreldede data, harde risikogrenser, grafantall kontra konsentrasjon, gradering i Telegram, duplikatkontroll, etterfølgende risikovarsel, utstederdata og oppgradering av varige overvåkninger. De fire tidligere eksemplene er regresjonstilfeller, ikke bevis for et historisk varsel på et bestemt tidspunkt.

94 automatiserte tester bestod. Typekontroll og produksjonsbygg bestod. Live Stonk-oppslag bekreftet blant annet at Dojocoin, Kabosu og Robot Mines kunne vurderes av originalitetssporet og at utstederadressen ble hentet. Dette alene er ikke en sikkerhetsgodkjenning eller et Telegram-signal. Første produksjonskontroll bekreftet Telegram-leveranse og aktiv overvåkning, men viste Helius 429 og ufullstendig grafdata. Derfor er reserveveien, tydeligere mangellabel, 90-sekunders begrenset gjenforsøk og spredte oppgraderinger lagt til. Helius-plan eller kontokvote er ikke endret. Endelig produksjonsresultat oppgis i leveringsmeldingen og kan sammenholdes med botchatten.
