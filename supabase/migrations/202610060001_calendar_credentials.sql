-- Google Calendar OAuth credentials (server-only).
-- Stores the refresh token obtained via the in-app OAuth flow.
-- RLS: no client access; only the service-role (server) can read/write.
create table if not exists public.calendar_credentials (
  group_id uuid primary key references public.groups(id) on delete cascade,
  refresh_token text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_credentials enable row level security;

-- Deny all client access (no policies = no access for anon/authenticated).
-- Service role bypasses RLS.
