import express from 'express';
import { pool } from '../config/db.js';
import { buildMask, DAY_INDEX } from '../scheduleEngine.js';
import {
  formatCourseCode,
  parseSchedule,
  normalizeSharedSchedule,
  scheduleCalendarIcs
} from '../utils/helpers.js';
import { heavyTaskPool } from '../services/heavyTaskPool.js';
import {
  equivalentProgramsFor,
  MAJOR_TO_CURRICULUM,
  curriculumData,
  electiveTypeMap,
  ELECTIVE_TYPE_ORDER
} from '../services/catalogService.js';

const router = express.Router();
const DAY_BY_INDEX = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

router.post('/generate', async (req, res) => {
  const basket = Array.isArray(req.body.courses) ? req.body.courses : [];
  const freeDays = Array.isArray(req.body.freeDays) ? req.body.freeDays : [];
  const limit = Math.min(parseInt(req.body.limit, 10) || 120, 500);

  if (basket.length === 0) {
    return res.json({ success: false, message: 'No courses in basket', totalSchedules: 0, schedules: [] });
  }

  const normalize = c => String(c).replace(/\s+/g, '').toUpperCase();
  const wantSections = {};
  const codes = [];
  for (const item of basket) {
    if (!item || !item.code) continue;
    const norm = normalize(item.code);
    codes.push(norm);
    const secs = Array.isArray(item.sections)
      ? item.sections
      : (item.section ? [item.section] : []);
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

    const primaryRun = await heavyTaskPool.run('generate_schedule', {
      coursesSections,
      options: { freeDayIndexes: [...freeDayIdxs], preference: 'balanced', limit },
    }, { priority: 10, timeoutMs: 20_000 });
    let result = primaryRun.result;
    let fallbackMetrics = null;
    let freeDayFallback = false;

    if (freeDayIdxs.size > 0 && (result.emptyCourses.length > 0 || result.totalGenerated === 0)) {
      const fallbackRun = await heavyTaskPool.run('generate_schedule', {
        coursesSections,
        options: { freeDayIndexes: [], preference: 'balanced', limit },
      }, { priority: 10, timeoutMs: 20_000 });
      fallbackMetrics = fallbackRun.metrics;
      if (fallbackRun.result.totalGenerated > 0) {
        result = fallbackRun.result;
        freeDayFallback = true;
      } else {
        // The selected free day is not the real blocker: the unrestricted
        // basket is also impossible. Return its conflict diagnostics.
        result = fallbackRun.result;
      }
    }

    const { schedules, totalGenerated, limited, emptyCourses, availableFreeDayIndexes = [], diagnostics = null } = result;
    const alternativeFreeDays = availableFreeDayIndexes
      .filter(index => !freeDayIdxs.has(index))
      .map(index => DAY_BY_INDEX[index]);
    res.locals.activity = {
      ...res.locals.activity,
      worker: fallbackMetrics ? { primary: primaryRun.metrics, fallback: fallbackMetrics } : primaryRun.metrics,
      potentialCombinations: potential,
      generatedSchedules: totalGenerated,
      returnedSchedules: freeDayFallback ? 0 : schedules.length,
      fallbackGeneratedSchedules: freeDayFallback ? schedules.length : 0,
      freeDayFallback,
      alternativeFreeDays,
      conflictDiagnostics: diagnostics ? {
        hardConflictCount: diagnostics.hardConflicts?.length || 0,
        removalOptionCount: diagnostics.removalOptions?.length || 0,
        multiCourseInteraction: Boolean(diagnostics.multiCourseInteraction),
      } : null,
    };

    if (emptyCourses.length > 0 && !freeDayFallback) {
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
        diagnostics,
        schedules: [],
      });
    }

    return res.json({
      success: true,
      totalSchedules: freeDayFallback ? 0 : schedules.length,
      totalGenerated,
      limited,
      diagnostics,
      freeDayFallback,
      requestedFreeDays: freeDayFallback ? freeDays : [],
      alternativeFreeDays: freeDayFallback ? alternativeFreeDays : [],
      schedules: freeDayFallback ? [] : schedules,
    });
  } catch (err) {
    console.error('POST /schedule/generate error:', err.message);
    const status = err.code === 'HEAVY_QUEUE_FULL' ? 503 : err.code === 'HEAVY_TASK_TIMEOUT' ? 504 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/fitting', async (req, res) => {
  const occupied = Array.isArray(req.body.occupied) ? req.body.occupied : [];
  const exclude = new Set(
    (Array.isArray(req.body.exclude) ? req.body.exclude : [])
      .map(c => String(c).replace(/\s+/g, '').toUpperCase())
  );
  const major = (req.body.major || '').trim().toUpperCase();
  const equivalentPrograms = equivalentProgramsFor(major);
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

    let homePrefix = null;
    if (major) {
      const counts = {};
      for (const c of courseRows) {
        if (equivalentPrograms.some(program => (c.required_programs || []).includes(program))) {
          const p = prefixOf(c.course_code);
          if (p) counts[p] = (counts[p] || 0) + 1;
        }
      }
      homePrefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const curriculumId = MAJOR_TO_CURRICULUM[major];
    const activeCurriculum = curriculumId ? curriculumData(curriculumId) : null;
    const etMap = curriculumId ? electiveTypeMap(curriculumId) : null;
    const electiveLabels = activeCurriculum?.electiveLabels || {};

    const conflict = (a, b) => a.some((v, d) => (v & b[d]) !== 0);
    const parseCoreqs = txt => (txt || '')
      .split(/[,;]+/).map(x => x.replace(/\s+/g, '').toUpperCase()).filter(Boolean);

    const { rows: secRows } = await pool.query(
      `SELECT course_code, section_no, instructor, schedule FROM catalog_sections ORDER BY course_code, section_no`
    );

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
        if (equivalentPrograms.some(program => m.required.includes(program))) type = 'required';
        else if (equivalentPrograms.some(program => m.elective.includes(program))) type = 'elective';
        else continue;
      }

      const coreqCodes = parseCoreqs(m.coreq).filter(c => secByCourse[c]);

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

      let electiveTypes = [];
      if (type === 'elective' && etMap) {
        const found = etMap.get(code.replace(/\s+/g, '').toUpperCase()) || [];
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

    res.locals.activity = { ...res.locals.activity, fittingCourseCount: fits.length, returnedCourseCount: Math.min(fits.length, limit) };
    res.json({ success: true, total: fits.length, homePrefix, electiveLabels, courses: fits.slice(0, limit) });
  } catch (err) {
    console.error('POST /schedule/fitting error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/export-image', async (req, res) => {
  const schedule = normalizeSharedSchedule(req.body?.schedule);
  if (!schedule) return res.status(400).json({ error: 'A valid generated schedule is required' });
  const language = req.body?.language === 'en' ? 'en' : 'tr';
  const layout = req.body?.layout === 'agenda' ? 'agenda' : 'grid';

  try {
    const { result, metrics } = await heavyTaskPool.run('render_schedule_png', {
      schedule,
      language,
      layout,
    }, { priority: 0, timeoutMs: 60_000 });
    const image = Buffer.from(result);
    res.locals.activity = {
      ...res.locals.activity,
      worker: metrics,
      imageBytes: image.length,
      layout,
    };
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="uniplanners-schedule.png"',
      'Cache-Control': 'no-store',
    });
    res.send(image);
  } catch (err) {
    console.error('POST /schedule/export-image error:', err.message);
    const status = err.code === 'HEAVY_QUEUE_FULL' ? 503 : err.code === 'HEAVY_TASK_TIMEOUT' ? 504 : 500;
    res.status(status).json({ error: 'Schedule image could not be created' });
  }
});

router.post('/export-calendar', (req, res) => {
  const schedule = normalizeSharedSchedule(req.body?.schedule);
  if (!schedule) return res.status(400).json({ error: 'A valid generated schedule is required' });
  const language = req.body?.language === 'en' ? 'en' : 'tr';
  const calendar = scheduleCalendarIcs(schedule, language);
  res.locals.activity = {
    ...res.locals.activity,
    courseCount: schedule.lessons.length,
    calendarEventCount: schedule.lessons.reduce((sum, lesson) => sum + lesson.times.length, 0),
  };
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="uniplanners-2026-2027-fall.ics"',
    'Cache-Control': 'no-store',
  });
  return res.send(calendar);
});

export default router;
