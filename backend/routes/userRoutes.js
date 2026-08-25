import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

const MAJOR_PREFERENCE_SOURCES = new Set([
  'generate',
  'curriculum',
  'fitting',
  'existing_browser',
]);

router.get('/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT major_code FROM sessions WHERE id = $1', [req.sessionId]);
    res.json({ major: rows[0]?.major_code || null });
  } catch (err) {
    console.error('GET /preferences error:', err.message);
    res.status(500).json({ error: 'Preferences could not be loaded' });
  }
});

router.put('/preferences/major', async (req, res) => {
  const major = String(req.body?.major || '').trim().toUpperCase().slice(0, 32);
  const requestedSource = String(req.body?.source || 'curriculum').trim();
  const source = MAJOR_PREFERENCE_SOURCES.has(requestedSource) ? requestedSource : 'curriculum';
  if (!major) return res.status(400).json({ error: 'Major is required' });

  try {
    const nonUndergraduateChoices = new Set(['NONE', 'MASTER', 'DOCTORATE']);
    if (!nonUndergraduateChoices.has(major)) {
      const { rows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM catalog_courses
            WHERE $1 = ANY(required_programs) OR $1 = ANY(elective_programs)
         ) AS valid`,
        [major]
      );
      if (!rows[0].valid) return res.status(400).json({ error: 'Unknown major' });
    }

    const storedMajor = nonUndergraduateChoices.has(major) ? major.toLowerCase() : major;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT major_code FROM sessions WHERE id = $1 FOR UPDATE', [req.sessionId]);
      const previousMajor = current.rows[0]?.major_code || null;
      await client.query(
        'UPDATE sessions SET major_code = $1, major_updated_at = now() WHERE id = $2',
        [storedMajor, req.sessionId]
      );
      if (previousMajor !== storedMajor) {
        await client.query(
          'INSERT INTO major_selection_events (session_id, major_code, source) VALUES ($1, $2, $3)',
          [req.sessionId, storedMajor, source]
        );
      }
      await client.query('COMMIT');
      res.locals.activity = {
        ...res.locals.activity,
        previousMajor,
        selectedMajor: storedMajor,
        source,
        changed: previousMajor !== storedMajor,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true, major: storedMajor });
  } catch (err) {
    console.error('PUT /preferences/major error:', err.message);
    res.status(500).json({ error: 'Major preference could not be saved' });
  }
});

export default router;
