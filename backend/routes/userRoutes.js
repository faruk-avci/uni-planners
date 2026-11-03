import express from 'express';
import { pool } from '../config/db.js';
import { majorCodesFor } from '../services/catalogService.js';

// Major and year, per browser session and university (university_preferences).
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
    const { rows } = await pool.query(
      'SELECT major_code, grade_level FROM university_preferences WHERE session_id = $1 AND university = $2',
      [req.sessionId, req.university]
    );
    res.json({ major: rows[0]?.major_code || null, grade: rows[0]?.grade_level || null });
  } catch (err) {
    console.error('GET /preferences error:', err.message);
    res.status(500).json({ error: 'Preferences could not be loaded' });
  }
});

// Programs listed for the university, or (Özyeğin) any program code its
// catalog mentions.
async function isKnownMajor(major, university) {
  const listed = majorCodesFor(university);
  if (listed) return listed.includes(major);
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM catalog_courses
        WHERE university = $2 AND ($1 = ANY(required_programs) OR $1 = ANY(elective_programs))
     ) AS valid`,
    [major, university]
  );
  return rows[0].valid;
}

router.put('/preferences/major', async (req, res) => {
  const major = String(req.body?.major || '').trim().toUpperCase().slice(0, 32);
  const requestedSource = String(req.body?.source || 'curriculum').trim();
  const source = MAJOR_PREFERENCE_SOURCES.has(requestedSource) ? requestedSource : 'curriculum';
  if (!major) return res.status(400).json({ error: 'Major is required' });

  try {
    const nonUndergraduateChoices = new Set(['NONE', 'MASTER', 'DOCTORATE']);
    if (!nonUndergraduateChoices.has(major) && !(await isKnownMajor(major, req.university))) {
      return res.status(400).json({ error: 'Unknown major' });
    }

    const storedMajor = nonUndergraduateChoices.has(major) ? major.toLowerCase() : major;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT major_code FROM university_preferences WHERE session_id = $1 AND university = $2 FOR UPDATE',
        [req.sessionId, req.university]
      );
      const previousMajor = current.rows[0]?.major_code || null;
      const changed = previousMajor !== storedMajor;
      if (changed) {
        await client.query(
          `INSERT INTO university_preferences (session_id, university, major_code, first_major_code, major_updated_at)
           VALUES ($1, $2, $3, $3, now())
           ON CONFLICT (session_id, university) DO UPDATE
             SET major_code = EXCLUDED.major_code,
                 major_updated_at = now(),
                 first_major_code = COALESCE(university_preferences.first_major_code, EXCLUDED.major_code)`,
          [req.sessionId, req.university, storedMajor]
        );
        await client.query(
          'INSERT INTO major_selection_events (session_id, major_code, source, university) VALUES ($1, $2, $3, $4)',
          [req.sessionId, storedMajor, source, req.university]
        );
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
      const current = await client.query(
        'SELECT grade_level FROM university_preferences WHERE session_id = $1 AND university = $2 FOR UPDATE',
        [req.sessionId, req.university]
      );
      const previousGrade = current.rows[0]?.grade_level || '';
      if (previousGrade !== grade) {
        await client.query(
          `INSERT INTO university_preferences (session_id, university, grade_level, grade_updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (session_id, university) DO UPDATE
             SET grade_level = EXCLUDED.grade_level, grade_updated_at = now()`,
          [req.sessionId, req.university, grade || null]
        );
      }
      await client.query('COMMIT');
      res.locals.activity = { ...res.locals.activity, previousGrade, selectedGrade: grade, changed: previousGrade !== grade };
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
