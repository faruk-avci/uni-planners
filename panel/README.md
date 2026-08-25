# UniPlanner admin panel

The curriculum panel runs as a separate Vite application on port 5174 in development
and at `panel.uniplanner.org` in production.

## Local development

Set a long `ADMIN_SECRET` in `backend/.env`, run the backend, and then:

```bash
cd panel
npm install
npm run dev
```

Open `http://localhost:5174`. The panel asks for `ADMIN_SECRET` once and receives an
eight-hour HttpOnly admin-session cookie. The secret is not stored in browser storage.

## Curriculum import

1. Select the undergraduate program.
2. Upload its `.xls` or `.xlsx` curriculum file.
3. Rows with a course code become normal courses.
4. Rows with an empty code and a `TITLE` become elective requirements.
5. For each unique requirement, choose an existing reusable elective pool or upload
   its elective-course Excel file once.
6. Save the curriculum and preview the result.

Local mutable data is stored under `backend/data`. Production uses
`/var/lib/uniplanner/data`, which is preserved across application deployments and is
included in the daily backup archive.

## Site settings

The **Site ayarları** card controls small public-site values without a frontend
rebuild:

- the main font used across the planner;
- the academic-term label shown in search and shared schedules;
- the survey URL (leaving it blank hides the navigation item).

These values are stored in `site-settings.json` under the same mutable data
directory as curricula and are included in production backups.
