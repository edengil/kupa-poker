-- ============================================================================
-- להריץ את כל הקובץ פעם אחת בעורך ה־SQL של Supabase (הרצה חוזרת בטוחה).
-- מה זה מתקן: (1) סימון תשלום מהלינק הציבורי שוב נשמר גם כשהחלוקה השתנתה
-- מאז הסימון האחרון — השרת מזהה את התוכנית המוקרנת של הצופה מול התוכנית
-- הגולמית השמורה; (2) סימון ציבורי כבר לא מוחק את סימון הקופה (potPaid)
-- ומפתחות עתידיים ב־payments — הפונקציה ממזגת לתוך האובייקט הקיים במקום
-- לבנות אותו מחדש מארבעה מפתחות.
-- ============================================================================

begin;

-- Public marking must work against the raw stored plan even when the viewer
-- only holds its projection (pot/residual rows stripped for privacy), and a
-- mark must never drop extra keys (potPaid, future keys) from payments.
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
  j integer;
  sid text;
  payments jsonb;
  stored_plan text;
  plan_arr jsonb;
  projected jsonb;
  incoming jsonb;
  elem jsonb;
  proj_pos integer;
  mark_index integer;
  plan_to_store text;
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
      stored_plan := payments->>'plan';
      mark_index := p_index;
      plan_to_store := p_fingerprint;
      if stored_plan is not null and stored_plan is distinct from p_fingerprint then
        -- The public client holds the projection of the stored plan (admin
        -- rows stripped) and sends it as the fingerprint. If it matches the
        -- stored plan's projection semantically, translate the index into
        -- raw-plan coordinates and keep the raw string stored.
        begin
          plan_arr := stored_plan::jsonb;
          incoming := p_fingerprint::jsonb;
        exception when others then
          raise exception 'fingerprint mismatch';
        end;
        if jsonb_typeof(plan_arr) is distinct from 'array' then
          raise exception 'fingerprint mismatch';
        end if;
        projected := '[]'::jsonb;
        proj_pos := -1;
        mark_index := null;
        for j in 0 .. jsonb_array_length(plan_arr) - 1 loop
          elem := plan_arr->j;
          if coalesce(elem->>'pot', 'false') = 'true'
             or coalesce(elem->>'residual', 'false') = 'true' then
            continue;
          end if;
          proj_pos := proj_pos + 1;
          projected := projected || jsonb_build_array(elem);
          if proj_pos = p_index then
            mark_index := j;
          end if;
        end loop;
        if incoming is distinct from projected then
          raise exception 'fingerprint mismatch';
        end if;
        if mark_index is null then
          raise exception 'invalid index';
        end if;
        plan_to_store := stored_plan;
      end if;
      side_map := coalesce(payments->p_field, '{}'::jsonb);
      side_map := jsonb_set(side_map, array[mark_index::text], to_jsonb(p_paid), true);
      conf := coalesce(payments->'confirmations', '[]'::jsonb);
      if p_paid is true and coalesce(btrim(p_by), '') <> '' then
        conf := conf || jsonb_build_array(jsonb_build_object(
          'index', mark_index,
          'action', p_field,
          'by', btrim(p_by),
          'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ));
      end if;
      -- Conservative merge: update only the three marking keys inside the
      -- stored payments object — potPaid and any future keys survive.
      payments := jsonb_set(payments, '{plan}', to_jsonb(plan_to_store), true);
      payments := jsonb_set(payments, array[p_field], side_map, true);
      payments := jsonb_set(payments, '{confirmations}', conf, true);
      sess := jsonb_set(sess, '{payments}', payments, true);
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
