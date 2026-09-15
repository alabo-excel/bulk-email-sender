# Cold Email Sender

Upload a CSV of contacts, pick who should hear from you based on the data in
it, write one personalized template, and send over your own SMTP account.

Built with React Router v8 (framework mode), Tailwind v4 and nodemailer.

## How it works

1. **Upload** a CSV (or paste one). Every column becomes a merge tag.
2. **Pick the email column** — it is auto-detected, override it if the guess is
   wrong.
3. **Filter** the list with rules on any column — `industry equals SaaS`,
   `employees greater than 50`, `last_contacted is empty` — combined with
   match-all or match-any.
4. **Compose** a subject and body using `{{column}}` tags, with a live preview
   rendered against the first real recipient.
5. **Send.** Every address gets its own individually addressed email, throttled
   by a delay you choose. You land on a per-contact report.

## Setup

```sh
npm install
cp .env.example .env   # then fill in your SMTP credentials
npm run dev
```

Open http://localhost:5173 and check **Settings** — it shows which variables
are set, verifies the SMTP connection, and sends a test email before you touch
a real list. `sample-contacts.csv` in the repo is a ready-made list to try.

### SMTP configuration

All credentials come from environment variables; nothing is stored in the app.

| Variable | Required | Notes |
| --- | --- | --- |
| `SMTP_HOST` | yes | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | no | defaults to `587` |
| `SMTP_SECURE` | no | inferred from the port (`465` = implicit TLS) |
| `SMTP_USER` | yes | SMTP username |
| `SMTP_PASS` | yes | Gmail/Workspace needs an **App Password** |
| `MAIL_FROM_NAME` | no | display name on the From header |
| `MAIL_FROM_EMAIL` | no | defaults to `SMTP_USER` |
| `MAIL_REPLY_TO` | no | where replies should land |

## Personalization

`{{column_name}}` is replaced per contact. Matching ignores case, spaces,
underscores and hyphens, so `{{first name}}`, `{{First_Name}}` and
`{{firstname}}` all hit a `First Name` column.

Add a fallback after a pipe for contacts with a blank cell:

```
Hi {{first_name|there}}, I saw {{company|your team}} is hiring.
```

A tag that matches no column is flagged in the composer and, if you send
anyway, is left in the text verbatim rather than silently blanked.

## Who actually gets the email

Before sending, rows are dropped — and itemized in the report — when they are:

- not a valid email address,
- a duplicate of an earlier row in the same list,
- on the suppression list (per-campaign box, or added in an earlier run),
- already emailed from this list (toggleable, so follow-ups are opt-in).

Filters are re-evaluated on the server at send time; the browser's recipient
count is only a preview.

**Dry run** renders every email and produces a full report without opening an
SMTP connection. Use it on a new template first.

## What this deliberately does not do

- **No persistence.** Lists, reports and the suppression list live in server
  memory and vanish on restart. Reach for a database before using it for
  anything you need a record of.
- **No background queue.** A send runs inside the request, so the browser tab
  has to stay open until it finishes. At the default 1s delay that is roughly
  one minute per 60 contacts; for lists in the thousands, raise the delay and
  send in batches, or move sending to a job queue.
- **No open/click tracking or inbox management.**

## Sending responsibly

Cold email is regulated — CAN-SPAM in the US, GDPR/PECR in the EU and UK, CASL
in Canada, and others. At minimum you generally need a truthful From and
subject, a real postal address, and a working opt-out that you honor promptly.
The footer field is prefilled as a reminder; the suppression list is how you
honor opt-outs. Sending bulk mail through a personal mailbox can also get the
account rate-limited or suspended — check your provider's limits and use a
dedicated sending domain for volume.

## Project layout

```
app/
  lib/
    csv.ts             RFC 4180-ish parser, delimiter auto-detection
    contacts.ts        email column detection, validation, dedupe, audience
    filters.ts         filter rules and evaluation
    template.ts        {{tag}} rendering, text → HTML
    mailer.server.ts   SMTP config from env, transport, verification
    send.server.ts     campaign loop, throttling, per-contact results
    store.server.ts    in-memory lists, reports, suppression
  routes/
    home.tsx           upload + list index
    campaign.tsx       mapping, filters, composer, send
    report.tsx         per-contact send report
    settings.tsx       SMTP status, verify, test email
```

## Commands

```sh
npm run dev        # dev server
npm run typecheck  # typegen + tsc
npm run build      # production build
npm start          # serve the build
```

## Deployment

`npm run build` emits `build/client` and `build/server`; `npm start` serves
them. A `Dockerfile` is included. Set the same SMTP variables in whatever
environment you deploy to.
