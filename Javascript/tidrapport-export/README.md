# Tidrapport-export

Fristående, skrivskyddad sida som listar output från `ics2tidrapport.py` (via samma Apps
Script-backend som Bokiofaktura-demot), filtrerat på `project` (prefix) och `time` (yyyy-mm).

Live demo (GitHub Pages):

[https://larswpettersson.github.io/KalenderTidrapport/Javascript/tidrapport-export/](https://larswpettersson.github.io/KalenderTidrapport/Javascript/tidrapport-export/)

## Vad den gör

- Skickar `action=getTidrapport&yearMonth=...&prefix=...` till en dedikerad,
  **Bokio-fri** Apps Script-backend: [`Javascript/gscript-tidrapport/Code.gs`](../gscript-tidrapport/Code.gs).
  Den backenden innehåller ingen Bokio-kod alls, så den kan aldrig anropa Bokio eller skapa
  en faktura — till skillnad från `Javascript/gscript` som används av Bokiofaktura-demot.
- Kalenderlänken skickas aldrig från sidan — backenden läser den från Script Property
  `KALENDER_TIDRAPPORT_URL` (samma hemlighet som `.env`-variabeln lokalt).
- Svaret innehåller `exportText` (veckovis text, samma format som textfilen från
  `skapa_faktura_i_bokio.py`) som visas direkt på sidan.
- Inget `token`/`BOKIO_API_TOKEN`-fält finns i UI:t — det behövs inte.

## Fält

- `Apps Script API base` - din `/exec`-URL för `gscript-tidrapport`-deploymenten.
- `Project` - prefix, t.ex. `ACME`.
- `Time` - period `yyyy-mm`, t.ex. `2026-04`.

## Egen deployment

Deploya din egen kopia av [`gscript-tidrapport/Code.gs`](../gscript-tidrapport/Code.gs) (se
[gscript-tidrapport/README.md](../gscript-tidrapport/README.md)) och sätt Script Property
`KALENDER_TIDRAPPORT_URL`. Klistra sedan in din `/exec`-URL i `Apps Script API base`.

## Run locally

```bash
python -m http.server 8080
```

Öppna sedan:

`http://localhost:8080/Javascript/tidrapport-export/`
