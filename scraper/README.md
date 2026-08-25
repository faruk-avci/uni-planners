# UniPlanners scraper

There is one supported workflow: update one SIS term from beginning to end.

```bash
cd scraper/katalog
npm run term:update -- --term "2026 - 2027 Güz"
```

Do not run the internal JavaScript files individually for a normal term update.
`update_term.js` coordinates them in the correct order and stops before import if
any download, processor, or validation step fails.

## What the command does

| Phase | Inputs | Outputs |
| --- | --- | --- |
| 1. Download | Exact SIS term label | Offered-course Excel files plus available ECTS and syllabus PDFs |
| 2. Process | Downloaded Excel/PDF files and `data/course_major_index.json` | Program mappings and assessment weights |
| 3. Import | Validated processor output | PostgreSQL catalog courses, sections, and assessments |

The Excel and document downloaders run in parallel. Processing begins only after
downloads finish. ECTS program mappings override curriculum fallbacks when a valid
ECTS PDF exists. Downloads are resumable, so rerunning the same term skips valid
files and retries missing or invalid ones.

## Safe preparation without changing PostgreSQL

```bash
npm run term:prepare -- --term "2026 - 2027 Güz"
```

This performs the downloads, processors, and validation but skips phase 3.

## Useful options

```bash
# Show every supported option
npm run help

# Show Chromium while diagnosing SIS interaction
npm run term:prepare -- --term "2026 - 2027 Güz" --headless false

# Change the number of parallel document bots (1-8)
npm run term:prepare -- --term "2026 - 2027 Güz" --pdf-concurrency 3
```

## Ubuntu 24.04 production command

After the production installer has run, update a term from the repository root:

```bash
sudo bash deployment/ubuntu/update-term.sh "2026 - 2027 Güz"
```

That wrapper creates a database backup first, runs the pipeline with the production
database environment, updates `CATALOG_TERM`, restarts the API, and performs a health
check. The scraper never needs a committed `.env` file on the server.

## Active files

- `update_term.js`: the only normal entry point and phase coordinator.
- `scrape_offerings.js`: downloads offered-section Excel files.
- `run_documents.js`: controls parallel subject document bots.
- `scrape_documents.js`: downloads ECTS and syllabus PDFs for one subject.
- `extract_programs.js`: reads authoritative required/elective mappings from ECTS.
- `build_program_mappings.js`: builds curriculum fallbacks when ECTS is missing.
- `merge_program_mappings.js`: combines authoritative and fallback mappings.
- `parse_assessments.js`: extracts assessment weights from syllabi.
- `import_all_offerings.js`: imports courses and sections into PostgreSQL.
- `import_assessments.js`: imports assessment weights into PostgreSQL.
- `db.js`: shares PostgreSQL environment names with the backend.
- `codes.json`: SIS subject list used by both downloaders.

Generated files go under `scraper/katalog/downloads/<term>/` and are ignored by Git.

## Requirements

- Node.js 24
- PostgreSQL reachable through `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and
  `DB_NAME`
- Chromium installed through Playwright
- `pdftotext` from `poppler-utils`

The production installation scripts install these requirements. For a manual
machine setup:

```bash
cd scraper/katalog
npm ci
npx playwright install --with-deps chromium
sudo apt install poppler-utils
```
