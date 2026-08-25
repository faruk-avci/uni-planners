import express from 'express';
import { pool } from '../config/db.js';
import { readSiteSettings } from '../services/curriculumStore.js';
import { normalizeSharedSchedule, createShareId, sharedScheduleFingerprint } from '../utils/helpers.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const schedule = normalizeSharedSchedule(req.body?.schedule);
  if (!schedule) return res.status(400).json({ error: 'A valid generated schedule is required' });
  if (!req.sessionId) return res.status(503).json({ error: 'Anonymous session is unavailable' });

  const major = String(req.body?.major || '').trim().slice(0, 32) || null;
  const term = String(req.body?.term || readSiteSettings().catalogTerm || 'Imported catalog').trim().slice(0, 80);
  const scheduleJson = JSON.stringify(schedule);
  const contentHash = sharedScheduleFingerprint(schedule, major, term);

  try {
    // Reuse legacy rows created before content hashes were introduced too.
    const existingResult = await pool.query(
      `SELECT short_id, view_count, created_at
         FROM shared_schedules
        WHERE creator_session_id = $1
          AND major_code IS NOT DISTINCT FROM $2
          AND catalog_term = $3
          AND schedule = $4::jsonb
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.sessionId, major, term, scheduleJson]
    );
    if (existingResult.rows[0]) {
      const existing = existingResult.rows[0];
      res.locals.activity = { ...res.locals.activity, shareId: existing.short_id, created: false, reused: true };
      return res.status(200).json({
        id: existing.short_id,
        viewCount: existing.view_count,
        createdAt: existing.created_at,
        reused: true,
      });
    }

    let row = null;
    let created = false;
    for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
      const shortId = createShareId();
      const result = await pool.query(
        `INSERT INTO shared_schedules (short_id, creator_session_id, major_code, catalog_term, schedule, content_hash)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT DO NOTHING
         RETURNING short_id, view_count, created_at`,
        [shortId, req.sessionId, major, term, scheduleJson, contentHash]
      );
      if (result.rows[0]) {
        row = result.rows[0];
        created = true;
        break;
      }

      // A concurrent request may have inserted the same content first. If the
      // conflict was only a short-id collision, this lookup is empty and the
      // loop safely tries another id.
      const duplicateResult = await pool.query(
        `SELECT short_id, view_count, created_at
           FROM shared_schedules
          WHERE creator_session_id = $1 AND content_hash = $2
          LIMIT 1`,
        [req.sessionId, contentHash]
      );
      row = duplicateResult.rows[0] || null;
    }
    if (!row) return res.status(503).json({ error: 'A share id could not be allocated' });

    res.locals.activity = { ...res.locals.activity, shareId: row.short_id, created, reused: !created };
    res.status(created ? 201 : 200).json({
      id: row.short_id,
      viewCount: row.view_count,
      createdAt: row.created_at,
      reused: !created,
    });
  } catch (err) {
    console.error('POST /shared-schedules error:', err.message);
    res.status(500).json({ error: 'Schedule could not be shared' });
  }
});

router.get('/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[23456789A-HJ-NP-Za-km-z]{8}$/.test(id)) {
    return res.status(404).json({ error: 'Shared schedule not found' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE shared_schedules
          SET view_count = view_count + 1,
              last_viewed_at = now()
        WHERE short_id = $1
        RETURNING short_id, major_code, catalog_term, schedule, view_count, created_at`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Shared schedule not found' });

    const row = rows[0];
    res.locals.activity = { ...res.locals.activity, shareId: row.short_id, viewCount: Number(row.view_count) };
    res.set('Cache-Control', 'no-store');
    res.json({
      id: row.short_id,
      major: row.major_code,
      term: row.catalog_term,
      schedule: row.schedule,
      viewCount: row.view_count,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('GET /shared-schedules/:id error:', err.message);
    res.status(500).json({ error: 'Shared schedule could not be loaded' });
  }
});

export default router;
