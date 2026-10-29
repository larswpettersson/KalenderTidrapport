# Google Apps Script — flexbank per mail

Räknar ut flexsaldot från samma ICS-kalender som tidrapporten och mailar det varje
måndag. Ingen webbsida behövs, allt körs i Apps Script med en tidsstyrd trigger.

## Vad som räknas

- **Arbetad tid:** tidsatta kalenderposter vars ämne är projektprefixet
  (`FLEX_PROJEKT_PREFIX`) eller börjar med prefixet följt av mellanslag, t.ex.
  `<prefix> Planering`. Ett ämne där prefixet följs direkt av fler bokstäver räknas inte.
  Poster som överlappar räknas bara en gång.
- **Normtid:** heltid 8 h per vardag (40 h per helgfri vecka).
  - Normtid 0 på helger och på fria dagar: nyårsdagen, trettondedag jul, långfredagen,
    annandag påsk, 1 maj, Kristi himmelsfärdsdag, nationaldagen, midsommarafton, julafton,
    juldagen, annandag jul och nyårsafton.
  - Förkortad dag (−2 h): trettondagsafton, skärtorsdagen, valborgsmässoafton, dagen före
    Kristi himmelsfärdsdag, dagen före nationaldagen och allhelgonaafton.
  - **Kontrollera** förkortningarna mot Trafikverkets lokala arbetstidsavtal. Ändra
    `NORMTID_TIMMAR`, `FORKORTNING_TIMMAR` eller `swedishHolidays()` i `Code.gs` om de
    skiljer sig.
- **Frånvaro:** heldagsposter som börjar med `Semester`, `Sjuk`, `VAB`, `Föräldraledig`,
  `Tjänstledig` eller `Kompledig` ger normtid 0 den dagen (listan `FRANVARO_ORD`).
  Flexledighet ska inte markeras så, eftersom den ska minska saldot.
- **Period:** från `FLEX_STARTDATUM` (standard `2026-05-15`) plus ett valfritt ingående
  saldo.

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
   - `FLEX_RAPPORT_MOTTAGARE` = mottagarens e-postadress. Utan den skickas mailet till
     kontot som äger skriptet.
   - Valfritt: `FLEX_STARTDATUM` (`yyyy-mm-dd`) och `FLEX_INGAENDE_SALDO` (timmar, t.ex.
     `-1.5`).
3. Välj funktionen `sendFlexReportNow` och tryck **Run**. Godkänn behörigheterna
   (kalenderhämtning och mail). Du får direkt ett mail för senaste hela veckan.
4. Välj `installWeeklyTrigger` och tryck **Run**. Därefter skickas rapporten för
   förra veckan varje måndag runt kl 06. Har du installerat den tidigare
   månadstriggern tas den bort samtidigt.
