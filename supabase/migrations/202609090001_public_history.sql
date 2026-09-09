begin;

-- Protect old clients as well: the original RPC must never expose hidden history.
create or replace function public.public_group(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz)
language sql security definer stable set search_path = public
as $$
  select g.id, g.name,
    case when g.config->'shareHistory' = 'false'::jsonb then
      jsonb_build_object('sessions', '[]'::jsonb, 'yearly', '[]'::jsonb,
        'monthly', '[]'::jsonb, 'roster', '[]'::jsonb, 'aliases', '{}'::jsonb,
        'plan', g.data->'plan')
    else g.data end,
    g.live, g.updated_at
  from public.groups g where g.slug = p_slug limit 1;
$$;
revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

-- Versioned signature keeps older clients compatible. Only public settings are returned.
create or replace function public.public_group_v2(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz, config jsonb)
language sql security definer stable set search_path = public
as $$
  select p.id, p.name, p.data, p.live, p.updated_at,
    jsonb_build_object('shareHistory', coalesce(g.config->'shareHistory', 'true'::jsonb),
      'chipsPerShekel', coalesce(g.config->'chipsPerShekel', '2'::jsonb))
  from public.public_group(p_slug) p join public.groups g on g.id = p.id;
$$;
revoke all on function public.public_group_v2(text) from public, anon;
grant execute on function public.public_group_v2(text) to authenticated;
notify pgrst, 'reload schema';
commit;
