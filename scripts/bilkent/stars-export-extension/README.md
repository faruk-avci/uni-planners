# Bilkent STARS Export (Chrome extension)

Saves the Bilkent STARS curriculum, elective-pool or course-offerings page you
are viewing as JSON. It reads only the page that is already open in the tab. It never
fetches, opens or clicks anything: you visit each page yourself and press the
button.

STARS's robots.txt disallows automated access to these pages, so a person
browsing them and saving them by hand is the only way UniPlanners gets this data.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `scripts/bilkent/stars-export-extension` folder.

## Use

1. Open a curriculum page, for example
   `https://stars.bilkent.edu.tr/webserv/curriculum/?dil=tur&options=&bolum_kod=MATH&program_kod=MATH_BS_2018&track_kod=&mod=tntm`.
2. A **UniPlanners · Bilkent** panel appears in the bottom-right corner. Press **JSON indir**.
3. The panel lists the program's elective pools. Click a pool to open it (the
   page's own link), then press **JSON indir** on that page as well. Saved pools
   get a ✓ on the curriculum panel.

4. For section times, open a subject's offerings page, for example
   `https://stars.bilkent.edu.tr/homepage/print/plainOfferings.php?COURSE_CODE=EEE&SEMESTER=20261`,
   and press **JSON indir**. The panel lists the subject codes already saved for
   that term.

Files land in the Chrome downloads folder:

```
uniplanners-bilkent/curriculum/MATH_BS_2018.json
uniplanners-bilkent/pools/MATH_BS_2018/MATH_TGE.json
uniplanners-bilkent/offerings/20261/EEE.json
```

A program with a track adds `__<TRACK>` to its file and pool-folder name. A page
opened in English (`dil=eng`) is saved as `MATH_BS_2018.eng.json`, so it does
not overwrite the Turkish copy.

## Import into the local preview

```
node scripts/bilkent/import-stars-curriculum.mjs "%USERPROFILE%/Downloads/uniplanners-bilkent"
```

You can also copy the `curriculum/` and `pools/` folders into `bilkent-data/` and
run the importer without an argument. The importer prints, for each program, how
it differs from the catalog and which elective pools are still missing.

Section times go into `frontend/public/data/bilkent/sections.json`:

```
node scripts/bilkent/import-stars-offerings.mjs "%USERPROFILE%/Downloads/uniplanners-bilkent"
```

## JSON format

Curriculum (`kind: "curriculum"`):
`semesters[year][fall|spring|summer]` holds the term's rows.

- A course row is `{ code, name, credits }`.
- An elective slot is `{ elective: true, name, count, credits, creditsPerSlot, pool }`.

`pools` maps each pool code to `{ name, url }`.

Elective pool (`kind: "elective-pool"`):
`{ program, pool, title, courses: [{ code, name, credits }] }`.

Offerings (`kind: "offerings"`):
`{ subject, semester, term, department, sections: [...] }`. Each section is
`{ code, section, name, instructors, bilkentCredits, ects, meetings, quota, enrolled, available }`;
a meeting is `{ day, start, end, room, kind }`, with `kind` being `lecture`, `lab` ([L]) or `spare` ([S]).

Columns the extension does not recognise (when a page is opened with more
options) are kept under `extra` on each row.
