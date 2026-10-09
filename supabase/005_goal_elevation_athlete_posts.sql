-- Migration: Add goal_time, elevation_profile, and athlete posts support
-- Already applied to production Supabase via SQL Editor

ALTER TABLE race_athletes ADD COLUMN IF NOT EXISTS goal_time text;
ALTER TABLE races ADD COLUMN IF NOT EXISTS elevation_profile jsonb;
ALTER TABLE supporter_messages ADD COLUMN IF NOT EXISTS is_athlete_post boolean DEFAULT false;
