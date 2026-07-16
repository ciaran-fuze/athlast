-- Race pages, race-athlete links, and supporter messages
-- Run this in the Supabase SQL Editor

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  race_date date,
  location text,
  distance_km real,
  raceresult_event_id integer,
  raceresult_server text default 'my.raceresult.com',
  raceresult_key text,
  status text default 'upcoming' check (status in ('upcoming', 'live', 'finished')),
  created_at timestamptz default now()
);

create table if not exists race_athletes (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  bib_number integer,
  raceresult_pid integer,
  unique (race_id, athlete_id)
);

create table if not exists supporter_messages (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  sender_name text not null,
  message text,
  photo_url text,
  created_at timestamptz default now()
);

create index if not exists idx_supporter_messages_race on supporter_messages(race_id, created_at desc);
create index if not exists idx_race_athletes_race on race_athletes(race_id);
