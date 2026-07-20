-- Add athlete estimated km at time of message send
alter table supporter_messages add column if not exists athlete_km_at_send real;
