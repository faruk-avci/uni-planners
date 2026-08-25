import express from 'express';
import { pool } from '../config/db.js';
import { normalizeOzuEmail } from '../utils/helpers.js';

const router = express.Router();

router.get('/leaderboard', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 25;
  try {
    const { rows } = await pool.query(
      `SELECT split_part(email, '@', 1) AS player,
              best_score,
              updated_at
         FROM dino_high_scores
        ORDER BY best_score DESC, updated_at ASC, email ASC
        LIMIT $1`,
      [limit]
    );
    res.locals.activity = { ...res.locals.activity, returnedPlayers: rows.length };
    res.json({
      players: rows.map((row, index) => ({
        rank: index + 1,
        player: row.player,
        bestScore: row.best_score,
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /dino/leaderboard error:', err.message);
    res.status(500).json({ error: 'Leaderboard could not be loaded' });
  }
});

router.post('/score', async (req, res) => {
  const email = normalizeOzuEmail(req.body?.email);
  const score = Number(req.body?.score);
  if (!email) return res.status(400).json({ error: 'A valid @ozu.edu.tr email is required' });
  if (!Number.isInteger(score) || score < 0 || score > 999999999999) {
    return res.status(400).json({ error: 'Score must be an integer between 0 and 999999999999' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO dino_high_scores (email, best_score, last_session_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET best_score = GREATEST(dino_high_scores.best_score, EXCLUDED.best_score),
             last_session_id = EXCLUDED.last_session_id,
             updated_at = CASE
               WHEN EXCLUDED.best_score > dino_high_scores.best_score THEN now()
               ELSE dino_high_scores.updated_at
             END
       RETURNING split_part(email, '@', 1) AS player, best_score, updated_at`,
      [email, score, req.sessionId || null]
    );
    res.locals.activity = { ...res.locals.activity, score, bestScore: rows[0].best_score };
    res.json({
      player: rows[0].player,
      bestScore: rows[0].best_score,
      updatedAt: rows[0].updated_at,
    });
  } catch (err) {
    console.error('POST /dino/score error:', err.message);
    res.status(500).json({ error: 'Score could not be saved' });
  }
});

export default router;
