import express from 'express';
import { pool } from '../config/db.js';
import { getCatalog } from '../services/catalogService.js';
import { UUID_RE } from '../middleware/session.js';

const router = express.Router();

router.get('/', async (req, res) => {
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
    console.error('GET /basket error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
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
    res.locals.activity = { ...res.locals.activity, itemCount: seen.size };
    res.json({ success: true, count: seen.size });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PUT /basket error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM basket_items WHERE session_id = $1', [req.sessionId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function normalizeSavedBasketItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 100) : [];
  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    const code = String(item?.code || '').trim().slice(0, 20);
    const key = code.toUpperCase();
    if (!code || seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      code,
      sections: Array.isArray(item.sections)
        ? [...new Set(item.sections.map(value => String(value).trim()).filter(Boolean))].slice(0, 50)
        : [],
      source: item.source ? String(item.source).slice(0, 32) : null,
    });
  }

  return normalized;
}

async function enrichSavedBasketItems(rawItems) {
  const items = normalizeSavedBasketItems(rawItems);
  const currentCatalog = await getCatalog();
  return items.map(item => {
    const catalogCourse = currentCatalog.byCode.get(item.code.replace(/\s+/g, '').toUpperCase());
    return {
      ...item,
      code: catalogCourse?.code || item.code,
      name: catalogCourse?.name || item.code,
      credits: catalogCourse?.credits || 0,
      assessments: catalogCourse?.assessments || [],
    };
  });
}

router.get('/saved', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, items, created_at, updated_at
         FROM saved_baskets
        WHERE session_id = $1
        ORDER BY updated_at DESC
        LIMIT 25`,
      [req.sessionId]
    );
    const saved = await Promise.all(rows.map(async row => ({
      id: row.id,
      name: row.name,
      items: await enrichSavedBasketItems(row.items),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
    res.json(saved);
  } catch (err) {
    console.error('GET /basket/saved error:', err.message);
    res.status(500).json({ error: 'Saved baskets could not be loaded' });
  }
});

router.post('/saved', async (req, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const items = normalizeSavedBasketItems(req.body?.items);
  if (!name) return res.status(400).json({ error: 'Basket name is required' });
  if (items.length === 0) return res.status(400).json({ error: 'Basket cannot be empty' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO saved_baskets (session_id, name, items)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, name, items, created_at, updated_at`,
      [req.sessionId, name, JSON.stringify(items)]
    );
    const row = rows[0];
    res.locals.activity = { ...res.locals.activity, savedBasketId: row.id, itemCount: items.length };
    res.status(201).json({
      id: row.id,
      name: row.name,
      items: await enrichSavedBasketItems(row.items),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('POST /basket/saved error:', err.message);
    res.status(500).json({ error: 'Basket could not be saved' });
  }
});

router.delete('/saved/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id || '')) {
    return res.status(400).json({ error: 'Invalid saved basket id' });
  }
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM saved_baskets WHERE id = $1 AND session_id = $2',
      [req.params.id, req.sessionId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Saved basket not found' });
    res.locals.activity = { ...res.locals.activity, savedBasketId: req.params.id, deleted: true };
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /basket/saved error:', err.message);
    res.status(500).json({ error: 'Saved basket could not be deleted' });
  }
});

export default router;
