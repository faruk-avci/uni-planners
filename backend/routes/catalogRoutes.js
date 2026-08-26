import express from 'express';
import { pool } from '../config/db.js';
import { formatCourseCode } from '../utils/helpers.js';
import {
  getCatalog,
  stripEntry,
  equivalentProgramsFor,
  curriculumData,
  CURRICULUM_PROGRAMS
} from '../services/catalogService.js';
import { listCurriculumData, readSiteSettings } from '../services/curriculumStore.js';

const router = express.Router();

router.get('/site-settings', (_req, res) => {
  const { mainFont, catalogTerm, surveyUrl } = readSiteSettings();
  res.set('Cache-Control', 'no-store');
  res.json({ mainFont, catalogTerm, surveyUrl });
});

// Many different students search the same handful of popular course codes.
// The catalog itself is already in-memory (see getCatalog), so this isn't
// about avoiding a DB hit -- it's about skipping the repeated filter/sort/
// serialize work for an identical query. Keyed on the catalog's own
// loadedAt so a reload (new term data) invalidates everything at once
// instead of needing a separate TTL to reason about.
const searchCache = { generation: 0, entries: new Map() };
const SEARCH_CACHE_MAX_ENTRIES = 500;

router.post('/courses/search', async (req, res) => {
  const query = (req.body.query || '').trim().toUpperCase();
  const major = (req.body.major || '').trim().toUpperCase();
  const type  = (req.body.type  || 'all').trim().toLowerCase();
  const equivalentPrograms = equivalentProgramsFor(major);

  if (query.length < 2 && !major) {
    return res.json([]);
  }

  try {
    const { all, loadedAt } = await getCatalog();
    if (searchCache.generation !== loadedAt) {
      searchCache.generation = loadedAt;
      searchCache.entries.clear();
    }
    const cacheKey = `${query}|${major}|${type}`;
    const cached = searchCache.entries.get(cacheKey);
    if (cached) {
      res.locals.activity = { ...res.locals.activity, resultCount: cached.length, cacheHit: true };
      return res.json(cached);
    }

    const q = query.replace(/\s+/g, '');

    const matches = all.filter(c => {
      if (q && !c.normCode.includes(q)) return false;
      if (major) {
        const isReq = equivalentPrograms.some(program => c.required.includes(program));
        const isEle = equivalentPrograms.some(program => c.elective.includes(program));
        if (type === 'required') return isReq;
        if (type === 'elective') return isEle;
        return isReq || isEle;
      }
      return true;
    });

    matches.sort((a, b) => {
      const ra = q && a.normCode.startsWith(q) ? 1 : 2;
      const rb = q && b.normCode.startsWith(q) ? 1 : 2;
      return ra - rb || a.normCode.localeCompare(b.normCode);
    });

    const result = matches.map(stripEntry);
    if (searchCache.entries.size < SEARCH_CACHE_MAX_ENTRIES) {
      searchCache.entries.set(cacheKey, result);
    }

    res.locals.activity = { ...res.locals.activity, resultCount: result.length };
    res.json(result);
  } catch (err) {
    console.error('POST /courses/search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/courses/:code', async (req, res) => {
  const code = String(req.params.code || '').replace(/\s+/g, '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const { byCode } = await getCatalog();
    const entry = byCode.get(code);
    if (!entry) return res.status(404).json({ error: 'not found' });
    res.locals.activity = { ...res.locals.activity, found: true, sectionCount: entry.sections?.length || 0 };
    res.set('Cache-Control', 'public, max-age=300');
    res.json(stripEntry(entry));
  } catch (err) {
    console.error('GET /courses/:code error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/assessments', async (req, res) => {
  const rawCodes = req.body.codes || [];
  if (rawCodes.length === 0) {
    return res.json({});
  }

  const codes = rawCodes.map(c => c.replace(/\s+/g, '').toUpperCase());

  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_assessments WHERE course_code = ANY($1) ORDER BY course_code, category, id`,
      [codes]
    );

    const result = {};
    for (const a of rows) {
      const formatted = formatCourseCode(a.course_code);
      if (!result[formatted]) result[formatted] = [];
      result[formatted].push({
        type: a.assessment_type,
        category: a.category,
        weight: a.weight ? parseFloat(a.weight) : null,
        raw_text: a.raw_text
      });
    }

    res.locals.activity = { ...res.locals.activity, courseCount: codes.length, assessmentCourseCount: Object.keys(result).length };
    res.json(result);
  } catch (err) {
    console.error('POST /assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/majors', async (_req, res) => {
  try {
    const r1 = await pool.query('SELECT DISTINCT unnest(required_programs) AS program FROM catalog_courses');
    const r2 = await pool.query('SELECT DISTINCT unnest(elective_programs) AS program FROM catalog_courses');
    const majors = new Set([
      ...Object.values(CURRICULUM_PROGRAMS).flat(),
      ...r1.rows.map(r => r.program),
      ...r2.rows.map(r => r.program),
    ]);
    res.json(Array.from(majors).filter(Boolean).sort());
  } catch (err) {
    console.error('GET /majors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/curriculums', (_req, res) => {
  try {
    const programs = listCurriculumData().map(data => {
      const id = data.id;
      const programCodes = data.programCodes || CURRICULUM_PROGRAMS[id] || [];
      const mandatoryCount = Object.values(data.semesters || {}).reduce(
        (sum, year) => sum + (year.fall?.length || 0) + (year.spring?.length || 0), 0
      );
      const electiveCount = Object.values(data.electives || {}).reduce((sum, list) => sum + list.length, 0);
      return {
        id,
        programCodes,
        title_tr: data.title_tr,
        title_en: data.title_en,
        faculty: data.faculty || '',
        mandatoryCount,
        electiveCount,
      };
    }).sort((a, b) => a.title_tr.localeCompare(b.title_tr, 'tr'));
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(programs);
  } catch (err) {
    console.error('GET /curriculums error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/curriculums/:id', async (req, res) => {
  const id = String(req.params.id || '').toLowerCase();
  const data = curriculumData(id);
  if (!data) return res.status(404).json({ error: 'curriculum not found' });

  try {
    const { byCode } = await getCatalog();
    const enrich = course => {
      const norm = String(course.code || '').replace(/\s+/g, '').toUpperCase();
      const current = byCode.get(norm);
      return {
        ...course,
        offered: Boolean(current),
        sectionCount: current?.sections.length || 0,
        currentTitle: current?.name || null,
      };
    };
    const semesters = Object.fromEntries(Object.entries(data.semesters || {}).map(([year, terms]) => [year, {
      fall: (terms.fall || []).map(enrich),
      spring: (terms.spring || []).map(enrich),
    }]));
    const electives = Object.fromEntries(
      Object.entries(data.electives || {}).map(([type, courses]) => [type, courses.map(enrich)])
    );

    res.set('Cache-Control', 'no-cache');
    res.json({
      ...data,
      programCodes: data.programCodes || CURRICULUM_PROGRAMS[id] || [],
      catalogTerm: readSiteSettings().catalogTerm,
      semesters,
      electives,
    });
  } catch (err) {
    console.error('GET /curriculums/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
