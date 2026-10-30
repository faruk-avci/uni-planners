import express from 'express'
import { pool } from '../config/db.js'
import { SURVEYS, publicSurvey, validateSurveyAnswers } from '../config/surveys.js'

// Anonymous by construction:
// - survey_responses holds answers plus coarse context (university, major,
//   year, design) and the submission *date* only. No session id, no IP, no
//   time of day, and a random id, so rows cannot be ordered or matched back
//   to a visitor.
// - survey_submissions only records that a session has answered (no time,
//   no link to the answers) so the same browser is not asked twice.
// - requestLogger skips POSTs to this router, so request size/time/IP are
//   not logged next to a submission either.

const router = express.Router()

router.get('/:university', async (req, res) => {
  const survey = publicSurvey(req.params.university)
  if (!survey) return res.status(404).json({ error: 'Survey not found' })
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM survey_submissions WHERE session_id = $1 AND university = $2',
      [req.sessionId, req.params.university]
    )
    res.json({ survey, submitted: rows.length > 0 })
  } catch (err) {
    console.error('GET /survey error:', err.message)
    res.status(500).json({ error: 'Survey could not be loaded' })
  }
})

router.post('/:university', async (req, res) => {
  const slug = req.params.university
  const survey = SURVEYS[slug]
  if (!survey) return res.status(404).json({ error: 'Survey not found' })

  const { answers, error } = validateSurveyAnswers(survey, req.body?.answers)
  if (error) return res.status(400).json({ error })
  const layout = ['1', '2'].includes(String(req.body?.layout)) ? String(req.body.layout) : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO survey_submissions (session_id, university)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [req.sessionId, slug]
    )
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'already_submitted' })
    }
    // Context is copied from the session, not linked to it.
    const { rows } = await client.query('SELECT major_code, grade_level FROM sessions WHERE id = $1', [req.sessionId])
    await client.query(
      `INSERT INTO survey_responses (university, survey_version, answers, major_code, grade_level, layout)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [slug, survey.version, answers, rows[0]?.major_code || null, rows[0]?.grade_level || null, layout]
    )
    await client.query('COMMIT')
    res.status(201).json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('POST /survey error:', err.message)
    res.status(500).json({ error: 'Survey could not be saved' })
  } finally {
    client.release()
  }
})

export default router
