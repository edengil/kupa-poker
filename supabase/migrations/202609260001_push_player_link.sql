-- Link a push subscription to the Google account and the existing player.
alter table public.push_subscriptions add column if not exists email text;
alter table public.push_subscriptions add column if not exists player_name text;
