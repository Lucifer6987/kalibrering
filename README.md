# Kalibrering

Dansk webapplikation til instrumentstyring og kalibrering. React og TypeScript på klienten, Express på serveren, lokal SQLite-database via Node.js, Recharts, PDFKit og ExcelJS. Ingen eksterne API-nøgler eller databaseserver kræves.

## Start fra en ny checkout

Forudsætninger: **Node.js 24 eller nyere** og npm.

```bash
git clone https://github.com/Lucifer6987/kalibrering.git
cd kalibrering
npm ci
npm run seed
npm run dev
```

Åbn port **3000** i din lokale browser. `npm run dev` starter både Express og Vites udviklingsmiddleware med automatisk opdatering af brugerfladen. Stop med Ctrl+C. Miljøet er allerede isoleret; brug den eksisterende checkout uden at oprette en ekstra Git-worktree.

Produktionsbuild og lokal afvikling:

```bash
npm run build
npm start
```

Serveren lytter som standard på `127.0.0.1:3000`. Brug `HOST=0.0.0.0` ved containerdrift og `PORT=3001` for en anden port. Brug `DB_PATH=/sti/til/kalibrering.sqlite` for en anden databaseplacering. Standarddatabasen er `data/kalibrering.sqlite`, relativt til projektroden. Start altid kommandoerne fra projektroden. Databasetabeller oprettes automatisk; `npm run seed` tilføjer kun eksempeldata, hvis instrumentregisteret er tomt, og kan gentages uden dubletter.

## Arbejdsgang

1. Opret instrument med serienummer, instrumenttype, måleenhed, måleområde, tolerance og kalibreringsinterval.
2. Vælg **Ny kalibrering**, og angiv dato, ansvarlig, referenceudstyr og udvidet måleusikkerhed i instrumentets måleenhed.
3. Indtast mindst to forskellige referencepunkter og førmålinger. Førmålinger udfyldes ikke automatisk med referenceværdier. Eftermålinger kan være tomme, indtil justering er afsluttet. Referencer skal ligge i måleområdet. Tilføj eller fjern punkter efter behov.
4. Grafer og resultater beregnes løbende. Gem kalibreringen for at oprette historik, PDF-certifikat og Excel-rapport.
5. Åbn historikken for at se grafer eller hente tidligere rapporter. Gemte kalibreringer er uforanderlige og indeholder et øjebliksbillede af instrumentdata. Rettelser registreres som en ny kalibrering.

Søg i instrumentregisteret på navn, type eller serienummer. Oversigten markerer instrumenter uden kalibrering eller med overskredet interval. Eksempeldata er tydeligt markeret som demo og er ikke faktiske målinger.

## Beregninger

- **Afvigelse:** målt værdi minus referenceværdi. Før og efter vurderes hver for sig.
- **Absolut tolerance:** brugerens tolerance i instrumentets måleenhed.
- **Procenttolerance:** `(maksimum − minimum) × toleranceprocent / 100` (procent af målespænd, ikke af aflæsning).
- **Beslutningsregel:** godkendt når `abs(afvigelse) + udvidet usikkerhed <= tolerance`. Det er en konservativ guard band-regel. Den indtastede usikkerhed behandles som allerede udvidet; systemet udleder ikke et usikkerhedsbudget eller dækningsfaktor. Tom efterværdi giver **Ikke afsluttet**, aldrig automatisk godkendelse.
- **Transmitter:** lineær skalering fra procesområde til 4–20 mA. Uden for området vises lineær ekstrapolation. Kalibreringspunkter skal indtastes i samme måleenhed som reference og instrument. Konverter først strøm til procesværdi, hvis nødvendigt: `proces = minimum + (mA − 4) / 16 × (maksimum − minimum)`.
- **PT100/PT1000:** IEC 60751 Callendar–Van Dusen, `A=3.9083e-3`, `B=-5.775e-7`, `C=-4.183e-12`, `R0=100/1000 Ω`. Gyldigt område −200 til 850 °C. Omvendt beregning bruger numerisk bisektion. Beregneren angiver nominel karakteristik; instrumentets konkrete tolerance indtastes separat.
- **Temperaturfølere:** referencetemperatur sammenlignes direkte med indikeret temperatur i °C; temperaturreferencens sporbarhed registreres på målingen.
- **Varmelegemer:** effekt `P=U×I`, modstand `R=U/I` for resistiv belastning. Kalibrér effekt i W eller temperatur i °C som separate instrumentregistreringer med den relevante tolerance. Systemet styrer ikke fysisk måleudstyr.

PDF-certifikater indeholder identifikation, referenceudstyr, dato, ansvarlig, usikkerhed, beslutningsregel og før-/eftermålinger. De er ikke digitalt signerede eller akkrediterede certifikater; ansvarlig operatør skal sikre referenceudstyrets gyldighed og sporbarhed.

## Excel

Hent skabelonen fra måleskemaet. Første ark skal have kolonnerne **Reference**, **Før**, **Efter** i den rækkefølge. Reference og Før skal være numeriske celler; Efter kan være tom. Formler i disse tre inputkolonner accepteres ikke, da serveren ikke eksekverer fremmede Excel-formler. Maksimum 100 punkter og 2 MB filstørrelse. Importen udfylder måleskemaet og kræver eksplicit gemning.

Eksporten indeholder rå målinger og Excel-formler for afvigelser og vurdering, inklusive usikkerhed. Gemte måleværdier genberegnes også på serveren ved PDF- og historikvisning. Excel kan genberegne rapportens formler ved åbning.

## Tests

```bash
npm test
npm run build
npm run test:e2e
```

`npm test` bygger først applikationen og kører derefter beregnings-, validerings- og API-integrationstests med en midlertidig SQLite-database og server på port 3198. API-testen kontrollerer oprettelse, fejltilfælde, historik, PDF-indholdssignatur samt Excel-eksport/import.

Browsertesten bruger Chromium og port 3199. I dette cloudmiljø er Chromium på `/usr/bin/chromium`. På andre maskiner kan du angive `CHROMIUM_PATH=/sti/til/chromium npm run test:e2e`. Testen opretter eksempeldata i en midlertidig database i `/tmp/` og kontrollerer instrumentoprettelse, målinger, grafer, rapportdownload og mobilnavigation. Den berører ikke udviklingsdatabasen.

## Drift og backup

Dette er en lokal applikation til en betroet bruger eller et betroet netværk. Login, roller, digital signering, revisionslog over brugerhandlinger og flerbrugerdrift er ikke implementeret. Til offentlig drift skal der etableres autentifikation, HTTPS, adgangskontrol og en passende backupstrategi.

SQLite bruger foreign keys og WAL. Stop serveren før filbackup, og kopiér hele `data/`-mappen. Database, afhængigheder, build og lokale miljøfiler er udeladt fra Git. Ingen måledata sendes til eksterne tjenester. Gem aldrig rigtige kundemålinger i kildekoden.

## Afhængighedskontrol

`npm audit --omit=dev` rapporterede ved implementeringen 9 moderate, 0 høje og 0 kritiske fund i ExcelJS’ transitive arkiveringsafhængigheder (minimatch og uuid med afledte afhængigheder). Audit foreslår en ældre hovedversion af ExcelJS; den er ikke installeret som en ukontrolleret rettelse. Importen accepterer kun numeriske inputceller, og applikationen bruger ikke brugerleverede globmønstre. Dette erstatter ikke en opdatering, når en kompatibel upstream-rettelse er tilgængelig.
