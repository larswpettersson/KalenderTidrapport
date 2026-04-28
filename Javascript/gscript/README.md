# Google Apps Script backend

This folder contains an Apps Script version of the Python pipeline:

`./fakturera_kund.sh <yyyy-mm> [prefix]`

## What is implemented

- Fetch ICS calendar data
- Filter by `yyyy-mm` and optional `prefix`
- Build Bokio line items
- Create draft invoice in Bokio
- Return a text export block (Excel/Agresso style) in API response

## Deploy

1. Open [script.new](https://script.new)
2. Replace `Code.gs` with `Javascript/gscript/Code.gs`
3. Deploy as Web App:
   - Execute as: `Me`
   - Who has access: `Anyone` (demo)
4. Copy `/exec` URL and use it as `Bokio API base` in the web demo.

## Request payload

Apps Script Web App fungerar stabilast med `GET` i detta projekt.

Exempel (`GET` query params):

```text
...?action=runPipeline&yearMonth=2026-04&prefix=ACME&companyId=...&customerId=...&timpris=1200
```

`POST` med JSON stöds också i koden, men kan blockeras av redirect-beteendet i Apps Script Web App.

`POST` (text/plain JSON):

```json
{
  "action": "runPipeline",
  "token": "BOKIO_API_TOKEN",
  "yearMonth": "2026-04",
  "prefix": "ACME",
  "companyId": "b8d2bd5b-...",
  "customerId": "b28b5273-...",
  "calendarUrl": "https://.../basic.ics"
}
```

`calendarUrl` is optional if you configure Script Property `KALENDER_URL`.

## Secure public demo (recommended)

For shared/public demo usage, do this per user deployment:

1. Set Script Property `BOKIO_API_TOKEN` in Apps Script.
2. Keep `ALLOW_TOKEN_FROM_REQUEST` unset (or `false`).
3. Use the user-specific `/exec` URL in frontend.

With this setup, token is never sent in URL/query from browser.

## Compatibility mode (less secure)

You can allow token in request by setting Script Property:

```text
ALLOW_TOKEN_FROM_REQUEST=true
```

Then `token` in request is accepted. This is less secure in GET flows because query strings can be logged.

## Dry-run behavior

If `companyId` or `customerId` is missing, pipeline runs in `dryRun` mode:

- Calendar parsing and aggregation still run.
- `buildExportText(weekData)` output is returned.
- No Bokio invoice create request is sent.
