-- Migration: race start time (drives countdown) + fundraising link per athlete
-- Run in the Supabase SQL Editor

ALTER TABLE races ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE race_athletes ADD COLUMN IF NOT EXISTS fundraising_url text;
