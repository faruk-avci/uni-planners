// Non-blocking, heavily rate-limited nudge to fill the (admin-configured)
// survey. Never shown more than SHOWN_CAP times ever, never re-shown within
// COOLDOWN_MS of the last time, and never shown at all once the visitor has
// clicked through to the survey once. The "generate" trigger additionally
// waits for the 3rd successful generate -- the first one is too early to
// have formed any opinion about the product yet.
const SHOWN_CAP = 3
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
const GENERATE_THRESHOLD = 3

const KEYS = {
  generateCount: 'uniplanner_survey_generate_count',
  shownCount: 'uniplanner_survey_shown_count',
  lastShownAt: 'uniplanner_survey_last_shown_at',
  done: 'uniplanner_survey_done',
}

const readNumber = key => Number(localStorage.getItem(key)) || 0

export function recordGenerateSuccess() {
  localStorage.setItem(KEYS.generateCount, String(readNumber(KEYS.generateCount) + 1))
}

export function shouldQueueSurveyNudge(reason) {
  if (localStorage.getItem(KEYS.done) === 'true') return false
  if (readNumber(KEYS.shownCount) >= SHOWN_CAP) return false
  if (Date.now() - readNumber(KEYS.lastShownAt) < COOLDOWN_MS) return false
  if (reason === 'generate' && readNumber(KEYS.generateCount) < GENERATE_THRESHOLD) return false
  return true
}

export function markSurveyNudgeShown() {
  localStorage.setItem(KEYS.shownCount, String(readNumber(KEYS.shownCount) + 1))
  localStorage.setItem(KEYS.lastShownAt, String(Date.now()))
}

export function markSurveyNudgeDone() {
  localStorage.setItem(KEYS.done, 'true')
}
