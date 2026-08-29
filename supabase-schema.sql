-- ═══════════════════════════════════════════════════════════
-- Evolvion '26 — THE SUMMONS — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Schools registered for the event ──────────────────────────
CREATE TABLE registrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name  TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  status       TEXT DEFAULT 'active'
);

-- ── Individual members (one per subject per school) ────────────
CREATE TABLE members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL CHECK (subject IN ('biology','chemistry','physics','maths')),
  is_captain      BOOLEAN DEFAULT FALSE,
  access_code     TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_members_access_code ON members(access_code);

-- ── Quiz configuration per subject ────────────────────────────
CREATE TABLE quizzes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT UNIQUE NOT NULL CHECK (subject IN ('biology','chemistry','physics','maths')),
  title            TEXT NOT NULL,
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INT DEFAULT 30,
  status           TEXT DEFAULT 'waiting',
  correct_points   INT DEFAULT 4,
  negative_points  INT DEFAULT 1,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Questions per quiz ─────────────────────────────────────────
CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  order_index     INT NOT NULL,
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  option_e        TEXT,
  correct_option  TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D','E')),
  points          INT DEFAULT 4,
  negative_points INT DEFAULT 1,
  image_url       TEXT,
  -- Sinhala translations (nullable — English is shown as fallback)
  question_text_si TEXT,
  option_a_si      TEXT,
  option_b_si      TEXT,
  option_c_si      TEXT,
  option_d_si      TEXT,
  option_e_si      TEXT
);

-- ── MIGRATION: Add Sinhala columns to existing questions table ──
-- Run this block if the table already exists in your Supabase project:
-- ALTER TABLE questions
--   ADD COLUMN IF NOT EXISTS question_text_si TEXT,
--   ADD COLUMN IF NOT EXISTS option_a_si      TEXT,
--   ADD COLUMN IF NOT EXISTS option_b_si      TEXT,
--   ADD COLUMN IF NOT EXISTS option_c_si      TEXT,
--   ADD COLUMN IF NOT EXISTS option_d_si      TEXT,
--   ADD COLUMN IF NOT EXISTS option_e_si      TEXT;
CREATE INDEX idx_questions_quiz ON questions(quiz_id, order_index);

-- ── Live quiz control state (realtime subscribed) ─────────────
CREATE TABLE quiz_state (
  subject               TEXT PRIMARY KEY CHECK (subject IN ('biology','chemistry','physics','maths')),
  status                TEXT DEFAULT 'waiting',
  current_question_index INT DEFAULT -1,
  question_started_at   TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ
);

-- Insert default rows for each subject
INSERT INTO quiz_state (subject) VALUES ('biology'),('chemistry'),('physics'),('maths')
ON CONFLICT (subject) DO NOTHING;

-- ── Member answer sessions ─────────────────────────────────────
CREATE TABLE quiz_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID REFERENCES members(id) ON DELETE CASCADE,
  quiz_id      UUID REFERENCES quizzes(id),
  subject      TEXT NOT NULL,
  answers      JSONB DEFAULT '[]',
  total_score  INT DEFAULT 0,
  rank         INT,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_subject ON quiz_sessions(subject);
CREATE INDEX idx_sessions_member  ON quiz_sessions(member_id);

-- ═══════════════════════════════════════════════════════════
-- REALTIME: Enable realtime on quiz_state and quiz_sessions
-- Run in Supabase Dashboard → Database → Replication
-- Or run these:
-- ═══════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE quiz_state;
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_sessions;

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE registrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_state     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions  ENABLE ROW LEVEL SECURITY;

-- Public can read (for members accessing the quiz)
CREATE POLICY "public_read_quizzes"    ON quizzes    FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_questions"  ON questions  FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_quiz_state" ON quiz_state FOR SELECT TO anon USING (true);
CREATE POLICY "public_read_sessions"   ON quiz_sessions FOR SELECT TO anon USING (true);

-- Service role (used by Next.js API) bypasses RLS — no additional policies needed

-- ── Realtime Live Chat Messages (YouTube-style live chat) ───────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name  TEXT NOT NULL,
  school_name  TEXT,
  message      TEXT NOT NULL,
  is_pinned    BOOLEAN DEFAULT FALSE,
  is_hidden    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ═══════════════════════════════════════════════════════════
-- SAMPLE DATA: Insert a test school and members
-- ═══════════════════════════════════════════════════════════

-- Insert sample registration
INSERT INTO registrations (school_name, contact_email) VALUES
  ('D. S. Senanayake College', 'test@ssdssc.com')
RETURNING id;

-- After getting the id, insert members manually:
-- INSERT INTO members (registration_id, name, subject, is_captain, access_code) VALUES
--   ('YOUR-REG-ID', 'Sanuka Kavisinghe', 'physics',   TRUE,  'PHY-2K9X'),
--   ('YOUR-REG-ID', 'Inopsh Ushara',     'biology',   FALSE, 'BIO-7M3Q'),
--   ('YOUR-REG-ID', 'Rasaad Akbar',      'chemistry', FALSE, 'CHE-4P1R'),
--   ('YOUR-REG-ID', 'Nadith Rajinda',    'maths',     FALSE, 'MAT-8N5W');
