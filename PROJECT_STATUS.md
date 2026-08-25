# UniPlanners — Project and Production Status

Last updated: **25 August 2026**  
Repository: <https://github.com/faruk-avci/uni-planners>  
Production site: <https://uniplanners.org>  
Admin panel: <https://panel.uniplanners.org>

This document is the current technical and product handoff for UniPlanners. It
summarizes what has been built, what is confirmed live, where data comes from,
how the server is arranged, and what still needs attention.

## 1. Current production snapshot

The public production system was checked on 25 August 2026.

| Item | Current state |
| --- | --- |
| Public website | `https://uniplanners.org` — HTTP 200 |
| Admin panel | `https://panel.uniplanners.org` — HTTP 200 |
| API health | `https://uniplanners.org/api/health` — `status: ok`, `database: ok` |
| Shared-page renderer | `/share/:id` — HTTP 200 and server-rendered social metadata |
| Shared preview image | `/uniplanners-shared-preview.png` — HTTP 200 |
| Current live frontend | Matches Git commit `deddac1` |
| Catalog label | `2025-2026 Bahar` |
| Catalog size | **908 courses**, **1,563 sections** |
| Server CPU detected by app | 2 cores |
| Heavy-task workers | 1 worker thread |
| Heavy-task queue | Maximum 250 queued tasks |
| Request-log queue during check | 0 queued, 0 dropped |

The live frontend asset hashes observed after the latest deployment were:

- JavaScript: `index-DRtPgHfi.js`
- CSS: `index-CudsE0Sv.css`

The previous SIS/import run completed for **2025 - 2026 Bahar**. The scraper log
showed a complete pass through the configured subject list, and the assessment
import reported 2,044 inserted/updated rows with zero “course not in catalog”
skips. The live `/api/stats` values above are the authoritative current course
and section counts.

## 2. Production infrastructure

### Server

- Ubuntu Server 24.04 LTS
- Public origin IP used during setup: `31.57.156.72`
- Nginx serves static frontend files and reverse-proxies API/share requests.
- Node.js runs the Express backend through systemd.
- PostgreSQL stores catalog, session, basket, sharing, game and analytics data.
- Cloudflare proxies the public domain.
- TLS is issued at the origin with Certbot/Let's Encrypt.

### Public network layout

| Address | Purpose |
| --- | --- |
| `uniplanners.org` | React frontend and same-origin `/api` |
| `www.uniplanners.org` | Same public site |
| `panel.uniplanners.org` | Curriculum/settings administration panel |
| `api.uniplanners.org` | Reserved; not currently required |

The browser intentionally uses `uniplanners.org/api` instead of a separate API
subdomain. This keeps anonymous cookies same-origin and avoids unnecessary CORS
complexity.

Only these ports are intended to be public:

- SSH: 22/tcp
- HTTP: 80/tcp
- HTTPS: 443/tcp

Node port 3001 and PostgreSQL port 5432 are not publicly exposed.

### Important server paths

| Path | Purpose |
| --- | --- |
| `/root/uni-planner` | Git clone normally used to pull updates |
| `/opt/uniplanner/app` | Deployed application copy |
| `/etc/uniplanner/backend.env` | Production secrets and backend configuration; mode 0600 |
| `/var/lib/uniplanner/data` | Mutable curricula, elective pools and site settings |
| `/var/lib/uniplanner/.cache/ms-playwright` | Production Playwright/Chromium cache |
| `/var/backups/uniplanner` | Local database and curriculum-data backups |

Never commit or print the values in `/etc/uniplanner/backend.env`. It contains
the PostgreSQL password and admin secret. Its location and file permissions are
appropriate, but it must also be backed up securely outside the server.

### Services and operations

The main service is:

```bash
sudo systemctl status uniplanner-api
```

Useful operational commands:

```bash
# Follow backend logs
sudo journalctl -u uniplanner-api -f

# Check all important services
sudo systemctl status uniplanner-api nginx postgresql

# Check public and origin health
bash deployment/ubuntu/health-check.sh https://uniplanners.org

# Create an immediate backup
sudo bash deployment/ubuntu/backup-database.sh

# Inspect the daily backup timer
sudo systemctl list-timers uniplanner-db-backup.timer
```

Daily backups are enabled through `uniplanner-db-backup.timer`. They include a
compressed PostgreSQL dump and an archive of `/var/lib/uniplanner/data`, with a
default local retention of 14 days. A copy must eventually be sent to encrypted
off-server storage; same-server backups are not disaster recovery.

## 3. Application architecture

```text
Cloudflare
    |
    v
Nginx :80/:443
    |-- /, /curriculum, /how-to       -> frontend/dist (React SPA)
    |-- /assets/* and preview images  -> frontend/dist
    |-- /share/:id                    -> Express HTML metadata renderer
    |-- /api/*                        -> Express on 127.0.0.1:3001
    |                                      |
    |                                      |-- PostgreSQL
    |                                      |-- curriculum JSON storage
    |                                      `-- worker_threads pool
    |
    `-- panel.uniplanners.org         -> panel/dist + protected admin API
```

The project is split into four major areas:

- `frontend/`: public React/Vite application.
- `backend/`: Express API, PostgreSQL schema, schedule engine and workers.
- `panel/`: separate React/Vite administration interface.
- `scraper/katalog/`: SIS Excel/PDF download, processing and import pipeline.

## 4. Public website features

### Header and academic profile

- Clean routes are used: `/`, `/curriculum`, `/how-to`, `/share/:id`.
- Turkish and English are supported.
- The public survey link comes from admin-controlled site settings.
- There is no public dark-mode button.
- Public color palettes are selectable: İris, Obsidyen, Kampüs, Ege,
  Kazdağları, Mor Salkım and Günbatımı.
- A profile bar below the header shows Özyeğin University, **Bölümünüz** and
  optional **Sınıfınız**.
- Major selection is saved locally and also stored against the anonymous server
  session for analytics.
- Class/year is currently stored only in browser `localStorage`; it is not yet
  sent to the server or available in analytics.
- The major picker is grouped by faculty, highlights the active selection, and
  is presented as a responsive modal/bottom sheet.
- Users can select Master, Doctorate or “I prefer not to share” under Other.

### Course search and section selection

- Search by course code or course name.
- The initial page opens without a default EE search.
- Results show open/passive status with green/gray dots.
- Course cards show section counts in a compact location.
- Users can add all available sections or inspect/select individual sections.
- Sections with identical times can be grouped and added together.
- Multi-meeting schedules are shown line-by-line instead of side-by-side.
- Prerequisites and corequisites are visible where provided by the catalog.
- Search additions do not automatically add a corequisite.
- Corequisites are checked when generating a schedule. The warning lets the
  user add the missing course, continue anyway or close the dialog.
- Curriculum, curriculum-elective and fitting-course additions may add their
  known corequisite automatically and notify the user about both additions.

### Basket

- The anonymous basket is persisted through the API.
- Course-add source is tracked, including search, curriculum, curriculum
  elective, elective popup, fitting results and corequisite flows.
- Named baskets can be saved, loaded and deleted.
- Save and clear controls sit after the basket course list.
- A yellow warning appears above 36 ECTS.
- A red warning appears above 42 ECTS.
- These are warnings only; the app does not block the user.
- Desktop keeps the basket in the right sidebar.
- Mobile keeps a fixed basket dock on Planner, Curriculum and How-to pages.
- The mobile dock opens the existing basket sheet from any of those pages.
- Generating from the sheet while on another page first returns to Planner so
  the generated schedules are visible.

### Schedule generation

- The backend generates conflict-free section combinations.
- A user may pin exact sections or let the generator select from all sections.
- Users can request free weekdays.
- If the chosen free day is impossible, no fallback schedule is silently shown.
  The response explains which alternative weekdays can be free.
- Impossible baskets return diagnostics rather than only “no schedule found.”
- Diagnostics can identify unavoidable course-pair conflicts, overlapping
  times, multi-course interaction and useful course-removal options.
- The engine refuses more than 1,000,000 potential raw combinations and asks
  the user to pin some sections.
- Up to 120 schedules are requested by default, with a backend ceiling of 500.
- Heavy schedule generation runs in a worker thread instead of blocking the
  Express event loop.
- On the current two-core server the app deliberately uses one heavy worker,
  leaving one core available for the API/OS.

### Generated schedule viewer

- List and weekly-table views are available.
- The timetable has responsive mobile behavior to avoid horizontal overflow.
- Moving between generated schedules uses a short visual change indication.
- Users can inspect courses fitting the currently displayed schedule.
- Users can share a schedule, export a calendar file and request a PNG export.
- The fitting-course button appears both near the schedule actions and after
  the displayed schedule.

PNG export is functional and server-rendered, but mobile readability/visual
quality was previously considered unsatisfactory and was intentionally
deprioritized. It remains a product-quality item to revisit.

### Courses fitting a generated schedule

- Results are computed against the schedule's occupied time slots.
- The selected major determines required/elective classification.
- Required courses and elective results are grouped separately.
- Electives are presented by faculty so users can see which faculty fulfills a
  selection category.
- Only one result group can be open at a time.
- Opening a different group closes the previous group and scrolls the newly
  opened group to its heading, including on mobile.
- Filters are single-select rather than multi-select.
- An ECTS filter is shown as side-by-side chips.
- Section times and grouped-section times share aligned layouts.

Course classification uses the imported catalog's `required_programs` and
`elective_programs`, primarily derived from ECTS documents, plus curriculum
fallback mappings. Old courses may still be classified according to their
historical ECTS mapping even when a newer curriculum replaces them; that is
currently treated as a user/course-history issue rather than silently changing
the classification.

### Curriculum page

- Curricula are grouped by academic year and term.
- Normal courses and elective requirements have visually consistent rows.
- ECTS values align between normal and elective rows.
- Open/passive status is visible without writing “open/closed” on every row.
- Courses can be added directly from the curriculum.
- Elective requirement rows use a clear **Göster** button.
- The elective viewer supports ECTS chips and an “open courses first” toggle.
- Each elective viewer begins with `Tümü`; a previous viewer's ECTS choice does
  not leak into the next one.
- The elective popup does not contain the removed search bar.
- Elective-type badges use distinct colors.
- Users can view another curriculum without overwriting their saved personal
  major selection.

### Sharing and social previews

- Sharing creates an eight-character short ID stored in PostgreSQL.
- The stored row contains the anonymous creator session, major, catalog term,
  normalized schedule JSON, creation date and view count.
- A content hash prevents the same anonymous user from storing the same program
  repeatedly. Repeated sharing returns the existing ID.
- `/share/:id` has a dedicated read-only schedule viewer and not-found state.
- Viewing through the application increments the view counter.
- Social-preview bots receive metadata without incrementing the view counter.
- The homepage has a general UniPlanners Open Graph image.
- Shared links have a separate 1200×630 “a schedule was shared with you” image.
- Existing schedule links produce dynamic preview text containing term, course
  count, ECTS and a short course-code list.
- Newly copied links add `?v=2` to bypass WhatsApp's cache from before dedicated
  shared previews existed. The database ID remains unchanged.

If WhatsApp has already cached an older exact URL without a preview, copy the
link again from the deployed Share button. Link-preview behavior also depends on
the recipient's WhatsApp preview/privacy settings.

### Calendar export

- Calendar export is generated by the backend from normalized schedule slots.
- It produces an `.ics` file with weekly events in the Europe/Istanbul timezone.
- The currently hard-coded teaching range starts on 21 September 2026 and ends
  on 6 January 2027.

Important: the public catalog label is currently `2025-2026 Bahar`, while those
calendar dates correspond to a later academic period. The calendar date range
must be moved into term-specific site settings or term data before relying on it
for another catalog release.

### Dino mode

- Clicking/tapping the UniPlanners logo 20 times toggles Dino mode.
- The game appears as an in-page section rather than a popup.
- It supports collapse/expand and mobile input.
- Players must enter an `@ozu.edu.tr` email.
- The full email address is not displayed publicly; the local part is shown.
- Obstacles use the custom names Bütler, Zamlar, Midtermler, Akkol and Finaller.
- All-time personal bests are stored in PostgreSQL.
- The leaderboard now requests and labels the Top 25.

## 5. Curriculum administration panel

The panel is available at `panel.uniplanners.org`.

- Admin authentication uses `ADMIN_SECRET` once.
- The backend creates an eight-hour HttpOnly admin-session cookie.
- The secret is not compiled into the panel JavaScript or stored in browser
  local storage.
- A curriculum `.xls`/`.xlsx` can be uploaded for a selected undergraduate
  program.
- Rows containing course codes become ordinary curriculum courses.
- Rows without a course code but containing a `TITLE` become elective
  requirements.
- Each unique elective requirement can use an existing reusable elective pool
  or a newly uploaded elective Excel file.
- Duplicate elective files are unnecessary when multiple curricula/years use
  the same pool.
- The panel can preview and save parsed curricula.
- It can list and view existing curricula and elective pools.
- Site settings allow changing the public font, catalog-term label and survey
  URL without rebuilding the frontend.

Production curriculum files are intentionally outside the Git deployment tree
at `/var/lib/uniplanner/data`. Application updates preserve them. Seed/example
files remain under `backend/data` in Git, but production mutable data is the
authoritative copy.

Current repository curriculum seeds exist for AVM, BUS, CS, ECON, EE, ENTR, HUK
and PLT, along with reusable elective-pool JSON files. This does not mean every
Özyeğin program already has a complete production curriculum; curriculum
coverage should be reviewed and expanded through the panel.

Cloudflare Access or another identity-aware proxy should be added in front of
the panel before broader administrator use. The application secret/cookie is a
good first layer but should not be the only public-edge protection.

## 6. Course catalog and scraper pipeline

There is one supported normal workflow for a new SIS term:

```bash
sudo bash deployment/ubuntu/update-term.sh "2026 - 2027 Güz"
```

Do not normally run the internal scraper scripts one by one. The wrapper:

1. Creates a recovery backup.
2. Runs the term pipeline as the restricted `uniplanner` service user.
3. Downloads offered-course Excel files from SIS.
4. Downloads available ECTS and syllabus PDFs in parallel.
5. Processes Excel and PDF sources separately.
6. Builds authoritative ECTS program mappings.
7. Builds curriculum fallback mappings where needed.
8. Merges authoritative and fallback mappings.
9. Extracts assessment weights from syllabi.
10. Validates all generated data before import.
11. Imports catalog courses, sections and assessments into PostgreSQL.
12. Updates `CATALOG_TERM` in `/etc/uniplanner/backend.env`.
13. Restarts the API and performs a health check.

Downloads are resumable. Valid existing Excel/PDF files are skipped on rerun,
while missing or invalid downloads are retried. A syllabus response that is not
a real PDF is logged as unavailable instead of being treated as valid content.

Generated term files live under:

```text
/opt/uniplanner/app/scraper/katalog/downloads/<term>/
```

The scraper requires Node.js 24, Playwright Chromium and `pdftotext` from
`poppler-utils`; the Ubuntu setup scripts install these dependencies.

To prepare and validate a term without importing it:

```bash
cd /opt/uniplanner/app/scraper/katalog
sudo -H -u uniplanner npm run term:prepare -- --term "2026 - 2027 Güz"
```

## 7. PostgreSQL data model

The backend creates required tables at startup if they do not exist.

| Table | Purpose |
| --- | --- |
| `catalog_courses` | Course metadata, ECTS, requisites and program mappings |
| `catalog_sections` | Sections, instructors and meeting schedules |
| `course_assessments` | Syllabus-derived assessment categories and weights |
| `sessions` | Anonymous sessions and current major choice |
| `basket_items` | Current server-side anonymous basket and add source |
| `saved_baskets` | User-named basket snapshots |
| `shared_schedules` | Short-ID schedule shares and view counters |
| `course_add_events` | Course-add analytics by source and selection mode |
| `major_selection_events` | Major choices and where the choice occurred |
| `dino_high_scores` | All-time game bests by ÖzÜ email |
| `site_events` | Explicit frontend analytics events |
| `server_request_logs` | Detailed API request/action logs |

There is no conventional user account/login system. A long-lived anonymous
session cookie links basket, saved baskets, major choice, sharing and analytics.
The Dino game separately accepts an ÖzÜ email for its leaderboard.

## 8. Logging and analytics

API activity is logged with:

- Request ID returned as `X-Request-Id`.
- Anonymous session ID when available.
- Action name, HTTP method/path and status.
- Request duration and request/response sizes.
- IP address, user agent and referrer.
- Safe action-specific metadata.

Tracked server actions include:

- Course searches and course views.
- Basket loads/replacements/clears.
- Saved-basket operations.
- Major choices and source (`generate`, `curriculum`, `fitting`, `profile`, etc.).
- Course additions and source.
- Schedule generation, fitting, PNG and calendar exports.
- Shared-schedule creation and viewing.
- Dino leaderboard loads and score submissions.
- Admin curriculum and settings operations.

Request logs are queued and flushed in batches so every request does not block
on an individual database insert. The current configured queue maximum is
20,000; the health check reported no queued or dropped logs.

Analytics endpoints already exist for major selection, course-add sources,
recent events, request logs and summaries. A complete visual analytics/admin
dashboard has not yet been built.

Privacy note: request logging stores IP address, user agent and referrer. Before
public promotion, publish an appropriate privacy notice, define retention rules
and ensure analytics access is protected.

## 9. Deployment and updates

### Normal application update

Use the combined update script for normal deployments:

```bash
cd /root/uni-planner
git pull
sudo bash deployment/ubuntu/update.sh "$PWD"
```

It copies the application to `/opt/uniplanner/app`, installs locked
dependencies, builds the public frontend and panel, restarts the API, validates
Nginx and performs an origin health check.

### Application-only update

When explicitly instructed and no Nginx changes are required:

```bash
sudo bash deployment/ubuntu/20-application.sh "$PWD"
```

### Nginx/TLS warning

`30-nginx.sh` regenerates the Nginx site from the base template. During the last
deployment this removed Certbot's HTTPS additions and caused Cloudflare error
521 until TLS was reinstalled.

Until that deployment script is improved, if `30-nginx.sh` is run manually,
immediately run:

```bash
sudo DOMAIN=uniplanners.org EMAIL=faruk.avci@ozu.edu.tr \
  bash deployment/ubuntu/40-tls.sh
```

Do not run `30-nginx.sh` for ordinary frontend/backend-only updates.

### npm warnings

The latest production builds completed successfully. npm reported:

- Pending `allow-scripts` review for the Vite/esbuild postinstall script.
- Dependency audit findings in the public frontend and panel dependency trees.

These warnings did not stop the build. Do not run `npm audit fix --force`
blindly because it may introduce breaking dependency upgrades. Review the exact
advisories and test targeted upgrades in a branch.

## 10. Known limitations and next priorities

1. **Calendar dates are hard-coded.** Move teaching start/end dates into
   term-specific settings before the next catalog change.
2. **Curriculum coverage is incomplete.** Continue importing and validating all
   undergraduate programs through the admin panel.
3. **PNG export needs another design/quality pass**, especially for phone users.
4. **Admin analytics UI is not built yet.** Logging/data endpoints exist, but a
   useful dashboard still needs to be designed.
5. **Admin edge protection should be strengthened** with Cloudflare Access or an
   equivalent identity layer.
6. **Off-server backups are not configured.** Daily local backups alone cannot
   recover from total server loss.
7. **Logging retention/privacy rules need definition** because IP/user-agent data
   is stored.
8. **Dependency advisories need review** without using force upgrades.
9. **Nginx/TLS regeneration needs hardening** so rerunning the Nginx script cannot
   temporarily remove HTTPS.
10. **Grade/year is local-only.** If grade analytics are desired, add explicit
    server persistence and update the privacy disclosure.
11. **Load testing should be repeated against production-like data** before a
    large launch. Worker isolation is in place, but real concurrency and latency
    should be measured rather than assumed.

## 11. Recommended immediate checks

```bash
# Confirm repository/deployed services
cd /root/uni-planner
git status
git log -1 --oneline
sudo systemctl status uniplanner-api nginx postgresql --no-pager

# Confirm public health and catalog size
curl -fsS https://uniplanners.org/api/health
curl -fsS https://uniplanners.org/api/stats

# Confirm the shared preview renderer and image
curl -fsS https://uniplanners.org/share/ABCDEFGH | grep -E 'og:title|og:image'
curl -I https://uniplanners.org/uniplanners-shared-preview.png

# Confirm backups
sudo systemctl list-timers uniplanner-db-backup.timer
sudo ls -lh /var/backups/uniplanner
```

For an actual shared schedule, replace `ABCDEFGH` with a real share ID. A fake ID
correctly returns “shared schedule not found” metadata while still loading the
React not-found viewer.

## 12. Git status at this handoff

- Branch: `main`
- Latest feature commit: `deddac1` — “Keep mobile basket available across pages”
- Production frontend matches that commit's built asset hashes.
- This document records the verified production and repository state following
  that feature release.
