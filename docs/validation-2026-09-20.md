# Kontroll av fire kjente Stonk-tokens — 20. september 2026

Dette er en test av oppdagelsesformat, navnemodell og walletfilter med innhentede data. Det er **ikke en historisk replay av kjøpssignaler**. Ingen data om volum, eiere, bundles eller finansiering ved lansering er oppdiktet.

## Resultat før og etter navnerettingen

| Token | Faktisk par | Før: poeng / parmatch | Etter: poeng / parmatch | Walletfilter i testen |
|---|---|---|---|---|
| Feels Good Man | PEPE | 4/5 / ja | 4/5 / ja | RISKY: 46 koblede wallets |
| ALLINU | DKNG | 2/5 / nei | 3/5 / ja | RISKY: 114 koblede wallets |
| LinkedInu | MSFTX | 3/5 / nei | 4/5 / ja | RISKY: 26 koblede wallets |
| Anonymous Cat | ZEC | 3/5 / nei | 4/5 / ja | RISKY: 323 koblede wallets |

Førstepar/new-pair-bonus er ikke antatt. Alle fire har ordinære navn/par/reward-poeng i denne testen. Det finnes ingen mint-hviteliste; navneendringene gjelder generelle Microsoft/LinkedIn-, DraftKings/betting- og Zcash/anonymitetskoblinger.

## Hva kunne vært oppdaget?

Alle fire har gyldige poster i Stonks token-API og kan gjøres om til en analysejobb av `stonkRowToLaunch`. De tre LaunchLab-tokenene har en relevant oppdagelsesvei via LaunchLab-webhook og Stonks lanseringsfeed. ZCAT er oppgitt som `raydium`, og kan ikke tilskrives LaunchLab-webhooken; der er Stonk-feed/register en relevant vei. API-tilstedeværelse i dag beviser ikke at en historisk forespørsel ville ha returnert posten.

| Token | Oppgitt launch-post (UTC) | Tokenregistrering (UTC) | Oppgitt start-MC |
|---|---|---|---|
| Feels Good Man | 2026-09-18T21:27:54.085Z | 2026-09-18T21:30:47.922Z | $3,848 |
| ALLINU | 2026-09-11T20:02:37.482Z | 2026-09-11T20:05:00.407Z | $3,300 |
| LinkedInu | 2026-09-16T22:42:23.774Z | 2026-09-16T22:44:16.780Z | $2,733 |
| Anonymous Cat | 2026-08-30T23:29:57.301Z | 2026-08-30T23:30:26.185Z | $5,093 |

Tidspunktene er Stonks metadata, ikke dokumenterte observasjonstider fra vår bot eller verifiserte kjedetidspunkter. Alle lanseringene er fra før denne botversjonen. Start-MC er ikke en kjøpspris eller bevis for at radaren ville ha varslet på den verdien.

Den kjørende modellen venter 20 sekunder før første analyse. Det er en intern forsinkelse, ikke en garantert oppdagelsestid. Polling av register/lanseringer skjer omtrent hvert minutt, i tillegg til indeks-, behandlings- og eventuelle køforsinkelser. Et tidlig positivt signal krever også fullstendige sikkerhetsdata og markeds-/kjøperdata fra det tidspunktet. Slike historiske snapshots mangler her.

## Hva stopper signalene?

Walletfilteret er testet med den eksisterende `getWalletRiskMetrics`-implementasjonen. Alle fire blir RISKY under regelen om minst 20 grafkoblede wallets. Følgende tall kom fra RugCheck i testgrunnlaget:

| Token | Grafkoblede wallets | Beregnet insiderandel |
|---|---:|---:|
| Feels Good Man | 46 | 0.94% |
| ALLINU | 114 | 9.46% |
| LinkedInu | 26 | 4.79% |
| Anonymous Cat | 323 | 3.65% |

Dette er leverandørens gruppering og beregnet andel, ikke selvstendig bevis for felles eier eller svindel. En absolutt antallsgrense kan stoppe tokens selv når den rapporterte andelen er lav. Terskelen er ikke senket for å få kjente vinnere gjennom testen. ALLINU treffer i tillegg den eksisterende 8%-grensen for insiderandel.

GMGN svarte HTTP 429 i første kall; adapteren respekterte deretter kvotepausen. Dermed er ingen GMGN-prosenter bekreftet for disse fire i denne kjøringen. Helius-nøkkelen finnes bare i produksjon og inngikk ikke i den lokale firetoken-testen. Wallet-RISKY er allerede et ubetinget stopp for positive signaler, men dette erstatter ikke en full ende-til-ende-analyse eller historisk replay.

GMGN-endepunktet dekker maksimalt 100 holdere. En slik begrenset liste kan gi nedre grenser for påvist risiko, men kan ikke godkjenne full walletdekning for tokens med flere eiere. Den daglige backfill-skanneren har i tillegg grenser for alder, markedsverdi og aktivitet; de kan ikke brukes bakover på dagens tall for å bevise historisk oppdagelse.

## Telegram-endringen

Siste Dojocoin-test ble kontrollert i botchatten. Den gamle meldingen hadde over 20 linjer, gjentatte kontrollfeil og en aktivitetsscore som kunne se ut som en anbefaling. Ny leveranse viser avgjørelse, MC/likviditet, relevant volumvindu, eiere, parmatch, kontrollstatus og inntil to hovedårsaker. Aktivitetsscore og leverandørdiagnostikk ligger fortsatt i analysen. Stonk, GMGN og kopiering av eksakt adresse er egne knapper. Risikovarsler om tidligere signaler beholdes.

## Datagrunnlag og lenker

- [Feels Good Man — Stonk API](https://www.stonkfun.xyz/api/public/v1/tokens/HgcxVs6kJhPAaGqnPNGaa7zYgNT49hJrLufiqcNMuYZT); generert 2026-09-20T00:44:06.758Z. [RugCheck](https://rugcheck.xyz/tokens/HgcxVs6kJhPAaGqnPNGaa7zYgNT49hJrLufiqcNMuYZT).
- [ALLINU — Stonk API](https://www.stonkfun.xyz/api/public/v1/tokens/4MMQY9bwkxxTtsK3W227Q5ABT6yFY8Pmn9Ze7wmAXKY8); generert 2026-09-20T00:43:13.758Z. [RugCheck](https://rugcheck.xyz/tokens/4MMQY9bwkxxTtsK3W227Q5ABT6yFY8Pmn9Ze7wmAXKY8).
- [LinkedInu — Stonk API](https://www.stonkfun.xyz/api/public/v1/tokens/FvhorDts9M8uJekzs3pBcYUPUjWtCTrGLhdv3ADHyeRY); generert 2026-09-20T00:42:23.625Z. [RugCheck](https://rugcheck.xyz/tokens/FvhorDts9M8uJekzs3pBcYUPUjWtCTrGLhdv3ADHyeRY).
- [Anonymous Cat — Stonk API](https://www.stonkfun.xyz/api/public/v1/tokens/HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR); generert 2026-09-20T00:44:07.004Z. [RugCheck](https://rugcheck.xyz/tokens/HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR).

Navnekoblinger støttes av [Microsofts LinkedIn-kunngjøring](https://news.microsoft.com/source/2016/06/13/microsoft-to-acquire-linkedin/), [DraftKings](https://www.draftkings.com/) og [Zcash](https://z.cash/). «All-in» er en tematisk tolkning av navnet, ikke en bekreftet selskapsforbindelse.

Regresjonstester bruker de faktiske navnene/parene og syntetiske øvrige markedsdata. De dokumenterer regeladferd, ikke historisk avkastning.
