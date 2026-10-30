-- ============================================================================
-- גל 1 — פרטיות קופה (ביקורת 30.10, ממצא 1): סוגר את שלושת נתיבי הדליפה
-- לצופים. שינוי הקרנה/תגובה בלבד — הנתונים השמורים לא משתנים, והבעלים/מנהל
-- (קריאה ישירה לטבלה ב־RLS) ממשיך לראות הכול.
--
-- (א) mark_group_payment של 202610250001 החזיר את ה־blob הגולמי ודרס את
--     הסינון של 202610080001. כאן: אותה לוגיקה בדיוק (הקרנת תוכנית +
--     מיזוג שמרני, potPaid שורד באחסון), אבל התגובה עוברת דרך
--     filter_shared_group_data המחוזק.
-- (ב) public_group של 202610190001 הסיר רק חלק משדות הקופה (savingsPotActual,
--     שורת הקופה בתוך payments.plan, potPaid, coupleFills דלפו), ובמצב
--     shareHistory=false החזיר sessions ריק במקום ערב אחרון מסונן.
--     כאן: הגדרה אחת מלאה, תואמת את schema.sql ואת הקרנת הלקוח.
-- (ג) vote_player_of_night בשרשרת כבר מחזיר דרך filter_shared_group_data
--     (202610080001) — לא מוגדר מחדש; הוא מרוויח מהחיזוק אוטומטית.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- הקרנת payments לצופה — מראה SQL של projectPaymentsForViewer בלקוח:
-- שורת הקופה/השיורת יוצאת ממחרוזת התוכנית, והסימונים (paid/received) ואירועי
-- האישור ממופים מחדש לקואורדינטות המוקרנות, כדי שהתוכנית והסימונים לא
-- יסתלקו זה מזה. potPaid (סימון הקופה של המנהל) מוסר תמיד מהתגובה לצופה —
-- באחסון הוא נשמר כרגיל. כשאין שורת קופה בתוכנית, ה־payments חוזר כמו
-- שהוא (מלבד potPaid).
-- ---------------------------------------------------------------------------
create or replace function public.project_payments_for_viewer(p_payments jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  plan_txt text;
  plan_arr jsonb;
  elem jsonb;
  i integer;
  kept jsonb := '[]'::jsonb;
  idx_map jsonb := '{}'::jsonb;
  has_pot boolean := false;
  out_payments jsonb;
  new_paid jsonb := '{}'::jsonb;
  new_received jsonb := '{}'::jsonb;
  new_conf jsonb := '[]'::jsonb;
  kv record;
  ev jsonb;
  new_idx text;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'object' then
    return p_payments;
  end if;
  out_payments := p_payments - 'potPaid';
  plan_txt := p_payments->>'plan';
  if plan_txt is null then
    return out_payments;
  end if;
  begin
    plan_arr := plan_txt::jsonb;
  exception when others then
    return out_payments;
  end;
  if jsonb_typeof(plan_arr) <> 'array' then
    return out_payments;
  end if;

  for i in 0 .. jsonb_array_length(plan_arr) - 1 loop
    elem := plan_arr->i;
    if coalesce(elem->>'pot', 'false') = 'true'
       or coalesce(elem->>'residual', 'false') = 'true' then
      has_pot := true;
    else
      idx_map := jsonb_set(idx_map, array[i::text], to_jsonb(jsonb_array_length(kept)), true);
      kept := kept || jsonb_build_array(elem);
    end if;
  end loop;

  if not has_pot then
    return out_payments;
  end if;

  for kv in select key, value from jsonb_each(coalesce(p_payments->'paid', '{}'::jsonb)) loop
    if kv.value = 'true'::jsonb and idx_map ? kv.key then
      new_paid := jsonb_set(new_paid, array[idx_map->>kv.key], 'true'::jsonb, true);
    end if;
  end loop;
  for kv in select key, value from jsonb_each(coalesce(p_payments->'received', '{}'::jsonb)) loop
    if kv.value = 'true'::jsonb and idx_map ? kv.key then
      new_received := jsonb_set(new_received, array[idx_map->>kv.key], 'true'::jsonb, true);
    end if;
  end loop;
  for ev in select value from jsonb_array_elements(coalesce(p_payments->'confirmations', '[]'::jsonb)) loop
    if jsonb_typeof(ev) <> 'object' then
      continue;
    end if;
    if coalesce(ev->>'pot', 'false') = 'true' then
      continue;
    end if;
    new_idx := idx_map->>(ev->>'index');
    if new_idx is null then
      continue;
    end if;
    new_conf := new_conf || jsonb_build_array(jsonb_set(ev, '{index}', to_jsonb(new_idx::integer), true));
  end loop;

  return jsonb_build_object(
    'plan', to_jsonb(kept::text),
    'paid', new_paid,
    'received', new_received,
    'confirmations', new_conf
  );
end;
$$;

revoke all on function public.project_payments_for_viewer(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- הקרנת ערב בודד לצופה: בלי שדות קופה, בלי coupleFills (מפת המילויים
-- הזוגיים היא נתון מנהל — "לא לחשוף בקבוצה"), בלי frozenActual שהוא סכום
-- ה«בפועל» עצמו. מפת החוסר הקפואה נשארת — היא נדרשת כדי שהצופה יחשב אותם
-- סכומי שחקנים כמו המנהל, ואין בה סכום קופה.
-- ---------------------------------------------------------------------------
create or replace function public.project_session_for_viewer(p_sess jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  out jsonb;
begin
  if p_sess is null or jsonb_typeof(p_sess) <> 'object' then
    return p_sess;
  end if;
  out := p_sess - 'savingsPot' - 'savingsPotActual' - 'coupleFills';
  if out ? 'manualSettlement' and jsonb_typeof(out->'manualSettlement') = 'object' then
    out := jsonb_set(out, '{manualSettlement}', (out->'manualSettlement') - 'frozenActual', true);
  end if;
  if out ? 'payments' then
    out := jsonb_set(out, '{payments}', public.project_payments_for_viewer(out->'payments'), true);
  end if;
  return out;
end;
$$;

revoke all on function public.project_session_for_viewer(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- filter_shared_group_data מחוזק: בנוסף לסינון shareHistory המקורי, כל ערב
-- עובר הקרנת קופה מלאה, והמפתחות המצטברים של הקופה יוצאים מהשורש.
-- במצב shareHistory=false — ערב אחרון מוקרן + כינויים (כמו schema.sql
-- והלקוח), לא sessions ריק.
-- ---------------------------------------------------------------------------
create or replace function public.filter_shared_group_data(p_data jsonb, p_config jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  sessions jsonb;
  projected jsonb;
  last_sess jsonb;
begin
  if p_data is null then
    return null;
  end if;
  sessions := coalesce(p_data->'sessions', '[]'::jsonb);
  if p_config->'shareHistory' = 'false'::jsonb then
    select public.project_session_for_viewer(elem)
      into last_sess
      from jsonb_array_elements(sessions) elem
      order by coalesce((elem->>'endedAt')::numeric, 0) desc,
               coalesce(elem->>'iso', '') desc
      limit 1;
    return jsonb_build_object(
      'sessions', case when last_sess is null then '[]'::jsonb
                       else jsonb_build_array(last_sess) end,
      'yearly', '[]'::jsonb,
      'monthly', '[]'::jsonb,
      'roster', '[]'::jsonb,
      'aliases', coalesce(p_data->'aliases', '{}'::jsonb),
      'plan', p_data->'plan'
    );
  end if;
  select coalesce(jsonb_agg(public.project_session_for_viewer(elem) order by ord), '[]'::jsonb)
    into projected
    from jsonb_array_elements(sessions) with ordinality as t(elem, ord);
  return (p_data - 'savingsPot' - 'savingsWithdrawals')
    || jsonb_build_object('sessions', projected);
end;
$$;

revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- public_group — הגדרה אחת: כל שדות הקופה יוצאים מהערבים ומהלייב בכל מצב
-- שיתוף; shareHistory=false מחזיר ערב אחרון מוקרן + כינויים.
-- ---------------------------------------------------------------------------
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
          select jsonb_agg(ps)
          from (
            select public.project_session_for_viewer(elem) as ps
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
    else
      (g.data - 'savingsPot' - 'savingsWithdrawals')
        || jsonb_build_object('sessions',
             coalesce(
               (select jsonb_agg(public.project_session_for_viewer(elem) order by ord)
                  from jsonb_array_elements(coalesce(g.data->'sessions', '[]'::jsonb))
                         with ordinality as t(elem, ord)),
               '[]'::jsonb))
    end,
    case when g.live is null then null
         else g.live - 'savingsPot' - 'savingsPotActual' - 'savingsWithdrawals'
                    - 'potDraft' - 'frozenActual' - 'potPaid' - 'coupleFills' end,
    g.updated_at
  from public.groups g where g.slug = p_slug limit 1;
$$;

revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_group_payment — גוף זהה ל־202610250001 (זיהוי הקרנת הצופה מול התוכנית
-- הגולמית, תרגום אינדקס, מיזוג שמרני ששומר potPaid ומפתחות עתידיים באחסון).
-- השינוי היחיד: התגובה חוזרת דרך filter_shared_group_data במקום ה־blob.
-- ---------------------------------------------------------------------------
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

  -- גל 1: התגובה לצופה מסוננת ומוקרנת־קופה, כמו public_group
  return public.filter_shared_group_data(g.data, g.config);
end;
$$;

revoke all on function public.mark_group_payment(text, text, text, integer, boolean, text, text) from public, anon;
grant execute on function public.mark_group_payment(text, text, text, integer, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
