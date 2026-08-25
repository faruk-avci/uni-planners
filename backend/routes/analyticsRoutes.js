import express from 'express';
import { pool } from '../config/db.js';
import { enqueueSiteEvent } from '../services/activityLogger.js';

const router = express.Router();

const COURSE_ADD_SOURCES = new Set([
  'search',
  'curriculum',
  'curriculum_elective',
  'elective_popup',
  'fitting',
  'coreq',
]);

router.post('/analytics/course-add', async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 20);
  const requestedSource = String(req.body?.source || 'search').trim();
  const source = COURSE_ADD_SOURCES.has(requestedSource) ? requestedSource : 'search';
  const selectionMode = req.body?.selectionMode === 'sections' ? 'sections' : 'course';
  if (!code) return res.status(400).json({ success: false, error: 'Course code is required' });

  try {
    await pool.query(
      `INSERT INTO course_add_events (session_id, course_code, source, selection_mode)
       VALUES ($1, $2, $3, $4)`,
      [req.sessionId, code, source, selectionMode]
    );
    console.log(JSON.stringify({
      event: 'course_add',
      source,
      course: code,
      selectionMode,
      timestamp: new Date().toISOString(),
    }));
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /analytics/course-add error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (_req, res) => {
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

router.post('/analytics/track', (req, res) => {
  const category = String(req.body?.category || '').trim().slice(0, 32);
  const action = String(req.body?.action || '').trim().slice(0, 64);
  const label = req.body?.label ? String(req.body.label).trim() : null;
  const data = req.body?.data ?? null;

  if (!category || !action) {
    return res.status(400).json({ success: false, error: 'Category and action are required' });
  }

  enqueueSiteEvent({
    session_id: req.sessionId || null,
    event_category: category,
    event_action: action,
    event_label: label,
    event_data: data,
    created_at: new Date().toISOString(),
  });
  res.status(201).json({ success: true });
});

export default router;
