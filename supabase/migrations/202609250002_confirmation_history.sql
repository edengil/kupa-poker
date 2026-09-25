begin;

-- Confirmation history lives on the same payments object.
-- p_by records who performed the action. Older marks stay closed without a name.

drop function if exists public.mark_group_payment(text, text, text, integer, boolean, text);
drop function if exists public.mark_group_payment(text, text, text, integer, boolean, text, text);

create function public.mark_group_payment(
  p_slug text,
  p_session_id text,
  p_fingerprint text,
  p_index integer,
  p_paid boolean,
  p_field text default 'paid',
  p_by text default null
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
  side_map jsonb;
  conf jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
begin
  if p_slug is null or p_session_id is null or p_fingerprint is null or p_index is null then
    raise exception 'missing arguments';
  end if;
  if p_index < 0 then
    raise exception 'invalid index';
  end if;
  if p_field is distinct from 'paid' and p_field is distinct from 'received' then
    raise exception 'invalid field';
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
        raise exception 'fingerprint mismatch';
      end if;
      side_map := coalesce(payments->p_field, '{}'::jsonb);
      side_map := jsonb_set(side_map, array[p_index::text], to_jsonb(p_paid), true);
      conf := coalesce(payments->'confirmations', '[]'::jsonb);
      if p_paid is true and coalesce(btrim(p_by), '') <> '' then
        conf := conf || jsonb_build_array(jsonb_build_object(
          'index', p_index,
          'action', p_field,
          'by', btrim(p_by),
          'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ));
      end if;
      sess := jsonb_set(
        sess,
        '{payments}',
        jsonb_build_object(
          'plan', p_fingerprint,
          'paid', case when p_field = 'paid' then side_map else coalesce(payments->'paid', '{}'::jsonb) end,
          'received', case when p_field = 'received' then side_map else coalesce(payments->'received', '{}'::jsonb) end,
          'confirmations', conf
        ),
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

revoke all on function public.mark_group_payment(text, text, text, integer, boolean, text, text) from public, anon;
grant execute on function public.mark_group_payment(text, text, text, integer, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
