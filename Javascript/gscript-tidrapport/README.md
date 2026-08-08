# Google Apps Script backend — tidrapport only (no Bokio)

This is a deliberately minimal, separate Apps Script Web App backend that only fetches an
ICS calendar and returns an aggregated text export. It has **no Bokio API calls and no
token handling anywhere in the code** — unlike [`Javascript/gscript`](../gscript/), which
also creates Bokio invoices. Use this project if you want a guarantee that the deployment
can never touch Bokio, regardless of what request parameters are sent.

It backs the [`Javascript/tidrapport-export`](../tidrapport-export/) page.

## What is implemented

- Fetch ICS calendar data from Script Property `KALENDER_TIDRAPPORT_URL` (never from the
  request).
- Filter by `yyyy-mm` and optional `prefix`.
- Return a text export block (Excel/Agresso style) in the API response.

## Deploy

1. Open [script.new](https://script.new)
2. Replace `Code.gs` with `Javascript/gscript-tidrapport/Code.gs`
3. In the editor: **Project Settings → Script Properties** → add
   `KALENDER_TIDRAPPORT_URL` = your ICS calendar URL.
4. Deploy as Web App:
   - Execute as: `Me`
   - Who has access: `Anyone` (needed for the public GitHub Pages page to call it)
5. Copy the `/exec` URL and paste it into `Apps Script API base` on the
   `tidrapport-export` page.

## Request

```text
...?action=getTidrapport&yearMonth=2026-04&prefix=ACME
```

JSONP is supported via `&callback=<functionName>` as a CORS fallback, same as the other
backend.

## Redeploying after code changes

Editing `Code.gs` in the browser editor is not enough — Web Apps only serve the last
**deployed version**. After changing the code: **Deploy → Manage deployments → (pencil
icon on the active deployment) → Version: New version → Deploy**. This keeps the same
`/exec` URL while updating what it runs.
