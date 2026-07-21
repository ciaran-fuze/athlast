-- Message reactions (heart/clap on supporter messages)
-- Run this in the Supabase SQL Editor

create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references supporter_messages(id) on delete cascade,
  device_id text not null,
  reaction_type text not null default 'heart',
  created_at timestamptz default now(),
  unique (message_id, device_id, reaction_type)
);

create index if not exists idx_message_reactions_message on message_reactions(message_id);
