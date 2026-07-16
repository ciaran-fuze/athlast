-- Athlast schema
-- Run this in the Supabase SQL Editor

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  strava_id bigint unique not null,
  first_name text,
  last_name text,
  profile_picture text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at bigint not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  strava_id bigint unique not null,
  athlete_id uuid not null references athletes(id) on delete cascade,
  name text,
  sport_type text,
  distance real,
  moving_time integer,
  elapsed_time integer,
  start_date timestamptz,
  average_speed real,
  max_speed real,
  total_elevation_gain real,
  map_summary_polyline text,
  created_at timestamptz default now()
);

create index if not exists idx_activities_athlete_id on activities(athlete_id);
create index if not exists idx_activities_start_date on activities(start_date desc);
