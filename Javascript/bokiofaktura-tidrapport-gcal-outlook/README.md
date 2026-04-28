# Bokiofaktura med Tidrapport GCAL/Outlook

Minimal frontend-only MVP for demo av [Fakturera tid med Bokio](https://www.larswpettersson.se/projects/fakturera-tid-med-bokio).

Live demo (GitHub Pages):

[https://larswpettersson.github.io/KalenderTidrapport/Javascript/bokiofaktura-tidrapport-gcal-outlook/](https://larswpettersson.github.io/KalenderTidrapport/Javascript/bokiofaktura-tidrapport-gcal-outlook/)
## Included

- `index.html` - simple UI for token, company/customer lookup, and invoice create.
- `app.js` - functions:
  - `loadCompanies()`
  - `loadCustomers(companyId)`
  - `createInvoice(...)`
- `styles.css` - minimal styling.

## Run locally

Open this folder in a static server, for example:

```bash
python -m http.server 8080
```

Then open:

`http://localhost:8080/Javascript/bokiofaktura-tidrapport-gcal-outlook/`

## CORS fallback in MVP

If browser blocks Bokio API calls:

- UI shows a CORS fallback panel.
- You get a ready `curl` example for the same request.
- You can validate endpoint/token outside browser and demo the flow.

## Security notes for public demo mode

- Recommended: each user uses their own Apps Script `/exec` URL with `BOKIO_API_TOKEN` in Script Properties.
- Default secure mode in UI does **not** send token in request query.
- Optional compatibility mode can send token in query, but this is less secure.
- Token is kept in memory only and is not stored in localStorage.

## Dry-run in UI

- If `COMPANY_ID` or `CUSTOMER_ID` is empty, the UI runs pipeline in dry-run mode.
- Dry-run returns and displays `buildExportText(weekData)` output.
- No Bokio invoice is created in dry-run.

