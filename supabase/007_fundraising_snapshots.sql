-- Migration: fundraising progress over time (to measure what came in during the race)
-- Run in the Supabase SQL Editor

create table if not exists fundraising_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_athlete_id uuid not null references race_athletes(id) on delete cascade,
  raised numeric,
  target numeric,
  supporters integer,
  captured_at timestamptz default now()
);

create index if not exists idx_fundraising_snapshots on fundraising_snapshots(race_athlete_id, captured_at desc);
