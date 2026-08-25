import pg from 'pg'

if (process.env.LOAD_TEST_CONFIRM !== 'yes') {
  console.error('Refusing to run without LOAD_TEST_CONFIRM=yes')
  process.exit(1)
}

const API = process.env.LOAD_TEST_URL || 'http://127.0.0.1:3001'
const runId = `UniPlannersLoadTest/${Date.now()}`
const maxUsers = 100
const cookies = []

const generationBody = {
  courses: ['ENG 101', 'CS 201', 'MATH 101', 'SEC 201', 'EE 201'].map(code => ({ code, sections: [] })),
  freeDays: [],
  preference: 'balanced',
}

const imageBody = {
  language: 'tr',
  schedule: {
    totalCredits: 24,
    lessons: [
      { code: 'ENG 101', name: 'English I', section: 'ENG 101A', lecturer: 'Instructor', credits: 4, times: [{ day: 'Pazartesi', start: '10:40', end: '12:30' }] },
      { code: 'CS 201', name: 'Data Structures', section: 'CS 201A', lecturer: 'Instructor', credits: 6, times: [{ day: 'Salı', start: '08:40', end: '10:30' }] },
      { code: 'MATH 101', name: 'Calculus I', section: 'MATH 101A', lecturer: 'Instructor', credits: 6, times: [{ day: 'Çarşamba', start: '12:40', end: '14:30' }] },
      { code: 'SEC 201', name: 'University Course', section: 'SEC 201A', lecturer: 'Instructor', credits: 2, times: [{ day: 'Perşembe', start: '14:40', end: '16:30' }] },
      { code: 'EE 201', name: 'Circuits', section: 'EE 201A', lecturer: 'Instructor', credits: 6, times: [{ day: 'Cuma', start: '09:40', end: '11:30' }] },
    ],
  },
}

const percentile = (sorted, ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0
const summary = (name, concurrency, elapsedMs, samples, failures) => {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    name,
    concurrency,
    requests: samples.length + failures,
    successes: samples.length,
    failures,
    rps: Number(((samples.length + failures) / (elapsedMs / 1000)).toFixed(1)),
    p50Ms: Number(percentile(sorted, 0.50).toFixed(1)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(1)),
    p99Ms: Number(percentile(sorted, 0.99).toFixed(1)),
    maxMs: Number((sorted.at(-1) || 0).toFixed(1)),
  }
}

async function request(path, index, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'user-agent': runId,
      cookie: cookies[index] || '',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
  await response.arrayBuffer()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

async function initializeUsers() {
  await Promise.all(Array.from({ length: maxUsers }, async (_, index) => {
    const response = await fetch(`${API}/api/stats`, { headers: { 'user-agent': runId }, signal: AbortSignal.timeout(10_000) })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Session initialization failed: HTTP ${response.status}`)
    cookies[index] = response.headers.get('set-cookie')?.split(';')[0] || ''
    if (!cookies[index]) throw new Error('Session cookie was not returned')
  }))
}

async function sustained(name, concurrency, durationMs, action) {
  const samples = []
  let failures = 0
  const started = performance.now()
  const deadline = started + durationMs
  await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
    while (performance.now() < deadline) {
      const requestStarted = performance.now()
      try {
        await action(index)
        samples.push(performance.now() - requestStarted)
      } catch {
        failures += 1
      }
    }
  }))
  return summary(name, concurrency, performance.now() - started, samples, failures)
}

async function burst(name, concurrency, action) {
  const samples = []
  let failures = 0
  const started = performance.now()
  await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
    const requestStarted = performance.now()
    try {
      await action(index)
      samples.push(performance.now() - requestStarted)
    } catch {
      failures += 1
    }
  }))
  return summary(name, concurrency, performance.now() - started, samples, failures)
}

async function priorityProbe() {
  const pngSamples = []
  let pngFailures = 0
  const started = performance.now()
  const pngRequests = Array.from({ length: 100 }, async (_, index) => {
    const requestStarted = performance.now()
    try {
      await request('/api/schedule/export-image', index, post(imageBody))
      pngSamples.push(performance.now() - requestStarted)
    } catch {
      pngFailures += 1
    }
  })

  await new Promise(resolve => setTimeout(resolve, 150))
  const scheduleStarted = performance.now()
  await request('/api/schedule/generate', 0, post(generationBody))
  const priorityScheduleMs = performance.now() - scheduleStarted
  await Promise.all(pngRequests)

  return {
    ...summary('png-queue-with-priority-generation', 100, performance.now() - started, pngSamples, pngFailures),
    priorityScheduleMs: Number(priorityScheduleMs.toFixed(1)),
  }
}

async function cleanup() {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API)) return
  // Give the server's batched request logger time to flush before removing
  // records created by this explicitly tagged local load-test run.
  await new Promise(resolve => setTimeout(resolve, 750))
  const envFile = new URL('./.env', import.meta.url)
  try { process.loadEnvFile(envFile) } catch { /* use local defaults */ }
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'ozu_user',
    password: process.env.DB_PASSWORD || 'password123',
    database: process.env.DB_NAME || 'ozu_schedule',
  })
  const logs = await pool.query('DELETE FROM server_request_logs WHERE user_agent = $1', [runId])
  const result = await pool.query('DELETE FROM sessions WHERE user_agent = $1', [runId])
  await pool.end()
  console.log(JSON.stringify({ cleanupRequestLogs: logs.rowCount, cleanupSessions: result.rowCount }))
}

const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

try {
  await initializeUsers()
  console.log(JSON.stringify({ initializedUsers: cookies.length }))
  const results = []
  if (process.env.LOAD_TEST_PROFILE === 'priority') {
    results.push(await priorityProbe())
  } else {
    results.push(await sustained('stats-read', 100, 8_000, index => request('/api/stats', index)))
    results.push(await sustained('course-search', 100, 10_000, index => request('/api/courses/search', index, post({ query: 'ENG' }))))
    results.push(await sustained('schedule-generation', 25, 10_000, index => request('/api/schedule/generate', index, post(generationBody))))
    results.push(await burst('schedule-generation-burst', 100, index => request('/api/schedule/generate', index, post(generationBody))))
    results.push(await sustained('png-export', 10, 10_000, index => request('/api/schedule/export-image', index, post(imageBody))))
    results.push(await burst('png-export-burst', 100, index => request('/api/schedule/export-image', index, post(imageBody))))
  }
  results.forEach(result => console.log(JSON.stringify(result)))
} finally {
  await cleanup()
}
