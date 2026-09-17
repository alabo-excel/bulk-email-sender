# Cold Email Sender

Sign in with Clerk, connect your sender mailbox, upload CSV contacts, and send personalized emails over SMTP. Built with React Router 8, Jotai, Tailwind, and Nodemailer.

## Setup

Use Node 22.22+ (or a newer supported LTS release).

```sh
npm install
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from Clerk.
npm run dev
```

If `.env` already exists, add the Clerk keys without replacing it. Existing SMTP environment variables are no longer used. Configure your application's sign-in methods in the Clerk dashboard.

Open http://localhost:5173, sign up, and complete sender onboarding. Enter your sender email, SMTP host, TLS port (465 or 587), and mailbox password/app password. Use the SMTP settings supplied by your mail provider. Settings lets you update credentials, verify the connection, or send a test email.

## Local state and credentials

Jotai persists lists, suppression addresses, email bodies, send reports, and sender settings in localStorage, separately for each Clerk user. Activity shows campaigns, dry runs, and test emails. Data stays in that browser; it does not sync between devices, and clearing browser data deletes it. Storage quota errors are surfaced instead of silently discarding saves.

The mailbox password is encrypted using AES-256-GCM with a fresh salt and IV, and a key derived from a separate vault passphrase using PBKDF2-SHA-256 (600,000 iterations). The passphrase/key is not persisted. After refreshing, unlock the sender in Settings before sending. Forgetting the passphrase requires re-entering mailbox credentials. Signing out clears the unlocked password from app memory.

Encryption protects a copied localStorage password; it does not protect against malicious scripts executing in an unlocked page. Other local activity data is not encrypted. SMTP credentials are sent to the authenticated server endpoint only when needed to verify or send; they are not stored there. Deploy with HTTPS. SMTP requires TLS and public IPv4-resolvable mail servers; private network SMTP hosts are rejected.

## Sending

Upload `sample-contacts.csv` or your own CSV, choose the email column, filter contacts, and compose a template. `{{first_name|there}}` inserts a value with a fallback. Preview and dry runs do not send mail. Invalid, duplicate, suppressed, and optionally previously sent addresses are skipped.

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
