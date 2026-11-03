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
      room        TEXT,
      UNIQUE (course_code, section_no)
    )`);
  await pool.query(`ALTER TABLE catalog_sections ADD COLUMN IF NOT EXISTS room TEXT`);
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
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS grade_level VARCHAR(16)`);
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS grade_updated_at TIMESTAMPTZ`);
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
  // Anonymous survey: answers carry no session id, no IP and no time of day
  // (see routes/surveyRoutes.js). Submissions only stop repeat answers.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      university     VARCHAR(32) NOT NULL,
      survey_version INTEGER NOT NULL,
      answers        JSONB NOT NULL,
      major_code     VARCHAR(32),
      grade_level    VARCHAR(16),
      layout         VARCHAR(8),
      submitted_on   DATE NOT NULL DEFAULT CURRENT_DATE
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS survey_responses_university_idx ON survey_responses (university, submitted_on)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_submissions (
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      university VARCHAR(32) NOT NULL,
      PRIMARY KEY (session_id, university)
    )`);

  await migrateToMultiUniversity();

  // Panel accounts. A superadmin manages everything; everyone else only sees
  // the universities listed for them in admin_university_access.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id                  SERIAL PRIMARY KEY,
      email               TEXT NOT NULL UNIQUE,
      display_name        TEXT NOT NULL DEFAULT '',
      password_hash       TEXT,
      is_superadmin       BOOLEAN NOT NULL DEFAULT false,
      totp_secret         TEXT,
      totp_last_counter   BIGINT,
      disabled            BOOLEAN NOT NULL DEFAULT false,
      setup_token_hash    CHAR(64),
      setup_expires_at    TIMESTAMPTZ,
      failed_logins       INTEGER NOT NULL DEFAULT 0,
      locked_until        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by          INTEGER,
      last_login_at       TIMESTAMPTZ,
      password_changed_at TIMESTAMPTZ
    )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS admin_users_setup_token_idx ON admin_users (setup_token_hash) WHERE setup_token_hash IS NOT NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_university_access (
      user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      university VARCHAR(32) NOT NULL,
      role       VARCHAR(16) NOT NULL CHECK (role IN ('viewer', 'editor')),
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      granted_by INTEGER,
      PRIMARY KEY (user_id, university)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash   CHAR(64) PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      ip_address   TEXT,
      user_agent   TEXT
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id         BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id    INTEGER,
      email      TEXT,
      action     TEXT NOT NULL,
      university VARCHAR(32),
      details    JSONB,
      ip_address TEXT
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_audit_log_university_idx ON admin_audit_log (university, created_at DESC)`);
}

// ─── One database, many universities ───────────────────────────────
// Catalog, baskets and analytics carry a `university` column. Everything that
// existed before is Özyeğin's, which the column default says. Course codes are
// unique per university (two universities can both have "CS 101").
// Safe to run on every start: each step checks whether it is still needed.
async function migrateToMultiUniversity() {
  const tables = [
    'catalog_courses', 'catalog_sections', 'course_assessments', 'basket_items', 'saved_baskets',
    'shared_schedules', 'course_add_events', 'major_selection_events', 'site_events',
  ];
  for (const table of tables) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS university VARCHAR(32) NOT NULL DEFAULT 'ozyegin'`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // catalog_courses: primary key (course_code) -> (university, course_code),
    // and catalog_sections follows it. Constraint names are looked up rather
    // than assumed, since older installs may have named them differently.
    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'catalog_courses'::regclass AND contype = 'p'
             AND pg_get_constraintdef(oid) LIKE '%university%'
        ) THEN
          FOR r IN SELECT conname FROM pg_constraint
                    WHERE conrelid = 'catalog_sections'::regclass AND contype IN ('f', 'u') LOOP
            EXECUTE format('ALTER TABLE catalog_sections DROP CONSTRAINT %I', r.conname);
          END LOOP;
          FOR r IN SELECT conname FROM pg_constraint
                    WHERE conrelid = 'catalog_courses'::regclass AND contype = 'p' LOOP
            EXECUTE format('ALTER TABLE catalog_courses DROP CONSTRAINT %I', r.conname);
          END LOOP;
          ALTER TABLE catalog_courses ADD CONSTRAINT catalog_courses_pkey PRIMARY KEY (university, course_code);
          ALTER TABLE catalog_sections ADD CONSTRAINT catalog_sections_course_fkey
            FOREIGN KEY (university, course_code) REFERENCES catalog_courses (university, course_code)
            ON DELETE CASCADE ON UPDATE CASCADE;
          ALTER TABLE catalog_sections ADD CONSTRAINT catalog_sections_university_course_section_key
            UNIQUE (university, course_code, section_no);
        END IF;

        -- A browser keeps one basket per university.
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conrelid = 'basket_items'::regclass AND contype = 'u'
             AND pg_get_constraintdef(oid) LIKE '%university%'
        ) THEN
          FOR r IN SELECT conname FROM pg_constraint
                    WHERE conrelid = 'basket_items'::regclass AND contype = 'u' LOOP
            EXECUTE format('ALTER TABLE basket_items DROP CONSTRAINT %I', r.conname);
          END LOOP;
          ALTER TABLE basket_items ADD CONSTRAINT basket_items_session_university_course_key
            UNIQUE (session_id, university, course_code);
        END IF;
      END $$`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS course_assessments_university_code_idx ON course_assessments (university, course_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS saved_baskets_session_university_idx ON saved_baskets (session_id, university, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS course_add_events_university_idx ON course_add_events (university, added_at DESC)`);

  // Major and year, one row per browser session and university.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS university_preferences (
      session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      university       VARCHAR(32) NOT NULL,
      major_code       VARCHAR(32),
      first_major_code VARCHAR(32),
      major_updated_at TIMESTAMPTZ,
      grade_level      VARCHAR(16),
      grade_updated_at TIMESTAMPTZ,
      PRIMARY KEY (session_id, university)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS university_preferences_university_idx ON university_preferences (university)`);
  // Özyeğin's major/year used to live on `sessions`; copy them over. Sessions
  // that already have an Özyeğin row are skipped, so this is safe to repeat.
  // (The old columns stay, unused, so older backups still restore.)
  await pool.query(`
    INSERT INTO university_preferences
      (session_id, university, major_code, first_major_code, major_updated_at, grade_level, grade_updated_at)
    SELECT s.id, 'ozyegin', s.major_code, s.first_major_code, s.major_updated_at, NULLIF(s.grade_level, ''), s.grade_updated_at
      FROM sessions s
     WHERE (s.major_code IS NOT NULL OR s.first_major_code IS NOT NULL OR NULLIF(s.grade_level, '') IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM university_preferences p WHERE p.session_id = s.id AND p.university = 'ozyegin')`);
}

export { pool, ensureSchema };
