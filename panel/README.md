# UniPlanners admin panel

The panel runs as a separate Vite application: port 5174 in development, `panel.uniplanners.org` in production. It manages each university's site settings, survey and curricula, and the panel accounts themselves.

## Accounts and permissions

Everyone signs in with an e-mail address, a password and a code from an authenticator app (two-factor sign-in is mandatory).

There are three levels:

| Role | Can do |
| --- | --- |
| **Superadmin** | Everything. Manages accounts and permissions, global settings (font), the audit log and site traffic. |
| **Editor** of a university | Changes that university's site settings, survey and curricula. Sees its results and activity. |
| **Viewer** of a university | Sees that university's settings, survey, results, curricula and activity. Cannot change anything. |

A person can hold different roles at different universities (for example editor at Bilkent, nothing at Özyeğin). Nobody reaches the pages or the API routes of a university they have no role at. The API checks this on every request; hiding pages in the panel is only a convenience.

### First superadmin (once per server)

Without accounts nobody can sign in. On the server:

```bash
cd /opt/uniplanner/app/backend
node scripts/create-admin.mjs you@example.com --name "Ad Soyad"
```

Run it as root: it reads the database settings from `/etc/uniplanner/backend.env`.

The script prints a one-time setup link, valid for 72 hours. Opening it lets you choose a password and scan the two-factor QR code.

The same script with `--reset` recovers a superadmin who lost their password or phone.

### Adding people

A superadmin adds people under **Kullanıcılar ve yetkiler** and picks a role for each university. The panel shows a one-time setup link once. Send it only to that person; they choose their own password and set up two-factor. **Sıfırla** issues a new link and clears the old password and two-factor.

### Security notes

- **Sessions:** HttpOnly, `SameSite=Strict` cookie scoped to `/api/admin`. Only a hash of the token is stored. A session ends after 2 hours idle and at most 12 hours after sign-in. Disabling or resetting an account ends its sessions at once.
- **CSRF:** state-changing requests need the `X-Panel-Request` header and a same-host `Origin`.
- **Brute force:** 5 wrong passwords or codes lock an account for 15 minutes, and each sign-in attempt allows 5 codes. Unknown e-mails and wrong passwords get the same answer and take the same time.
- **No IP addresses:** visitor and admin IPs are not used or stored anywhere. The API drops the headers that carry them, and nginx keeps no access log. Protection works per account, not per IP.
- **Two-factor secrets:** encrypted at rest (AES-256-GCM) with a key derived from `ADMIN_SECRET` in `/etc/uniplanner/backend.env`. `ADMIN_SECRET` is no longer a login key, but it must stay set and unchanged: changing it invalidates every two-factor setup, and everyone would then need a reset.
- **Codes:** a two-factor code works only once.
- **No public access:** the public site's nginx answers 404 for `/api/admin`; the API is only reachable through the panel host.
- **Audit log:** every sign-in, failed attempt and change is recorded with who did it and when. Superadmins see all of it; each university's activity page shows its own entries.

## What lives where

- **Site settings:** `site-settings.json` holds the `global` settings (font) and a block per university (term, survey link, announcement link, catalog notice). The public site asks for its university with `/api/site-settings?university=bilkent`; one university's announcement never appears on another's pages.
- **Surveys:** `surveys/<university>.json` holds the live survey and every earlier version. Changing the questions starts a new version; responses keep their version, and results are read against the questions that were asked. Renaming or closing a survey keeps the version.
- **Curricula:** Özyeğin's are uploaded here from SIS Excel files (see below). Bilkent's ship with the site (`frontend/public/data/bilkent`), imported by `scripts/bilkent/import-stars-curriculum.mjs`; the panel shows which programs are listed and how complete their elective pools are.

These files are under the mutable data directory (`backend/data` locally, `/var/lib/uniplanner/data` in production), which deployments preserve and the daily backup includes. Accounts, sessions and the audit log are in PostgreSQL.

## Local development

```bash
# backend/.env: DB_* settings and an ADMIN_SECRET of 32+ characters
cd backend && npm start
node scripts/create-admin.mjs you@example.com --panel-url http://localhost:5174
cd ../panel && npm install && npm run dev
```

Open the printed setup link.

## Curriculum import (Özyeğin)

1. Select the undergraduate program.
2. Upload its `.xls` or `.xlsx` curriculum file. Rows with a course code become normal courses; rows with an empty code and a `TITLE` become elective requirements.
3. For each unique requirement, choose an existing reusable elective pool or upload its elective-course Excel file once.
4. Save the curriculum and preview the result.
