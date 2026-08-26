import express from 'express';
import { extractPdfText, parseDegreeAuditText } from '../services/degreeAuditParser.js';
import { matchDegreeAudit } from '../services/degreeAuditMatcher.js';

const router = express.Router();
const pdfBody = express.raw({ type: 'application/octet-stream', limit: '15mb' });

// Purely stateless: no session lookup, no DB writes. The PDF contains the
// student's real name and student number, so nothing here is persisted —
// the parsed result is returned to the client and it's the client's choice
// whether to keep it (in localStorage, per product decision).
router.post('/', pdfBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'A PDF file is required' });
  }
  try {
    const text = extractPdfText(req.body);
    const parsed = parseDegreeAuditText(text);
    const result = await matchDegreeAudit(parsed);
    if (result.error) {
      res.locals.activity = { ...res.locals.activity, major: result.major, error: result.error };
      return res.status(400).json(result);
    }
    res.locals.activity = {
      ...res.locals.activity,
      major: result.major,
      requiredTakenCount: result.requiredTaken.length,
      requiredMissingCount: result.requiredMissing.length,
      unplacedCount: result.unplaced.length,
    };
    res.json(result);
  } catch (err) {
    console.error('POST /degree-audit error:', err.message);
    res.status(400).json({ error: err.message || 'The PDF could not be parsed' });
  }
});

export default router;
