begin;

-- Last session only when history is hidden (for settlement / payments on the table tab).
create or replace function public.public_group(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.name,
    case when g.config->'shareHistory' = 'false'::jsonb then
      jsonb_build_object(
        'sessions', coalesce((
          select jsonb_agg(sess)
          from (
            select elem as sess
            from jsonb_array_elements(coalesce(g.data->'sessions', '[]'::jsonb)) elem
            order by coalesce((elem->>'endedAt')::numeric, 0) desc,
                     coalesce(elem->>'iso', '') desc
            limit 1
          ) last_sess
        ), '[]'::jsonb),
        'yearly', '[]'::jsonb,
        'monthly', '[]'::jsonb,
        'roster', '[]'::jsonb,
        'aliases', coalesce(g.data->'aliases', '{}'::jsonb),
        'plan', g.data->'plan'
      )
    else g.data end,
    g.live, g.updated_at
  from public.groups g
  where g.slug = p_slug
  limit 1;
$$;

revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

create or replace function public.public_group_v2(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz, config jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.data, p.live, p.updated_at,
    jsonb_build_object(
      'shareHistory', coalesce(g.config->'shareHistory', 'true'::jsonb),
      'chipsPerShekel', coalesce(g.config->'chipsPerShekel', '2'::jsonb)
    )
  from public.public_group(p_slug) p
  join public.groups g on g.id = p.id;
$$;

revoke all on function public.public_group_v2(text) from public, anon;
grant execute on function public.public_group_v2(text) to authenticated;

-- Viewers mark a settlement transfer paid/unpaid without full group write access.
create or replace function public.mark_group_payment(
  p_slug text,
  p_session_id text,
  p_fingerprint text,
  p_index integer,
  p_paid boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  sessions jsonb;
  sess jsonb;
  i integer;
  sid text;
  payments jsonb;
  paid_map jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
begin
  if p_slug is null or p_session_id is null or p_fingerprint is null or p_index is null then
    raise exception 'missing arguments';
  end if;
  if p_index < 0 then
    raise exception 'invalid index';
  end if;

  select * into g from public.groups where slug = p_slug for update;
  if not found then
    raise exception 'group not found';
  end if;

  sessions := coalesce(g.data->'sessions', '[]'::jsonb);

  for i in 0 .. jsonb_array_length(sessions) - 1 loop
    sess := sessions->i;
    sid := sess->>'id';
    if sid = p_session_id then
      session_found := true;
      payments := coalesce(sess->'payments', '{}'::jsonb);
      if payments ? 'plan' and payments->>'plan' is distinct from p_fingerprint then
        /* חלוקה השתנתה — הלקוח צריך לרענן */
        raise exception 'fingerprint mismatch';
      end if;
      paid_map := coalesce(payments->'paid', '{}'::jsonb);
      paid_map := jsonb_set(paid_map, array[p_index::text], to_jsonb(p_paid), true);
      sess := jsonb_set(
        sess,
        '{payments}',
        jsonb_build_object('plan', p_fingerprint, 'paid', paid_map),
        true
      );
    end if;
    out_sessions := out_sessions || jsonb_build_array(sess);
  end loop;

  if not session_found then
    raise exception 'session not found';
  end if;

  update public.groups
  set data = jsonb_set(coalesce(g.data, '{}'::jsonb), '{sessions}', out_sessions, true),
      updated_at = now()
  where id = g.id
  returning data into g.data;

  return g.data;
end;
$$;

revoke all on function public.mark_group_payment(text, text, text, integer, boolean) from public, anon;
grant execute on function public.mark_group_payment(text, text, text, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
