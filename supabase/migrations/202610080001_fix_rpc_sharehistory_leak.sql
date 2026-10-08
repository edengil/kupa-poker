-- תיקון אבטחה: RPCs ציבוריים החזירו את ה-blob המלא ועקפו את shareHistory=false.
-- מעכשיו התשובה מסוננת בדיוק כמו public_group.

-- פונקציית עזר: מסננת נתוני קבוצה לפי config.shareHistory
create or replace function public.filter_shared_group_data(p_data jsonb, p_config jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p_config->'shareHistory' = 'false'::jsonb then
    jsonb_build_object(
      'sessions', coalesce((
        select jsonb_agg(sess)
        from (
          select elem as sess
          from jsonb_array_elements(coalesce(p_data->'sessions', '[]'::jsonb)) elem
          order by coalesce((elem->>'endedAt')::numeric, 0) desc,
                   coalesce(elem->>'iso', '') desc
          limit 1
        ) last_sess
      ), '[]'::jsonb),
      'yearly', '[]'::jsonb,
      'monthly', '[]'::jsonb,
      'roster', '[]'::jsonb,
      'aliases', coalesce(p_data->'aliases', '{}'::jsonb),
      'plan', p_data->'plan'
    )
  else p_data end;
$$;

-- mark_group_payment: להחזיר נתונים מסוננים במקום ה-blob המלא
-- (הלוגיקה הפנימית זהה ל-schema.sql, רק ה-return משתנה)
create or replace function public.mark_group_payment(
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
  paid_map jsonb;
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
      if p_field is distinct from 'paid' and p_field is distinct from 'received' then
        raise exception 'invalid field';
      end if;
      paid_map := coalesce(payments->p_field, '{}'::jsonb);
      paid_map := jsonb_set(paid_map, array[p_index::text], to_jsonb(p_paid), true);
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
          'paid', case when p_field = 'paid' then paid_map else coalesce(payments->'paid', '{}'::jsonb) end,
          'received', case when p_field = 'received' then paid_map else coalesce(payments->'received', '{}'::jsonb) end,
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
  returning data, config into g.data, g.config;

  -- תיקון אבטחה: להחזיר מסונן, לא את ה-blob המלא
  return public.filter_shared_group_data(g.data, g.config);
end;
$$;

revoke all on function public.mark_group_payment(text, text, text, integer, boolean, text, text) from public, anon;
grant execute on function public.mark_group_payment(text, text, text, integer, boolean, text, text) to authenticated;
revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon;

-- vote_player_of_night: אותו תיקון — להחזיר מסונן
create or replace function public.vote_player_of_night(
  p_slug text,
  p_session_id text,
  p_candidate text,
  p_voter text
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
  votes jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
  candidate_ok boolean := false;
  e jsonb;
begin
  if p_slug is null or p_session_id is null
     or coalesce(btrim(p_candidate), '') = ''
     or coalesce(btrim(p_voter), '') = '' then
    raise exception 'missing arguments';
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
      candidate_ok := false;
      for e in select value from jsonb_array_elements(coalesce(sess->'entries', '[]'::jsonb)) loop
        if e->>'name' = btrim(p_candidate) then
          candidate_ok := true;
        end if;
      end loop;
      if not candidate_ok then
        raise exception 'candidate not in session';
      end if;
      votes := coalesce(sess->'playerOfNightVotes', '{}'::jsonb);
      votes := jsonb_set(votes, array[btrim(p_voter)], to_jsonb(btrim(p_candidate)), true);
      sess := jsonb_set(sess, '{playerOfNightVotes}', votes, true);
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
  returning data, config into g.data, g.config;

  -- תיקון אבטחה: להחזיר מסונן, לא את ה-blob המלא
  return public.filter_shared_group_data(g.data, g.config);
end;
$$;

revoke all on function public.vote_player_of_night(text, text, text, text) from public, anon;
grant execute on function public.vote_player_of_night(text, text, text, text) to authenticated;
