# Cold Email Sender

Sign in with Clerk, connect your sender mailbox, upload CSV contacts, and send personalized emails over SMTP. Built with React Router 8, Jotai, Tailwind, and Nodemailer.

This is a small personal outreach tool, not a bulk email platform. Campaigns are capped at 20 recipients, state lives in your browser, and sending runs in an open tab. For volume, deliverability reporting, or durable records, use a real ESP.

## Sending responsibly

Cold email is regulated — CAN-SPAM in the US, GDPR/PECR in the EU and UK, CASL in Canada, and others. At minimum you generally need a truthful From and subject line, a real postal address, and a working opt-out that you honor promptly. The footer field exists for that; the suppression list is how you honor opt-outs.

Sending bulk mail through a personal mailbox also gets accounts rate-limited or suspended, and both supported providers point volume senders elsewhere. Zoho's terms cover mailbox sending rather than campaigns (they direct you to Zoho Campaigns or ZeptoMail), and Gmail enforces a daily cap well below what sustained outreach implies. Check your plan's limit before a run, and use a dedicated sending domain for anything ongoing.

## Setup

Use Node 22.22+ (or a newer supported LTS release).

```sh
npm install
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from Clerk.
npm run dev
```

If `.env` already exists, add the Clerk keys without replacing it. Existing SMTP environment variables are no longer used. Configure your application's sign-in methods in the Clerk dashboard.

Open http://localhost:5173, sign up, and complete sender onboarding. Enter your sender email, select Zoho or Gmail, and enter your mailbox password/app password. The app automatically uses `smtp.zoho.com` for Zoho or `smtp.gmail.com` for Gmail, with TLS on port 465. The Zoho preset uses the US server. Settings lets you update credentials, verify the connection, or send a test email.

## Local state and credentials

Jotai persists lists, suppression addresses, email bodies, send reports, and sender settings in localStorage, separately for each Clerk user. Activity shows campaigns, dry runs, and test emails. Data stays in that browser; it does not sync between devices, and clearing browser data deletes it. Storage quota errors are surfaced instead of silently discarding saves.

**Your mailbox password is stored in plaintext in this browser's localStorage.** It is saved alongside the rest of your local state so that sending works immediately after a refresh, with no passphrase prompt. There is no at-rest encryption.

This means anyone who can read your browser profile can read the password — another user of the same OS account, a backup or sync of the profile directory, browser devtools, or any script that runs on the page. Treat it the way you would treat a password saved in your browser's password manager, and prefer a provider app-password (which you can revoke individually) over your main account password.

SMTP credentials are sent to the authenticated server endpoint only when needed to verify or send; they are not stored there. Deploy with HTTPS. SMTP requires TLS and public IPv4-resolvable mail servers; private network SMTP hosts are rejected.

Signing out or switching Clerk accounts clears the local state, including the stored password. Clearing browser data removes it too.

## Sending

Upload `sample-contacts.csv` or your own CSV, choose the email column, filter contacts, and compose a template. `{{first_name|there}}` inserts a value with a fallback. Preview and dry runs do not send mail. Invalid, duplicate, suppressed, and optionally previously sent addresses are skipped.

Campaigns are limited to 20 eligible recipients, including dry runs. Narrow your filters or upload a smaller list when the audience exceeds the cap.

Keep the tab open while sending. Each recipient's rendered email and result is saved locally. An interrupted request is recorded as unconfirmed; check your mailbox before retrying because a network failure can occur after delivery. There is no background queue or open/click tracking.

## Commands

```sh
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

Production builds go to `build/client` and `build/server`. Configure Clerk production keys for your deployed domain and serve over HTTPS.

Integration references: [Clerk React Router](https://clerk.com/docs/react-router/getting-started/quickstart) and [Jotai storage](https://jotai.org/docs/utilities/storage).

## License

MIT — see [LICENSE](LICENSE).
