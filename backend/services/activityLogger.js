import { pool } from '../config/db.js'

const FLUSH_INTERVAL_MS = Number.parseInt(process.env.LOG_FLUSH_MS, 10) || 250
const MAX_BATCH_SIZE = Number.parseInt(process.env.LOG_BATCH_SIZE, 10) || 500
const MAX_QUEUE_SIZE = Number.parseInt(process.env.LOG_QUEUE_MAX, 10) || 20_000

let queue = []
let flushing = false
let dropped = 0

export function enqueueRequestLog(record) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    dropped += 1
    if (dropped === 1 || dropped % 1000 === 0) {
      console.error(JSON.stringify({ event: 'request_log_dropped', dropped, queueSize: queue.length }))
    }
    return
  }
  queue.push(record)
  if (queue.length >= MAX_BATCH_SIZE) flushRequestLogs().catch(() => {})
}

export async function flushRequestLogs() {
  if (flushing || queue.length === 0) return
  flushing = true
  const batch = queue.splice(0, MAX_BATCH_SIZE)
  try {
    await pool.query(
      `INSERT INTO server_request_logs (
         request_id, session_id, event_action, method, request_path,
         status_code, duration_ms, request_size, response_size,
         ip_address, user_agent, referrer, metadata, created_at
       )
       SELECT x.request_id::uuid, NULLIF(x.session_id, '')::uuid,
              x.event_action, x.method, x.request_path,
              x.status_code, x.duration_ms, x.request_size, x.response_size,
              x.ip_address, x.user_agent, x.referrer,
              COALESCE(x.metadata, '{}'::jsonb), x.created_at
         FROM jsonb_to_recordset($1::jsonb) AS x(
           request_id text, session_id text, event_action text, method text,
           request_path text, status_code integer, duration_ms numeric,
           request_size bigint, response_size bigint, ip_address text,
           user_agent text, referrer text, metadata jsonb, created_at timestamptz
         )`,
      [JSON.stringify(batch)]
    )
  } catch (error) {
    queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE)
    console.error(JSON.stringify({ event: 'request_log_flush_failed', error: error.message, queued: queue.length }))
  } finally {
    flushing = false
    if (queue.length >= MAX_BATCH_SIZE) setImmediate(() => flushRequestLogs().catch(() => {}))
  }
}

export function requestLogStats() {
  return { queued: queue.length, flushing, dropped }
}

export async function drainRequestLogs() {
  while (flushing) await new Promise(resolve => setTimeout(resolve, 10))
  while (queue.length > 0) {
    const before = queue.length
    await flushRequestLogs()
    if (queue.length >= before) break
  }
}

let siteEventQueue = []
let siteEventFlushing = false
let siteEventDropped = 0

export function enqueueSiteEvent(record) {
  if (siteEventQueue.length >= MAX_QUEUE_SIZE) {
    siteEventDropped += 1
    if (siteEventDropped === 1 || siteEventDropped % 1000 === 0) {
      console.error(JSON.stringify({ event: 'site_event_dropped', dropped: siteEventDropped, queueSize: siteEventQueue.length }))
    }
    return
  }
  siteEventQueue.push(record)
  if (siteEventQueue.length >= MAX_BATCH_SIZE) flushSiteEvents().catch(() => {})
}

export async function flushSiteEvents() {
  if (siteEventFlushing || siteEventQueue.length === 0) return
  siteEventFlushing = true
  const batch = siteEventQueue.splice(0, MAX_BATCH_SIZE)
  try {
    await pool.query(
      `INSERT INTO site_events (session_id, event_category, event_action, event_label, event_data, created_at)
       SELECT NULLIF(x.session_id, '')::uuid, x.event_category, x.event_action,
              x.event_label, x.event_data, x.created_at
         FROM jsonb_to_recordset($1::jsonb) AS x(
           session_id text, event_category text, event_action text,
           event_label text, event_data jsonb, created_at timestamptz
         )`,
      [JSON.stringify(batch)]
    )
  } catch (error) {
    siteEventQueue = [...batch, ...siteEventQueue].slice(0, MAX_QUEUE_SIZE)
    console.error(JSON.stringify({ event: 'site_event_flush_failed', error: error.message, queued: siteEventQueue.length }))
  } finally {
    siteEventFlushing = false
    if (siteEventQueue.length >= MAX_BATCH_SIZE) setImmediate(() => flushSiteEvents().catch(() => {}))
  }
}

export function siteEventStats() {
  return { queued: siteEventQueue.length, flushing: siteEventFlushing, dropped: siteEventDropped }
}

export async function drainSiteEvents() {
  while (siteEventFlushing) await new Promise(resolve => setTimeout(resolve, 10))
  while (siteEventQueue.length > 0) {
    const before = siteEventQueue.length
    await flushSiteEvents()
    if (siteEventQueue.length >= before) break
  }
}

const timer = setInterval(() => {
  flushRequestLogs().catch(() => {})
  flushSiteEvents().catch(() => {})
}, FLUSH_INTERVAL_MS)
timer.unref?.()

export function stopActivityLoggerTimer() {
  clearInterval(timer)
}
