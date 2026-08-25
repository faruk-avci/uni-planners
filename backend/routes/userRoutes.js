import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

const MAJOR_PREFERENCE_SOURCES = new Set([
  'generate',
  'curriculum',
  'fitting',
  'profile',
  'existing_browser',
]);

const GRADE_VALUES = new Set(['prep', '1', '2', '3', '4']);

router.get('/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT major_code, grade_level FROM sessions WHERE id = $1', [req.sessionId]);
    res.json({ major: rows[0]?.major_code || null, grade: rows[0]?.grade_level || null });
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
      const current = await client.query(
        'SELECT major_code, first_major_code FROM sessions WHERE id = $1 FOR UPDATE',
        [req.sessionId]
      );
      const previousMajor = current.rows[0]?.major_code || null;
      const changed = previousMajor !== storedMajor;
      if (changed) {
        await client.query(
          `UPDATE sessions
              SET major_code = $1,
                  major_updated_at = now(),
                  first_major_code = COALESCE(first_major_code, $1)
            WHERE id = $2`,
          [storedMajor, req.sessionId]
        );
        await client.query(
          'INSERT INTO major_selection_events (session_id, major_code, source) VALUES ($1, $2, $3)',
          [req.sessionId, storedMajor, source]
        );
      } else if (!current.rows[0]?.first_major_code) {
        // Backfill for sessions that chose their major before first_major_code existed.
        await client.query('UPDATE sessions SET first_major_code = $1 WHERE id = $2', [storedMajor, req.sessionId]);
      }
      await client.query('COMMIT');
      res.locals.activity = { ...res.locals.activity, previousMajor, selectedMajor: storedMajor, source, changed };
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

router.put('/preferences/grade', async (req, res) => {
  const grade = String(req.body?.grade || '').trim().toLowerCase().slice(0, 16);
  if (grade && !GRADE_VALUES.has(grade)) return res.status(400).json({ error: 'Unknown grade' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT grade_level FROM sessions WHERE id = $1 FOR UPDATE', [req.sessionId]);
      const previousGrade = current.rows[0]?.grade_level || '';
      const changed = previousGrade !== grade;
      if (changed) {
        await client.query(
          'UPDATE sessions SET grade_level = $1, grade_updated_at = now() WHERE id = $2',
          [grade || null, req.sessionId]
        );
      }
      await client.query('COMMIT');
      res.locals.activity = { ...res.locals.activity, previousGrade, selectedGrade: grade, changed };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true, grade });
  } catch (err) {
    console.error('PUT /preferences/grade error:', err.message);
    res.status(500).json({ error: 'Grade preference could not be saved' });
  }
});

export default router;
