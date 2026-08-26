import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const router = express.Router();
const INDEX_PATH = fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url));
const SHARE_ID_RE = /^[23456789A-HJ-NP-Za-km-z]{8}$/;

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceMeta(html, selector, value) {
  const escaped = escapeAttribute(value);
  const pattern = new RegExp(`(<meta\\s+${selector}\\s+content=")[^"]*("\\s*\\/?>)`, 'i');
  return html.replace(pattern, `$1${escaped}$2`);
}

export function sharedPageHtml(indexHtml, { id, row, siteOrigin }) {
  const url = `${siteOrigin}/share/${encodeURIComponent(id)}`;
  const image = `${siteOrigin}/uniplanners-shared-preview.png`;
  const lessons = Array.isArray(row?.schedule?.lessons) ? row.schedule.lessons : [];
  const credits = Number(row?.schedule?.totalCredits) || 0;
  const courseCodes = lessons.slice(0, 5).map(lesson => String(lesson.code || '').trim()).filter(Boolean);
  const remaining = Math.max(lessons.length - courseCodes.length, 0);
  const courseSummary = `${courseCodes.join(', ')}${remaining ? ` +${remaining}` : ''}`;
  const title = row
    ? 'Bir ders programı seninle paylaşıldı · UniPlanners'
    : 'Paylaşılan program bulunamadı · UniPlanners';
  const description = row
    ? `${row.catalog_term || 'Ders programı'} · ${lessons.length} ders · ${credits} AKTS${courseSummary ? ` — ${courseSummary}` : ''}`
    : 'Bu paylaşım bağlantısı geçerli değil veya program artık mevcut değil.';

  let html = indexHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttribute(title)}</title>`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/i, `$1${escapeAttribute(url)}$2`);

  html = replaceMeta(html, 'name="description"', description);
  html = replaceMeta(html, 'property="og:url"', url);
  html = replaceMeta(html, 'property="og:title"', title);
  html = replaceMeta(html, 'property="og:description"', description);
  html = replaceMeta(html, 'property="og:image"', image);
  html = replaceMeta(html, 'property="og:image:secure_url"', image);
  html = replaceMeta(html, 'property="og:image:alt"', 'UniPlanners üzerinden paylaşılan haftalık ders programı');
  // Set explicitly rather than relying on the base template's values already
  // matching this image by coincidence — a mismatch here is a common reason
  // crawlers (LinkedIn in particular) silently refuse to render a preview.
  html = replaceMeta(html, 'property="og:image:type"', 'image/png');
  html = replaceMeta(html, 'property="og:image:width"', '1200');
  html = replaceMeta(html, 'property="og:image:height"', '630');
  html = replaceMeta(html, 'name="twitter:title"', title);
  html = replaceMeta(html, 'name="twitter:description"', description);
  html = replaceMeta(html, 'name="twitter:image"', image);
  return html;
}

router.get('/:id', async (req, res) => {
  const id = String(req.params.id || '');
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const configuredDomain = String(process.env.APP_DOMAIN || '').trim();
  const siteOrigin = configuredDomain ? `https://${configuredDomain}` : `${protocol}://${req.get('host')}`;

  try {
    const [indexHtml, result] = await Promise.all([
      readFile(INDEX_PATH, 'utf8'),
      SHARE_ID_RE.test(id)
        ? pool.query(
          `SELECT catalog_term, schedule
             FROM shared_schedules
            WHERE short_id = $1`,
          [id]
        )
        : Promise.resolve({ rows: [] }),
    ]);
    const row = result.rows[0] || null;
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(sharedPageHtml(indexHtml, { id, row, siteOrigin }));
  } catch (err) {
    console.error('GET /share/:id error:', err.message);
    res.status(503).type('text').send('Shared schedule is temporarily unavailable.');
  }
});

export default router;
