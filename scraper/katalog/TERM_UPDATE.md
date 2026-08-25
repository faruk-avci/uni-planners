# Term update

Use the exact term label shown by SIS:

```powershell
cd scraper\katalog
npm run update-term -- --term "2026 - 2027 Güz"
```

You do not need to download the Excel and PDF files separately. The command
runs three guarded phases:

1. Offered-course Excel files and every available ECTS/syllabus PDF download in parallel.
2. The Excel fallback mapper, ECTS mapper, and syllabus assessment processor run in parallel.
3. The validated offerings, mappings, and assessments are imported into PostgreSQL.

ECTS mappings are authoritative for courses whose PDF is available. The
curriculum index is used only when SIS does not provide a valid ECTS PDF. The
pipeline stops before database import if an Excel section is missing from the
document metadata, a downloaded file is not a real PDF, or a processor fails.

Downloads are resumable. Running the same command again validates and skips complete files, then retries only missing or invalid documents. The database phase does not start if a subject scraper or processor fails.

The PDF processors require `pdftotext` to be available on `PATH`.

Useful options:

```powershell
# Download and process without changing the database
npm run update-term -- --term "2026 - 2027 Güz" --no-import

# Reduce or increase simultaneous PDF subject bots
npm run update-term -- --term "2026 - 2027 Güz" --pdf-concurrency 2

# Show the browser for debugging SIS
npm run update-term -- --term "2026 - 2027 Güz" --headless false
```

After a successful database import, restart the backend so its catalog cache and `CATALOG_TERM` value refresh immediately.
