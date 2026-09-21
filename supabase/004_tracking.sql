-- RTRT tracking data
-- Run this in the Supabase SQL Editor

-- Add RTRT identifiers to race_athletes
alter table race_athletes add column if not exists rtrt_event_code text;
alter table race_athletes add column if not exists rtrt_athlete_id text;

-- Store scraped tracking snapshots
create table if not exists tracking_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_athlete_id uuid not null references race_athletes(id) on delete cascade,
  splits jsonb not null default '[]',
  finish_time text,
  avg_pace text,
  overall_place integer,
  overall_total integer,
  status text default 'racing' check (status in ('not_started', 'racing', 'finished')),
  scraped_at timestamptz default now()
);

create index if not exists idx_tracking_race_athlete on tracking_snapshots(race_athlete_id, scraped_at desc);

-- Update Phil's race_athlete record with RTRT IDs
update race_athletes
set rtrt_event_code = 'TDL-DUBLINHALF-2026',
    rtrt_athlete_id = 'RMBRVZJE'
where bib_number = 5502;
