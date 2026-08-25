# UniPlanner production deployment

The recommended public layout is:

- `uniplanner.org`: React site and same-origin `/api` reverse proxy
- `www.uniplanner.org`: redirects/serves the same site (Certbot manages HTTPS)
- `panel.uniplanner.org`: authenticated curriculum administration panel
- `api.uniplanner.org`: reserved; unnecessary until an external/mobile API needs it

Keeping the browser API at `uniplanner.org/api` avoids cross-origin cookie and CORS
complexity. Do not expose Node port 3001 or PostgreSQL port 5432 publicly.

## Server assumptions

- Ubuntu Server 24.04 LTS
- A non-root SSH user with sudo access and SSH-key authentication
- At least 2 CPU cores and 2 GB RAM (4 cores / 4 GB is a comfortable starting point)
- DNS `A` records for `@`, `www`, and `panel` pointing to the server

Start with Cloudflare records set to **DNS only** while Let's Encrypt is issued. Proxying
can be enabled afterward. Use Cloudflare SSL mode **Full (strict)** once the origin
certificate is live.

## Fresh server

Copy or clone this repository onto the server, enter its root, then run:

```bash
sudo DOMAIN=uniplanner.org EMAIL=you@example.com \
  bash deployment/ubuntu/install-all.sh "$PWD"
```

If SSH uses a nonstandard port, also pass `SSH_PORT=your_port` so UFW does not lock
you out.

This installs verified Node.js 24 LTS, PostgreSQL, Nginx, Certbot and UFW; creates the
database and secrets; builds the frontend; runs Node under systemd; configures HTTPS;
installs the scraper, Chromium, and PDF tools; and enables daily database and
curriculum-file backups.

CPU-heavy schedule/image work automatically uses up to four worker threads while
leaving capacity for the API event loop. Override `HEAVY_WORKERS` in the environment
file only after measuring the actual server.

The generated production secrets live at `/etc/uniplanner/backend.env` with mode 0600.
Back it up securely. Never commit it.

## Catalog data

The application creates its schema on startup, but a fresh database does not contain
the course catalog, offerings, ECTS, syllabus, or curriculum data. Before opening the
site, either restore a known-good production dump or run the scraper/import pipeline.

Restore a dump (this replaces database objects and requires explicit confirmation):

```bash
sudo CONFIRM_RESTORE=ozu_schedule \
  bash deployment/ubuntu/restore-database.sh /absolute/path/ozu_schedule.dump
```

For a new SIS term, use the guarded production wrapper. It backs up the database,
runs the complete Excel/PDF pipeline, updates `CATALOG_TERM`, restarts the API, and
checks its health:

```bash
sudo bash deployment/ubuntu/update-term.sh "2026 - 2027 Güz"
```

See `scraper/README.md` for the pipeline and troubleshooting commands.

## Deploy an update

After pulling/copying the new repository version:

```bash
sudo bash deployment/ubuntu/update.sh "$PWD"
```

The update rebuilds dependencies and frontend assets, restarts the API, validates
Nginx, and runs a local health check.

## Operations

```bash
# API logs
sudo journalctl -u uniplanner-api -f

# Service state
sudo systemctl status uniplanner-api nginx postgresql

# Public health check
bash deployment/ubuntu/health-check.sh https://uniplanner.org

# Immediate database backup
sudo bash deployment/ubuntu/backup-database.sh

# Backup timer
sudo systemctl list-timers uniplanner-db-backup.timer
```

Backups are custom-format PostgreSQL dumps in `/var/backups/uniplanner` and default to
14-day local retention. A local backup is not disaster recovery: copy encrypted
backups to another provider/server before launch.

## Admin panel and API subdomains

The panel uses an HttpOnly, short-lived admin session created from the generated
`ADMIN_SECRET`; the secret is never compiled into browser JavaScript. Adding an
identity-aware proxy such as Cloudflare Access is still recommended before public
production use.

If `api.uniplanner.org` is introduced later, add its Nginx/TLS configuration and exact
CORS origin deliberately. The current same-origin architecture does not need it.

## Before launch

- Verify the current catalog term and all curriculum imports.
- Make an off-server backup and perform one restore rehearsal.
- Confirm `https://uniplanner.org/api/health` returns `status: ok`.
- Confirm only ports 22, 80, and 443 are reachable publicly.
- Configure uptime monitoring for the health endpoint and disk-space alerts.
- Keep Ubuntu packages patched and test deployments on a staging VM first.
