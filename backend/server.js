import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSchedules, buildMask, DAY_INDEX } from './scheduleEngine.js';

// ─── Config (env-driven; only a .env file is needed to deploy) ─────
// Load backend/.env if present (Node 20.6+ built-in; no dependency).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { Pool } = pg;

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── Database ──────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'ozu_user',
  password: process.env.DB_PASSWORD || 'password123',
  database: process.env.DB_NAME || 'ozu_schedule',
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
});

// CORS: '*' (default) allows any origin; otherwise a comma-separated allowlist.
// `credentials: true` lets the session cookie ride along on cross-origin calls.
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(express.json());

// ─── Anonymous sessions ────────────────────────────────────────────
// Every visitor gets a session id in an HttpOnly cookie. The basket is stored
// server-side keyed by it, so it survives refresh and gives us per-user
// tracking without requiring login. Later, login can attach sessions.ozu_id.
const COOKIE_NAME = 'sid';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

async function sessionMiddleware(req, res, next) {
  try {
    let sid = parseCookies(req.headers.cookie)[COOKIE_NAME];
    let valid = false;
    if (sid && UUID_RE.test(sid)) {
      const { rowCount } = await pool.query('UPDATE sessions SET last_seen = now() WHERE id = $1', [sid]);
      valid = rowCount > 0;
    }
    if (!valid) {
      const { rows } = await pool.query(
        'INSERT INTO sessions (user_agent) VALUES ($1) RETURNING id',
        [req.headers['user-agent'] || null]
      );
      sid = rows[0].id;
      res.cookie(COOKIE_NAME, sid, {
        httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: ONE_YEAR_MS, path: '/',
      });
    }
    req.sessionId = sid;
  } catch (err) {
    // Never block the app on session bookkeeping; basket routes will 500 if truly broken.
    console.error('sessionMiddleware error:', err.message);
  }
  next();
}
app.use('/api', sessionMiddleware);

// ─── Helpers ───────────────────────────────────────────────────────
function formatCourseCode(code) {
  const m = code.match(/^([A-Z]+)(\d+.*)$/i);
  return m ? `${m[1]} ${m[2]}` : code;
}

function parseSchedule(raw) {
  if (!raw) return [];
  const times = [];
  const parts = raw.split(/[+\n\r]+/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^\s*([A-Za-zÇŞĞÖÜıİöüçşğ]+)\s*\|\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/);
    if (m) {
      times.push({ day: m[1].trim(), start: m[2].trim(), end: m[3].trim() });
    }
  }
  return times;
}

// ─── Catalog cache ─────────────────────────────────────────────────
// The catalog (courses/sections/assessments) is read-only between term
// imports, so we keep it in memory and refresh on a TTL. Search and the
// by-code lookup serve from here, so they almost never hit Postgres.
const CATALOG_TTL_MS = parseInt(process.env.CATALOG_TTL_MS, 10) || 5 * 60 * 1000;
let catalog = { byCode: new Map(), all: [], loadedAt: 0 };
let catalogLoading = null;

function stripEntry(e) {
  const { normCode, ...rest } = e; // normCode is internal (match key)
  return rest;
}

async function reloadCatalog() {
  const [{ rows: courses }, { rows: sections }, { rows: assessments }] = await Promise.all([
    pool.query('SELECT * FROM catalog_courses'),
    pool.query('SELECT * FROM catalog_sections ORDER BY course_code, section_no'),
    pool.query('SELECT * FROM course_assessments ORDER BY course_code, category, id'),
  ]);

  const secByCourse = {};
  for (const s of sections) {
    (secByCourse[s.course_code] ||= []).push({
      name: `${formatCourseCode(s.course_code)}${s.section_no}`,
      lecturer: s.instructor || 'Staff',
      times: parseSchedule(s.schedule),
    });
  }
  const assByCourse = {};
  for (const a of assessments) {
    (assByCourse[a.course_code] ||= []).push({
      type: a.assessment_type,
      category: a.category,
      weight: a.weight ? parseFloat(a.weight) : null,
      raw_text: a.raw_text,
    });
  }

  const byCode = new Map();
  const all = [];
  for (const c of courses) {
    const entry = {
      code: formatCourseCode(c.course_code),
      normCode: c.course_code.toUpperCase(),
      name: c.title,
      credits: parseFloat(c.credits),
      faculty: c.faculty || '',
      prereq: c.prerequisites || '',
      coreq: c.corequisites || '',
      description: c.description || '',
      required: c.required_programs || [],
      elective: c.elective_programs || [],
      sections: secByCourse[c.course_code] || [],
      assessments: assByCourse[c.course_code] || [],
    };
    byCode.set(entry.normCode, entry);
    all.push(entry);
  }
  catalog = { byCode, all, loadedAt: Date.now() };
  return catalog;
}

// Returns the cache; blocks on the first load, otherwise refreshes stale data
// in the background and serves what we have immediately.
async function getCatalog() {
  if (catalog.all.length === 0) {
    if (!catalogLoading) catalogLoading = reloadCatalog().finally(() => { catalogLoading = null; });
    await catalogLoading;
  } else if (Date.now() - catalog.loadedAt > CATALOG_TTL_MS && !catalogLoading) {
    catalogLoading = reloadCatalog()
      .catch(e => console.error('catalog reload failed:', e.message))
      .finally(() => { catalogLoading = null; });
  }
  return catalog;
}

// ─── Elective-type lookup (from per-major curriculum JSON) ─────────
// DB program code -> curriculum file id (only the undergrad programs that
// have a curriculum file; others degrade gracefully to no elective-type tags).
const MAJOR_TO_CURRICULUM = {
  BSAI: 'ai', 'BSARCH (ENG)': 'arch_en', 'BSARCH (TR)': 'arch_tr', BSAVM: 'avm',
  BABUS: 'bus', BSCE: 'ce', BSCOD: 'code', BSCODE: 'code', BSCS: 'cs',
  BAECON: 'econ', BSEE: 'ee', BAENT: 'entr', BSGARM: 'garm', BSHMAN: 'hman',
  BLAW: 'huk', BSIDE: 'ide', BSIE: 'ie', BSINTAR: 'inar', BAIR: 'ir',
  BSME: 'me', BAMIS: 'mis', BSPLT: 'plt', BAPSYC: 'psy', BAANTH: 'anth',
};
// Display priority across all curriculum categories; "free" last (near-universal).
const ELECTIVE_TYPE_ORDER = [
  'program', 'program_FIN', 'program_MGMT', 'program_MIS', 'program_OPER', 'program_external',
  'specialization', 'design_studio', 'finishing_project',
  'faculty', 'non_faculty', 'certificate', 'social', 'social_restricted',
  'language', 'restricted', 'other', 'free',
];
const curriculumCache = new Map(); // curriculumId -> Map(normalizedCode -> [types])

function electiveTypeMap(curriculumId) {
  if (curriculumCache.has(curriculumId)) return curriculumCache.get(curriculumId);
  const map = new Map();
  try {
    const file = path.join(__dirname, 'curriculums', `${curriculumId}.json`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const [type, list] of Object.entries(data.electives || {})) {
      for (const c of list) {
        const norm = String(c.code || '').replace(/\s+/g, '').toUpperCase();
        if (!norm) continue;
        if (!map.has(norm)) map.set(norm, []);
        if (!map.get(norm).includes(type)) map.get(norm).push(type);
      }
    }
  } catch { /* no curriculum file -> empty map */ }
  curriculumCache.set(curriculumId, map);
  return map;
}

// ─── POST /api/courses/search ──────────────────────────────────────
app.post('/api/courses/search', async (req, res) => {
  const query = (req.body.query || '').trim().toUpperCase();
  const major = (req.body.major || '').trim().toUpperCase();
  const type  = (req.body.type  || 'all').trim().toLowerCase();

  if (query.length < 2 && !major) {
    return res.json([]);
  }

  try {
    const { all } = await getCatalog();
    const q = query.replace(/\s+/g, '');

    const matches = all.filter(c => {
      if (q && !c.normCode.includes(q)) return false;
      if (major) {
        const isReq = c.required.includes(major);
        const isEle = c.elective.includes(major);
        if (type === 'required') return isReq;
        if (type === 'elective') return isEle;
        return isReq || isEle;
      }
      return true;
    });

    // Relevance: exact prefix matches first, then alphabetical by code.
    matches.sort((a, b) => {
      const ra = q && a.normCode.startsWith(q) ? 1 : 2;
      const rb = q && b.normCode.startsWith(q) ? 1 : 2;
      return ra - rb || a.normCode.localeCompare(b.normCode);
    });

    res.json(matches.map(stripEntry));
  } catch (err) {
    console.error('POST /api/courses/search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/courses/:code ────────────────────────────────────────
// Exact single-course lookup from the in-memory catalog (no DB hit on cache
// hits). Same shape as a search result, so callers can use it interchangeably.
app.get('/api/courses/:code', async (req, res) => {
  const code = String(req.params.code || '').replace(/\s+/g, '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const { byCode } = await getCatalog();
    const entry = byCode.get(code);
    if (!entry) return res.status(404).json({ error: 'not found' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(stripEntry(entry));
  } catch (err) {
    console.error('GET /api/courses/:code error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/assessments ─────────────────────────────────────────
app.post('/api/assessments', async (req, res) => {
  const rawCodes = req.body.codes || [];
  if (rawCodes.length === 0) {
    return res.json({});
  }

  // Normalize codes (e.g. "CS 101" -> "CS101")
  const codes = rawCodes.map(c => c.replace(/\s+/g, '').toUpperCase());

  try {
    const { rows } = await pool.query(
      `SELECT * FROM course_assessments WHERE course_code = ANY($1) ORDER BY course_code, category, id`,
      [codes]
    );

    const result = {};
    for (const a of rows) {
      // Keep key format matching original input if possible, or normalized
      // Let's use formatCourseCode for output key to match frontend code e.g. "CS 101"
      const formatted = formatCourseCode(a.course_code);
      if (!result[formatted]) result[formatted] = [];
      result[formatted].push({
        type: a.assessment_type,
        category: a.category,
        weight: a.weight ? parseFloat(a.weight) : null,
        raw_text: a.raw_text
      });
    }

    res.json(result);
  } catch (err) {
    console.error('POST /api/assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/majors ───────────────────────────────────────────────
app.get('/api/majors', async (_req, res) => {
  try {
    const r1 = await pool.query('SELECT DISTINCT unnest(required_programs) AS program FROM catalog_courses');
    const r2 = await pool.query('SELECT DISTINCT unnest(elective_programs) AS program FROM catalog_courses');
    const majors = new Set([
      ...r1.rows.map(r => r.program),
      ...r2.rows.map(r => r.program),
    ]);
    res.json(Array.from(majors).sort());
  } catch (err) {
    console.error('GET /api/majors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/schedule/generate ───────────────────────────────────
// Body: {
//   courses: [{ code: "CS 101", section: "CS 101A" | null }],
//   freeDays: ["Cuma", ...],          // full Turkish day names
//   preference: "morning" | "evening" | "balanced",
//   limit: 120
// }
app.post('/api/schedule/generate', async (req, res) => {
  const basket = Array.isArray(req.body.courses) ? req.body.courses : [];
  const freeDays = Array.isArray(req.body.freeDays) ? req.body.freeDays : [];
  const preference = (req.body.preference || 'balanced').toLowerCase();
  const limit = Math.min(parseInt(req.body.limit, 10) || 120, 500);

  if (basket.length === 0) {
    return res.json({ success: false, message: 'No courses in basket', totalSchedules: 0, schedules: [] });
  }

  // Normalize "CS 101" -> "CS101" for the DB, keep a map back to the request item.
  // Each course may pin specific sections; an empty list means "use all sections".
  const normalize = c => String(c).replace(/\s+/g, '').toUpperCase();
  const wantSections = {}; // normalizedCode -> [formatted section names] ([] = all)
  const codes = [];
  for (const item of basket) {
    if (!item || !item.code) continue;
    const norm = normalize(item.code);
    codes.push(norm);
    const secs = Array.isArray(item.sections)
      ? item.sections
      : (item.section ? [item.section] : []); // back-compat with single `section`
    wantSections[norm] = secs;
  }

  if (codes.length === 0) {
    return res.json({ success: false, message: 'No valid course codes', totalSchedules: 0, schedules: [] });
  }

  try {
    const { rows: courseRows } = await pool.query(
      `SELECT course_code, title, credits FROM catalog_courses WHERE course_code = ANY($1)`,
      [codes]
    );
    const courseMeta = {};
    for (const c of courseRows) {
      courseMeta[c.course_code] = { name: c.title, credits: parseFloat(c.credits) || 0 };
    }

    const { rows: secRows } = await pool.query(
      `SELECT course_code, section_no, instructor, schedule FROM catalog_sections
       WHERE course_code = ANY($1) ORDER BY course_code, section_no`,
      [codes]
    );

    // Build per-course section lists with masks, honoring specific-section picks.
    const coursesSections = {};
    const missingData = [];
    for (const norm of codes) {
      const meta = courseMeta[norm] || { name: norm, credits: 0 };
      const formattedCode = formatCourseCode(norm);
      const secs = secRows
        .filter(s => s.course_code === norm)
        .map(s => {
          const times = parseSchedule(s.schedule);
          const sectionName = `${formattedCode}${s.section_no}`;
          return {
            code: formattedCode,
            name: meta.name,
            section: sectionName,
            lecturer: s.instructor || 'Staff',
            credits: meta.credits,
            times,
            mask: buildMask(times),
          };
        })
        // If the basket pinned specific sections, restrict to them.
        .filter(s => wantSections[norm].length === 0 || wantSections[norm].includes(s.section));

      if (secs.length === 0) missingData.push(formattedCode);
      coursesSections[formattedCode] = secs;
    }

    if (missingData.length > 0) {
      return res.json({
        success: false,
        error: 'NO_SECTIONS',
        message: `No section/time data for: ${missingData.join(', ')}`,
        totalSchedules: 0,
        schedules: [],
      });
    }

    // Combo guard — protect against runaway combination explosions.
    const potential = Object.values(coursesSections)
      .reduce((p, secs) => p * Math.max(secs.length, 1), 1);
    if (potential > 1_000_000) {
      return res.json({
        success: false,
        error: 'COMBINATION_OVERLOAD',
        message: `Too many potential combinations (${potential.toLocaleString()}).`,
        suggestion: 'Pin a specific section for some courses to reduce complexity.',
        totalSchedules: 0,
        schedules: [],
      });
    }

    const freeDayIdxs = new Set(
      freeDays.map(d => DAY_INDEX[d]).filter(i => i !== undefined)
    );

    const { schedules, totalGenerated, limited, emptyCourses } =
      generateSchedules(coursesSections, { freeDayIdxs, preference, limit });

    if (emptyCourses.length > 0) {
      return res.json({
        success: false,
        error: 'FREE_DAY_CONFLICT',
        message: `These courses only meet on your selected free day(s): ${emptyCourses.join(', ')}`,
        totalSchedules: 0,
        schedules: [],
      });
    }

    if (totalGenerated === 0) {
      return res.json({
        success: true,
        message: 'No conflict-free schedule found for this basket.',
        totalSchedules: 0,
        totalGenerated: 0,
        schedules: [],
      });
    }

    return res.json({
      success: true,
      totalSchedules: schedules.length,
      totalGenerated,
      limited,
      schedules,
    });
  } catch (err) {
    console.error('POST /api/schedule/generate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/schedule/fitting ────────────────────────────────────
// Given the time slots occupied by a chosen schedule, return catalog courses
// that have at least one section which does NOT conflict with those slots
// (excluding courses already in the basket). New v2 feature.
// Body: { occupied: [{day,start,end}], exclude: ["CS 101"], major: "CS", limit: 80 }
// When `major` is given, only that program's required/elective courses are
// returned, required first then electives (each tagged with `type`).
app.post('/api/schedule/fitting', async (req, res) => {
  const occupied = Array.isArray(req.body.occupied) ? req.body.occupied : [];
  const exclude = new Set(
    (Array.isArray(req.body.exclude) ? req.body.exclude : [])
      .map(c => String(c).replace(/\s+/g, '').toUpperCase())
  );
  const major = (req.body.major || '').trim().toUpperCase();
  const limit = Math.min(parseInt(req.body.limit, 10) || 200, 300);

  try {
    const occupiedMask = buildMask(occupied);
    const prefixOf = code => (String(code).match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
    const isEngineering = faculty => /Mühendislik/i.test(faculty || '');

    const { rows: courseRows } = await pool.query(
      `SELECT course_code, title, credits, faculty, prerequisites, corequisites, required_programs, elective_programs FROM catalog_courses`
    );
    const meta = {};
    for (const c of courseRows) {
      meta[c.course_code] = {
        name: c.title,
        credits: parseFloat(c.credits) || 0,
        faculty: c.faculty || '',
        prereq: c.prerequisites || '',
        coreq: c.corequisites || '',
        required: c.required_programs || [],
        elective: c.elective_programs || [],
      };
    }

    // "Home" subject = the dominant code prefix among the major's required
    // courses (e.g. BSEE -> EE). Used to surface own-department courses first.
    let homePrefix = null;
    if (major) {
      const counts = {};
      for (const c of courseRows) {
        if ((c.required_programs || []).includes(major)) {
          const p = prefixOf(c.course_code);
          if (p) counts[p] = (counts[p] || 0) + 1;
        }
      }
      homePrefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    // Elective-type lookup for this major's curriculum (program/cert/social/free).
    const curriculumId = MAJOR_TO_CURRICULUM[major];
    const etMap = curriculumId ? electiveTypeMap(curriculumId) : null;

    const conflict = (a, b) => a.some((v, d) => (v & b[d]) !== 0);
    const parseCoreqs = txt => (txt || '')
      .split(/[,;]+/).map(x => x.replace(/\s+/g, '').toUpperCase()).filter(Boolean);

    const { rows: secRows } = await pool.query(
      `SELECT course_code, section_no, instructor, schedule FROM catalog_sections ORDER BY course_code, section_no`
    );

    // Precompute section masks per course (needed for coreq look-ups too).
    const secByCourse = {};
    for (const s of secRows) {
      const times = parseSchedule(s.schedule);
      const mask = buildMask(times);
      (secByCourse[s.course_code] ||= []).push({
        section: `${formatCourseCode(s.course_code)}${s.section_no}`,
        lecturer: s.instructor || 'Staff',
        times, mask, hasTimes: mask.some(v => v !== 0),
      });
    }

    const fits = [];
    for (const [code, secs] of Object.entries(secByCourse)) {
      if (exclude.has(code)) continue;
      const m = meta[code] || { name: formatCourseCode(code), credits: 0, faculty: '', prereq: '', coreq: '', required: [], elective: [] };

      let type = null;
      if (major) {
        if (m.required.includes(major)) type = 'required';
        else if (m.elective.includes(major)) type = 'elective';
        else continue; // not part of this major
      }

      // Coreqs we actually have section data for (e.g. a lab/recitation).
      const coreqCodes = parseCoreqs(m.coreq).filter(c => secByCourse[c]);

      // A main section is only valid if it doesn't conflict AND every coreq has
      // a section that fits the schedule and doesn't conflict with that main.
      const validSections = [];
      for (const ms of secs) {
        if (!ms.hasTimes || conflict(ms.mask, occupiedMask)) continue;
        const coreqsOk = coreqCodes.every(cq =>
          (secByCourse[cq] || []).some(cs =>
            cs.hasTimes && !conflict(cs.mask, occupiedMask) && !conflict(cs.mask, ms.mask))
        );
        if (coreqsOk) validSections.push({ section: ms.section, lecturer: ms.lecturer, times: ms.times });
      }
      if (validSections.length === 0) continue;

      // Elective categories this course satisfies in the major's curriculum,
      // ordered program > certificate > social > free.
      let electiveTypes = [];
      if (type === 'elective' && etMap) {
        const found = etMap.get(code.replace(/\s+/g, '').toUpperCase()) || [];
        // Keep ALL categories (e.g. IR "language"); known ones first, then any extras.
        const ordered = ELECTIVE_TYPE_ORDER.filter(t => found.includes(t));
        const extras = found.filter(t => !ELECTIVE_TYPE_ORDER.includes(t));
        electiveTypes = [...ordered, ...extras];
      }

      fits.push({
        code: formatCourseCode(code),
        name: m.name,
        credits: m.credits,
        type,
        electiveTypes,
        prefix: prefixOf(code),
        isEng: isEngineering(m.faculty),
        faculty: m.faculty || '',
        prereq: m.prereq,
        coreq: m.coreq,
        sections: validSections,
      });
    }

    // Ordering when a major is set:
    //  required (home dept first, then others), then
    //  elective (engineering first — home dept first within it — then non-eng).
    if (major) {
      const key = c => {
        if (c.type === 'required') return [0, c.prefix === homePrefix ? 0 : 1];
        if (c.isEng) return [1, c.prefix === homePrefix ? 0 : 1];
        return [1, 2];
      };
      fits.sort((a, b) => {
        const ka = key(a), kb = key(b);
        return ka[0] - kb[0] || ka[1] - kb[1] || a.code.localeCompare(b.code);
      });
    } else {
      fits.sort((a, b) => a.code.localeCompare(b.code));
    }

    res.json({ success: true, total: fits.length, homePrefix, courses: fits.slice(0, limit) });
  } catch (err) {
    console.error('POST /api/schedule/fitting error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/stats ────────────────────────────────────────────────
app.get('/api/stats', async (_req, res) => {
  try {
    const courses  = await pool.query('SELECT count(*) FROM catalog_courses');
    const sections = await pool.query('SELECT count(*) FROM catalog_sections');
    res.json({
      courses:  parseInt(courses.rows[0].count),
      sections: parseInt(sections.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/basket ───────────────────────────────────────────────
// Current session's basket, enriched with title/credits from the catalog.
app.get('/api/basket', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.course_code, b.sections, b.source, c.title, c.credits
         FROM basket_items b
         LEFT JOIN catalog_courses c ON c.course_code = upper(replace(b.course_code, ' ', ''))
        WHERE b.session_id = $1
        ORDER BY b.added_at`,
      [req.sessionId]
    );
    res.json(rows.map(r => ({
      code: r.course_code,
      name: r.title || r.course_code,
      credits: r.credits != null ? parseFloat(r.credits) : 0,
      sections: r.sections || [],
      source: r.source || null,
    })));
  } catch (err) {
    console.error('GET /api/basket error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/basket ───────────────────────────────────────────────
// Replace the whole basket (mirrors the frontend's single-array state model).
// Body: { items: [{ code: "CS 101", sections: ["CS 101A"] }] }  ([] sections = whole course)
app.put('/api/basket', async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM basket_items WHERE session_id = $1', [req.sessionId]);
    const seen = new Set();
    for (const it of items) {
      const code = String(it?.code || '').trim();
      if (!code || seen.has(code.toUpperCase())) continue;
      seen.add(code.toUpperCase());
      const sections = Array.isArray(it.sections) ? it.sections.map(String) : [];
      const source = it.source ? String(it.source).slice(0, 32) : null;
      await client.query(
        'INSERT INTO basket_items (session_id, course_code, sections, source) VALUES ($1, $2, $3, $4)',
        [req.sessionId, code, sections, source]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: seen.size });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /api/basket error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/basket ────────────────────────────────────────────
app.delete('/api/basket', async (req, res) => {
  try {
    await pool.query('DELETE FROM basket_items WHERE session_id = $1', [req.sessionId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Schema bootstrap (app-owned tables) ───────────────────────────
// Catalog tables come from the scraper import; these are created here so the
// app is self-sufficient on a fresh database (local or VPS).
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_agent TEXT,
      ozu_id     TEXT
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS basket_items (
      id          SERIAL PRIMARY KEY,
      session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      course_code VARCHAR(20) NOT NULL,
      sections    TEXT[] NOT NULL DEFAULT '{}',
      source      TEXT,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (session_id, course_code)
    )`);
  // For DBs created before `source` existed.
  await pool.query(`ALTER TABLE basket_items ADD COLUMN IF NOT EXISTS source TEXT`);
}

// ─── Start ─────────────────────────────────────────────────────────
ensureSchema()
  .then(() => app.listen(PORT, () => {
    console.log(`🚀 OZU Backend running on http://localhost:${PORT}`);
  }))
  .catch(err => {
    console.error('❌ Schema init failed:', err.message);
    process.exit(1);
  });
