-- תור התראות: מאפשר שליחה אמינה עם ניסיונות חוזרים.
-- בשלב זה רק הסכמה — העיבוד יחובר בהמשך.

create table if not exists public.push_queue (
  id         bigserial primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  kind       text not null check (kind in ('transfer', 'game_start', 'reminder', 'summary', 'payment')),
  title      text not null,
  body       text not null,
  url        text,
  tag        text,
  -- מטרות: מערך של {player_name} או null = לכל המנויים בקבוצה
  targets    jsonb,
  status     text not null default 'pending' check (status in ('pending', 'sending', 'done', 'failed')),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_queue_pending_idx
  on public.push_queue (status, created_at)
  where status = 'pending';

create index if not exists push_queue_group_idx
  on public.push_queue (group_id);

alter table public.push_queue enable row level security;

-- רק service_role מנהל את התור; הקליינט לא ניגש ישירות
drop policy if exists "queue service only" on public.push_queue;
create policy "queue service only"
  on public.push_queue for all
  to service_role
  using (true)
  with check (true);

-- אין גישה ל-authenticated או anon
revoke all on table public.push_queue from public, anon, authenticated;
grant all on table public.push_queue to service_role;
