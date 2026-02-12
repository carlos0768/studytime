-- ============================================================
-- StudyMatch DB Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add new columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS elo_rating integer NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS total_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_matches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_study_seconds integer NOT NULL DEFAULT 0;

-- 2. Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  loser_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason text CHECK (end_reason IN ('giveup', 'tab_hidden', 'disconnect')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  player1_elo_before integer NOT NULL,
  player2_elo_before integer NOT NULL,
  player1_elo_after integer,
  player2_elo_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for match queries
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_ended_at ON matches(ended_at DESC);

-- 4. RLS for matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Users can read their own matches
CREATE POLICY "Users can read own matches" ON matches
  FOR SELECT USING (
    auth.uid() = player1_id OR auth.uid() = player2_id
  );

-- Service role can insert/update (API routes use service role key)
-- No INSERT/UPDATE policy for anon — only server-side via service role

-- 5. Drop old columns from users (if they exist)
ALTER TABLE users
  DROP COLUMN IF EXISTS total_points,
  DROP COLUMN IF EXISTS total_minutes;

-- 6. Drop old tables (CAUTION: destructive!)
-- Uncomment these when you're ready to remove old data:
-- DROP TABLE IF EXISTS daily_stats;
-- DROP TABLE IF EXISTS study_sessions;
-- DROP TABLE IF EXISTS rooms;

-- 7. Drop old RPC if it exists
-- DROP FUNCTION IF EXISTS finalize_study_session;
