import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

router.get('/analytics/majors', async (_req, res) => {
  try {
    const [current, selections] = await Promise.all([
      pool.query(
        `SELECT major_code AS major, count(*)::int AS visitors
           FROM sessions
          WHERE major_code IS NOT NULL
          GROUP BY major_code
          ORDER BY visitors DESC, major_code`
      ),
      pool.query(
        `SELECT major_code AS major, count(*)::int AS selections,
                count(DISTINCT session_id)::int AS visitors
           FROM major_selection_events
          GROUP BY major_code
          ORDER BY selections DESC, major_code`
      ),
    ]);
    res.json({ current: current.rows, selections: selections.rows });
  } catch (err) {
    console.error('GET /analytics/majors error:', err.message);
    res.status(500).json({ error: 'Major analytics could not be loaded' });
  }
});

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

router.get('/analytics/course-add-sources', async (req, res) => {
  const parsedDays = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 30;
  try {
    const { rows } = await pool.query(
      `SELECT source, count(*)::int AS additions, count(DISTINCT session_id)::int AS visitors
         FROM course_add_events
        WHERE added_at >= now() - make_interval(days => $1)
        GROUP BY source
        ORDER BY additions DESC, source`,
      [days]
    );
    res.json({ days, total: rows.reduce((sum, row) => sum + row.additions, 0), sources: rows });
  } catch (err) {
    console.error('GET /analytics/course-add-sources error:', err.message);
    res.status(500).json({ error: err.message });
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

router.post('/analytics/track', async (req, res) => {
  const category = String(req.body?.category || '').trim().slice(0, 32);
  const action = String(req.body?.action || '').trim().slice(0, 64);
  const label = req.body?.label ? String(req.body.label).trim() : null;
  const data = req.body?.data ? JSON.stringify(req.body.data) : null;

  if (!category || !action) {
    return res.status(400).json({ success: false, error: 'Category and action are required' });
  }

  try {
    await pool.query(
      `INSERT INTO site_events (session_id, event_category, event_action, event_label, event_data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [req.sessionId, category, action, label, data]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /analytics/track error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ADMIN ROUTES ---

const adminAuth = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'Admin API is not configured' });
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.get('/analytics/admin/requests', adminAuth, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
  const action = String(req.query.action || '').trim().slice(0, 80);
  const status = Number.parseInt(req.query.status, 10);
  const sessionId = String(req.query.session || '').trim();
  const conditions = [];
  const values = [];
  if (action) { values.push(action); conditions.push(`event_action = $${values.length}`); }
  if (Number.isFinite(status)) { values.push(status); conditions.push(`status_code = $${values.length}`); }
  if (sessionId) { values.push(sessionId); conditions.push(`session_id = $${values.length}::uuid`); }
  values.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT id, request_id, session_id, event_action, method, request_path,
              status_code, duration_ms, request_size, response_size,
              ip_address, user_agent, referrer, metadata, created_at
         FROM server_request_logs
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('GET /analytics/admin/requests error:', err.message);
    res.status(500).json({ error: 'Failed to load request logs' });
  }
});

router.get('/analytics/admin/events', adminAuth, async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  try {
    const { rows } = await pool.query(
      `SELECT id, event_category, event_action, event_label, event_data, created_at
       FROM site_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ events: rows });
  } catch (err) {
    console.error('GET /analytics/admin/events error:', err.message);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.get('/analytics/admin/summary', adminAuth, async (req, res) => {
  try {
    const [totalEvents, activeSessions, recentSearches] = await Promise.all([
      pool.query('SELECT count(*)::int FROM site_events'),
      pool.query(`SELECT count(*)::int FROM sessions WHERE last_seen >= now() - interval '24 hours'`),
      pool.query(`SELECT event_label as query, count(*)::int as count
                  FROM site_events
                  WHERE event_category = 'search'
                  GROUP BY event_label
                  ORDER BY count DESC LIMIT 10`)
    ]);

    res.json({
      totalEvents: totalEvents.rows[0].count,
      activeSessions24h: activeSessions.rows[0].count,
      topSearches: recentSearches.rows
    });
  } catch (err) {
    console.error('GET /analytics/admin/summary error:', err.message);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

export default router;
