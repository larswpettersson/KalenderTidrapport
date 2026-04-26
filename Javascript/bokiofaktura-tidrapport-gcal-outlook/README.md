# Bokiofaktura med Tidrapport GCAL/Outlook

Minimal frontend-only MVP for demo under your Projects page.

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

## Security notes for demo mode

- Token is only kept in memory.
- Token is not stored in localStorage.
- For production use, move API calls to backend.

## Example images

Google Calendar source example (ACME, week 17 in April 2026):

![ACME Google Calendar example](../../ACME%20Google%20Calendar%20exempel.png)

Bokio invoice draft example based on the same period:

![Bokio invoice ACME example](../../Bokio%20Faktura%20ACME%20exempel.png)
