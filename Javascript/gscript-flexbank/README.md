# Google Apps Script — flexbank per mail

Räknar ut flexsaldot från samma ICS-kalender som tidrapporten och mailar det varje
måndag. Ingen webbsida behövs, allt körs i Apps Script med en tidsstyrd trigger.

## Vad som räknas

- **Arbetad tid:** tidsatta kalenderposter vars ämne är projektprefixet
  (`FLEX_PROJEKT_PREFIX`) eller börjar med prefixet följt av mellanslag, t.ex.
  `<prefix> Planering`. Ett ämne där prefixet följs direkt av fler bokstäver räknas inte.
  Poster som överlappar räknas bara en gång.
- **Normtid:** styrs av verksamhetens regler, se nedan. Normtid är alltid 0 på helger.
- **Frånvaro:** heldagsposter som börjar med `Semester`, `Sjuk`, `VAB`, `Föräldraledig`,
  `Tjänstledig` eller `Kompledig` ger normtid 0 den dagen (listan `FRANVARO_ORD`).
  Flexledighet ska inte markeras så, eftersom den ska minska saldot.
- **Period:** från `FLEX_STARTDATUM` (standard `2026-05-15`) plus ett valfritt ingående
  saldo.

## Regler per verksamhet

Normtid, fria dagar och förkortade arbetsdagar hämtas från en regeluppsättning. Standard är
`trafikverket`, som är inbyggd i `Code.gs` (`VERKSAMHETER`):

- **Normtid:** 8 h per vardag. Klämdagar är vanliga arbetsdagar.
- **Fria dagar:** nyårsdagen, trettondedag jul, långfredagen, annandag påsk, 1 maj, Kristi
  himmelsfärdsdag, nationaldagen, midsommarafton, julafton, juldagen, annandag jul och
  nyårsafton.
- **Förkortade arbetsdagar** enligt flextidsreglerna räknas alltid in i normtiden. Saldot
  visar då vad du bör arbeta, och kan användas som underlag när du ber om ledighet de
  dagarna (t.ex. med förtroendearbetstid).

  | Dag | Förkortning | 2026 | 2027 |
  |---|---|---|---|
  | Trettondagsafton | 4 h | mån 5 jan | tis 5 jan |
  | Dagen närmast före långfredagen | 2 h | tor 2 apr | tor 25 mar |
  | 30 april, mån–tor | 2 h | tor 30 apr | – |
  | 30 april, fredag | 4 h | – | fre 30 apr |
  | Dagen före alla helgons dag | 4 h | fre 30 okt | fre 5 nov |
  | 23 december, fredag | 4 h | – | – |
- **Nationaldagen på en helg** (Affärsverksavtalet 15 § 1.3) kompenseras med en ledig
  arbetsdag. Lägg in dagen som en heldagspost med "Nationaldagen" i ämnet, så får den
  normtid 0. Det gäller den första sådana vardagen från 6 juni samma år. Mailet varnar
  tills dagen är inlagd.

### Egna regler

Välj en inbyggd regeluppsättning med Script Property `FLEX_VERKSAMHET`, eller ange egna
regler som JSON i `FLEX_REGLER`. Fält som utelämnas i `FLEX_REGLER` hämtas från
`FLEX_VERKSAMHET` (standard Trafikverket). Exempel:

```json
{
  "namn": "Exempel AB",
  "normtidTimmar": 7.5,
  "forkortadeDagar": [
    { "dag": "trettondagsafton", "timmar": 4 },
    { "dag": "valborgsmässoafton", "veckodagar": ["mån", "tis", "ons", "tor"], "timmar": 2 },
    { "dag": "12-23", "veckodagar": ["fre"], "timmar": 4 }
  ]
}
```

- `nationaldagKompensation` (`true`/`false`) styr kompensationen för nationaldagen på helg.
- `fridagar` är en lista med dagar som är lediga.
- `forkortadeDagar` anger hur många timmar dagen förkortas. Med `veckodagar` gäller regeln
  bara när dagen infaller på någon av de veckodagarna.
- En dag anges som `"MM-DD"` eller med namn: nyårsdagen, trettondagsafton,
  trettondedag jul, skärtorsdagen, långfredagen, påskafton, annandag påsk,
  valborgsmässoafton, första maj, dagen före kristi himmelsfärdsdag, kristi himmelsfärdsdag,
  dagen före nationaldagen, nationaldagen, midsommarafton, allhelgonaafton,
  alla helgons dag, julafton, juldagen, annandag jul och nyårsafton.

Felaktiga regler stoppar skriptet med ett felmeddelande i loggen.

## Mailet

Mailet gäller förra veckan (mån–sön) och innehåller aktuellt saldo, veckans arbetade tid,
normtid och flex, en tabell per dag, veckans särskilda dagar och en historik per månad
sedan startdatumet.

Återkommande kalenderposter (`RRULE`) räknas bara första gången, precis som i
tidrapporten. Mailet varnar om sådana projektposter finns.

## Installera

1. Öppna [script.new](https://script.new) och ersätt `Code.gs` med innehållet i den här
   mappens `Code.gs`.
2. **Project Settings → Script Properties**, lägg till:
   - `KALENDER_TIDRAPPORT_URL` = ICS-länken (samma som för tidrapporten).
   - `FLEX_PROJEKT_PREFIX` = ämnesprefixet för poster som räknas som arbetstid.
   - `FLEX_RAPPORT_MOTTAGARE` = mottagarens e-postadress. Flera adresser separeras med `;`,
     t.ex. `anna@example.se; bo@example.se`. Utan den skickas mailet till
     kontot som äger skriptet.
   - Valfritt: `FLEX_STARTDATUM` (`yyyy-mm-dd`), `FLEX_INGAENDE_SALDO` (timmar, t.ex.
     `-1.5`), `FLEX_VERKSAMHET` och `FLEX_REGLER` (se Regler per verksamhet).
3. Välj funktionen `sendFlexReportNow` och tryck **Run**. Godkänn behörigheterna
   (kalenderhämtning och mail). Du får direkt ett mail för senaste hela veckan.
4. Välj `installWeeklyTrigger` och tryck **Run**. Därefter skickas rapporten för
   förra veckan varje måndag runt kl 06. Har du installerat den tidigare
   månadstriggern tas den bort samtidigt.
