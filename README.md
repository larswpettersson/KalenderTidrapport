# Kalender -> Tidrapport -> Bokio fakturautkast

Detta projekt tar tid från en ICS-kalender, filtrerar på period och valfritt kundprefix, och skapar ett underlag för tidrapport i t.ex. Agresso och om man vill ett fakturautkast i Bokio.

## Filer

- `fakturera_kund.sh` - kör hela flödet.
- `ics2tidrapport.py` - hämtar kalenderdata och skickar JSON till nästa steg.
- `skapa_faktura_i_bokio.py` - läser JSON och skapar fakturautkast via Bokio API.
- `.env-example` - mall för miljövariabler.

## Hur skripten fungerar ihop

Kedjan körs i denna ordning:

1. `fakturera_kund.sh` tar emot period (`yyyy-mm`) och valfritt kundprefix och kopplar ihop stegen med en pipe.
2. `ics2tidrapport.py` hämtar ICS-data från `KALENDER_URL` i `.env`, filtrerar på månad och prefix, och skickar resultatet som JSON till stdout.
3. `skapa_faktura_i_bokio.py` läser JSON från stdin, grupperar/summerar tid, skapar fakturautkast i Bokio och skriver även ut en textfil för vidare export.

Det innebär att du normalt bara behöver köra ett enda kommando:

```bash
./fakturera_kund.sh 2026-04 AcmeCorp
```

## Vad textfil-exporten används till

När `skapa_faktura_i_bokio.py` körs skapas en textfil med namn i stil med:

`Tidrapport_2026-04_AcmeCorp_YYYYMMDD_HHMM.txt`

Textfilen innehåller veckovisa block (mån-sön) med aktiviteter och timmar per dag samt totalsumma. Den kan användas till:

- underlag/bilaga till faktura
- snabb inklistring i Excel eller ekonomisystem (t.ex. Agresso)
- intern tiduppföljning och arkivering av vad som fakturerats

## Krav

- Python 3
- `pip`
- Python-paket:
  - `requests`
  - `icalendar`
  - `python-dotenv`

Installera paket:

```bash
pip install requests icalendar python-dotenv
```

## Konfiguration

1. Skapa en lokal `.env` från mallen:

```bash
cp .env-example .env
```

2. Fyll i värden i `.env`:

- `KALENDER_URL` - publik eller delad ICS-länk till kalendern
- `BOKIO_API_TOKEN` - token för Bokio API
- `COMPANY_ID` - ditt företags-id i Bokio
- `CUSTOMER_ID` - kund-id i Bokio
- `TIMPRIS` - timpris per timme (standard 1200 om den saknas)

## Användning

Kör hela pipelinen:

```bash
./fakturera_kund.sh <yyyy-mm> [prefix]
```

Exempel:

```bash
./fakturera_kund.sh 2026-04
./fakturera_kund.sh 2026-04 AcmeCorp
```

- `yyyy-mm` är obligatorisk period, t.ex. `2026-04`
- `prefix` är valfritt och filtrerar på ämnesradens början, t.ex. `AcmeCorp`

## Exempel från webbdemon (Bokiofaktura)

I [webbdemon](https://www.larswpettersson.se/projects/fakturera-tid-med-bokio) kan du klistra in en Bokio-kundlänk för att fylla i ID-fälten automatiskt.

Publicerad demo (GitHub Pages):

[Bokiofaktura med Tidrapport GCAL/Outlook](https://larswpettersson.github.io/KalenderTidrapport/Javascript/bokiofaktura-tidrapport-gcal-outlook/)

Exempel på länkformat:

```text
https://app.bokio.se/<company_id>/invoicing/customers/view/<customer_id>
```

Exempel på flöde i sidan:

1. Klistra in länken i fältet `Bokio-länk`.
2. Klicka på `Extrahera ID från länk`.
3. Kontrollera att `COMPANY_ID` och `CUSTOMER_ID` fylls i.
4. Lägg till `BOKIO_API_TOKEN` och kör `createInvoice(...)`.

## ACME-exempel (Google Calendar -> faktura)

Det finns ett färdigt exempel i bilden `ACME Google Calendar exempel.png` som visar aktiviteter i april 2026.
Du kan skapa fakturaunderlag för detta exempel med:

```bash
./fakturera_kund.sh 2026-04 ACME
```

Kalendern finns här:

[Google Calendar - ACME-exempel](https://calendar.google.com/calendar/u/1?cid=Y181MzdjMjllOWMyYjFjODUzMzExNTQ5ODUzZjRhYTFmMTk1OTc4ZDZlZGI3NDY4NzFlOWJmODVhZGUwZTFjMTkxQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20)

Gå till april, vecka 17 (2026) för att se samma underlag som i exemplet.

Poängen med flödet är att du kan fakturera eget arbete med stöd av tiderna i schemat och dagens möten.
Det gör det enklare att tidrapportera både enligt plan och enligt faktiskt utfall vid dagens slut.

Exempelbilder:

![ACME Google Calendar exempel](ACME%20Google%20Calendar%20exempel.png)

![Bokio Faktura ACME exempel](Bokio%20Faktura%20ACME%20exempel.png)

## Manuell körning (felsökning)

Testa datasteg 1 separat:

```bash
python ics2tidrapport.py 2026-04 ACME
```

Testa hela pipen manuellt:

```bash
python ics2tidrapport.py 2026-04 ACME | python skapa_faktura_i_bokio.py
```

## Vanliga fel

- `Fel: Ingen KALENDER_URL hittades i .env`
  - Kontrollera att `.env` finns och att variabeln är ifylld.
- `Ingen data att fakturera.`
  - Ingen kalenderdata matchade period/prefix.
- `Fel vid API-anrop` eller `❌ Fel: ...`
  - Kontrollera Bokio-token, company/customer-id och API-behörighet.

## Säkerhet

- `.env` ska inte committas (ligger i `.gitignore`).
- Dela aldrig `BOKIO_API_TOKEN` publikt.
