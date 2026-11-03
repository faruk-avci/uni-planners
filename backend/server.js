import express from 'express';
import cors from 'cors';

// Config & DB
import { ensureSchema, pool } from './config/db.js';

// Middleware
import { sessionMiddleware } from './middleware/session.js';
import { requestLogger } from './middleware/requestLogger.js';
import { drainRequestLogs, requestLogStats, stopActivityLoggerTimer } from './services/activityLogger.js';
import { pruneSessions } from './services/adminAccounts.js';
import { schedulePool, heavyTaskPoolConfig, closeHeavyTaskPools } from './services/heavyTaskPool.js';

// Routes
import catalogRoutes from './routes/catalogRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import basketRoutes from './routes/basketRoutes.js';
import userRoutes from './routes/userRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import dinoRoutes from './routes/dinoRoutes.js';
import sharedScheduleRoutes from './routes/sharedScheduleRoutes.js';
import sharePageRoutes from './routes/sharePageRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { DEFAULT_UNIVERSITY, isUniversity } from './config/universities.js';
import degreeAuditRoutes from './routes/degreeAuditRoutes.js';
import surveyRoutes from './routes/surveyRoutes.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// No visitor IP is used or stored anywhere. Cloudflare and nginx pass it in
// these headers; drop them before any route sees the request, so req.ip is
// only ever nginx's own address.
const CLIENT_IP_HEADERS = [
  'x-forwarded-for', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-connecting-ipv6',
  'true-client-ip', 'x-client-ip', 'x-cluster-client-ip', 'fastly-client-ip',
];
app.use((req, _res, next) => {
  for (const header of CLIENT_IP_HEADERS) delete req.headers[header];
  next();
});

// CORS: '*' (default) allows any origin; otherwise a comma-separated allowlist.
// `credentials: true` lets the session cookie ride along on cross-origin calls.
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// Shared schedule pages need server-rendered social metadata. The React app
// still takes over once the returned index document reaches the browser.
app.use('/share', sharePageRoutes);

// Monitoring must not create anonymous sessions or pollute user analytics.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'ok',
      heavyTasks: schedulePool.stats(),
      requestLogs: requestLogStats(),
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', database: 'error' });
  }
});

// Session Middleware
app.use('/api', sessionMiddleware);
app.use('/api', requestLogger);

// Mount Routes
// University-scoped API: /api/u/<university>/courses/search, .../schedule/generate,
// .../basket and so on. The same routers also stay at their old /api paths,
// where they serve Özyeğin, so builds and links from before keep working.
const scopedApi = express.Router({ mergeParams: true });
scopedApi.use(catalogRoutes);
scopedApi.use('/schedule', scheduleRoutes);
scopedApi.use('/basket', basketRoutes);
scopedApi.use(userRoutes);
scopedApi.use(analyticsRoutes);
app.use('/api/u/:university', (req, res, next) => {
  if (!isUniversity(req.params.university)) return res.status(404).json({ error: 'Unknown university' });
  req.university = req.params.university;
  next();
}, scopedApi);
app.use('/api', (req, _res, next) => { req.university ||= DEFAULT_UNIVERSITY; next(); });

app.use('/api', catalogRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/basket', basketRoutes);
// Backward-compatible path used by existing frontend builds before the route split.
app.use('/api/saved-baskets', (req, res, next) => {
  req.url = `/saved${req.url === '/' ? '' : req.url}`;
  basketRoutes(req, res, next);
});
app.use('/api', userRoutes); // mounts /preferences
app.use('/api', analyticsRoutes);
app.use('/api/dino', dinoRoutes);
app.use('/api/shared-schedules', sharedScheduleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/degree-audit', degreeAuditRoutes);
app.use('/api/survey', surveyRoutes);

// ─── Start ─────────────────────────────────────────────────────────
let server;

ensureSchema()
  .then(() => {
    // Expired panel sessions are refused on use anyway; this keeps the table small.
    setInterval(() => pruneSessions().catch(() => {}), 60 * 60 * 1000).unref();
    server = app.listen(PORT, () => {
      console.log(JSON.stringify({
        event: 'server_started',
        port: PORT,
        heavyWorkers: heavyTaskPoolConfig.poolSize,
        detectedCores: heavyTaskPoolConfig.detectedCores,
        heavyQueueMax: heavyTaskPoolConfig.maxQueue,
      }));
    });
  })
  .catch(err => {
    console.error('❌ Schema init failed:', err.message);
    process.exit(1);
  });

async function shutdown(signal) {
  console.log(JSON.stringify({ event: 'server_stopping', signal }));
  server?.close();
  stopActivityLoggerTimer();
  await drainRequestLogs().catch(() => {});
  await closeHeavyTaskPools().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
