-- Atomically finalize a study session and accumulate user stats.
-- Prevents missing reflection on dashboard and avoids double counting.
CREATE OR REPLACE FUNCTION public.finalize_study_session(
  p_session_id UUID,
  p_duration_minutes INTEGER,
  p_points_earned INTEGER,
  p_ended_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_already_ended TIMESTAMPTZ;
  v_minutes INTEGER := GREATEST(COALESCE(p_duration_minutes, 0), 0);
  v_points INTEGER := GREATEST(COALESCE(p_points_earned, 0), 0);
  v_ended_at TIMESTAMPTZ := COALESCE(p_ended_at, NOW());
BEGIN
  SELECT user_id, ended_at
    INTO v_user_id, v_already_ended
  FROM study_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_already_ended IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE study_sessions
  SET
    ended_at = v_ended_at,
    duration_minutes = v_minutes,
    points_earned = v_points
  WHERE id = p_session_id
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE users
  SET
    total_minutes = total_minutes + v_minutes,
    total_points = total_points + v_points
  WHERE id = v_user_id;

  INSERT INTO daily_stats (user_id, date, total_minutes, total_points)
  VALUES (
    v_user_id,
    (v_ended_at AT TIME ZONE 'UTC')::DATE,
    v_minutes,
    v_points
  )
  ON CONFLICT (user_id, date)
  DO UPDATE
    SET
      total_minutes = daily_stats.total_minutes + EXCLUDED.total_minutes,
      total_points = daily_stats.total_points + EXCLUDED.total_points;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_study_session(UUID, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_study_session(UUID, INTEGER, INTEGER, TIMESTAMPTZ) TO authenticated;
