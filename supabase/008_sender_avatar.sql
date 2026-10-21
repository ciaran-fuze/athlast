-- Optional selfie shown as a round avatar beside a supporter's messages and photos
alter table supporter_messages add column if not exists sender_avatar_url text;
