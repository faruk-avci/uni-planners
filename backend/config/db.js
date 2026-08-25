import pg from 'pg';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load backend/.env if present (node 20.6+)
const envPath = path.join(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'ozu_user',
  password: process.env.DB_PASSWORD || 'password123',
  database: process.env.DB_NAME || 'ozu_schedule',
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
});

// ─── Schema bootstrap (app-owned tables) ───────────────────────────
async function ensureSchema() {
  // Catalog tables must exist even before the first scraper run. This lets the
  // curriculum and onboarding APIs return useful empty-catalog responses on a
  // fresh server instead of failing with "relation does not exist".
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_courses (
      course_code       VARCHAR(20) PRIMARY KEY,
      subject           VARCHAR(10) NOT NULL,
      course_no         VARCHAR(10) NOT NULL,
      title             VARCHAR(255) NOT NULL,
      faculty           VARCHAR(255),
      credits           DECIMAL(3,1) NOT NULL,
      description       TEXT,
      corequisites      VARCHAR(255),
      prerequisites     VARCHAR(255),
      required_programs TEXT[] NOT NULL DEFAULT '{}',
      elective_programs TEXT[] NOT NULL DEFAULT '{}'
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_sections (
      id          SERIAL PRIMARY KEY,
      course_code VARCHAR(20) NOT NULL REFERENCES catalog_courses(course_code) ON DELETE CASCADE,
      section_no  VARCHAR(10) NOT NULL,
      instructor  VARCHAR(255),
      schedule    TEXT,
      UNIQUE (course_code, section_no)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_assessments (
      id              SERIAL PRIMARY KEY,
      course_code     VARCHAR(20) NOT NULL,
      assessment_type TEXT,
      category        TEXT,
      weight          NUMERIC(6,2),
      raw_text        TEXT
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_agent TEXT,
      ozu_id     TEXT
    )`);
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS major_code VARCHAR(32)`);
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS major_updated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS first_major_code VARCHAR(32)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS basket_items (
      id          SERIAL PRIMARY KEY,
      session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      course_code VARCHAR(20) NOT NULL,
      sections    TEXT[] NOT NULL DEFAULT '{}',
      source      TEXT,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (session_id, course_code)
    )`);
  await pool.query(`ALTER TABLE basket_items ADD COLUMN IF NOT EXISTS source TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_baskets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name       VARCHAR(60) NOT NULL,
      items      JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS saved_baskets_session_idx ON saved_baskets (session_id, updated_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shared_schedules (
      short_id          VARCHAR(8) PRIMARY KEY,
      creator_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      major_code        VARCHAR(32),
      catalog_term      VARCHAR(80),
      schedule          JSONB NOT NULL,
      view_count        BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_viewed_at    TIMESTAMPTZ
    )`);
  await pool.query(`ALTER TABLE shared_schedules ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS shared_schedules_creator_content_uidx
      ON shared_schedules (creator_session_id, content_hash)
      WHERE creator_session_id IS NOT NULL AND content_hash IS NOT NULL
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS shared_schedules_creator_idx ON shared_schedules (creator_session_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS shared_schedules_created_idx ON shared_schedules (created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_add_events (
      id             BIGSERIAL PRIMARY KEY,
      session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      course_code    VARCHAR(20) NOT NULL,
      source         VARCHAR(32) NOT NULL,
      selection_mode VARCHAR(16) NOT NULL DEFAULT 'course',
      added_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS course_add_events_added_at_idx ON course_add_events (added_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS course_add_events_source_idx ON course_add_events (source, added_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS major_selection_events (
      id          BIGSERIAL PRIMARY KEY,
      session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      major_code  VARCHAR(32) NOT NULL,
      source      VARCHAR(24) NOT NULL,
      selected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS major_selection_events_major_idx ON major_selection_events (major_code, selected_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS major_selection_events_session_idx ON major_selection_events (session_id, selected_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dino_high_scores (
      email           TEXT PRIMARY KEY,
      best_score      INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
      last_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dino_high_scores_rank_idx ON dino_high_scores (best_score DESC, updated_at ASC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_events (
      id             BIGSERIAL PRIMARY KEY,
      session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
      event_category VARCHAR(32) NOT NULL,
      event_action   VARCHAR(64) NOT NULL,
      event_label    TEXT,
      event_data     JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS site_events_category_action_idx ON site_events (event_category, event_action, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS server_request_logs (
      id             BIGSERIAL PRIMARY KEY,
      request_id     UUID NOT NULL,
      session_id     UUID REFERENCES sessions(id) ON DELETE SET NULL,
      event_action   VARCHAR(80) NOT NULL,
      method         VARCHAR(8) NOT NULL,
      request_path   TEXT NOT NULL,
      status_code    INTEGER NOT NULL,
      duration_ms    NUMERIC(12, 3) NOT NULL,
      request_size   BIGINT,
      response_size  BIGINT,
      ip_address     TEXT,
      user_agent     TEXT,
      referrer       TEXT,
      metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS server_request_logs_created_idx ON server_request_logs (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS server_request_logs_action_idx ON server_request_logs (event_action, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS server_request_logs_session_idx ON server_request_logs (session_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS server_request_logs_status_idx ON server_request_logs (status_code, created_at DESC)`);
}

export { pool, ensureSchema };
