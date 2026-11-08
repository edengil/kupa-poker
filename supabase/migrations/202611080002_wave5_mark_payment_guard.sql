-- ---------------------------------------------------------------------------
-- גל 5 (תוכנית מקיפה — ממצאים 32+33) — הידוק mark_group_payment:
--
-- • 5.4 (ממצא 33): ‏p_by חייב להיות צד להעברה המסומנת — ה־from או ה־to
--   שלה באינדקס הנתון (בקואורדינטות התוכנית הגולמית, אחרי תרגום
--   ההקרנה), בן/בת זוגם, או בעלי הקבוצה (auth.uid() = owner_id). אחרת
--   הקריאה נדחית ב־raise לפני כל כתיבה: בלי אירוע confirmation ובלי
--   שינוי במפות הסימון. עד היום כל משתמש מחובר יכול היה לזייף אישור
--   בשם כל שחקן. רשימת הזוגות זהה ל־FILL_COUPLES ב־lib/poker/
--   coupleFills.js (מקור האמת בצד הלקוח); בדיקות ה־PGlite של הגל
--   נגזרות מהקבוע ההוא, כך שסחף בין הרשימות ייכשל בבדיקות.
--   ‏p_by ריק/null נשאר כמו שהיה: סימון בלי טענת זהות, בלי אירוע.
--
-- • 5.3 (ממצא 32): אידמפוטנטיות של אירוע ה־confirmation — ‏retry של
--   אותה קריאה (אותו session+index+action+by, כשהדגל כבר true והאירוע
--   האחרון לאותו ציר הוא מאותו by) לא מוסיף אירוע שני. סימון חדש,
--   סימון חוזר אחרי ביטול, או מאשר אחר — כן מוסיפים.
--
-- החתימה וההתנהגות לקריאות לגיטימיות זהות לגרסה הקודמת
-- (202610300001); ה־grant נשאר מפורש ל־authenticated בלבד.
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
  k integer;
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
  actor text;
  is_owner boolean;
  mark_elem jsonb;
  mark_from text;
  mark_to text;
  side_was boolean;
  last_by text;
  ev jsonb;
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

  actor := nullif(btrim(coalesce(p_by, '')), '');
  -- coalesce חובה: auth.uid() יכול להיות null, ואז ההשוואה כולה null
  -- ו־not is_owner היה מדלג על האימות במקום להפעיל אותו.
  is_owner := coalesce(g.owner_id is not null and auth.uid() = g.owner_id, false);

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
      -- גל 5, פריט 5.4: טענת זהות (p_by) חייבת להיות צד להעברה — אחרת
      -- דחייה לפני כל כתיבה. ההשוואה מול התוכנית הגולמית שב־
      -- plan_to_store, באינדקס המתורגם mark_index.
      if actor is not null and not is_owner then
        begin
          mark_elem := (plan_to_store::jsonb) -> mark_index;
        exception when others then
          raise exception 'fingerprint mismatch';
        end;
        mark_from := mark_elem ->> 'from';
        mark_to := mark_elem ->> 'to';
        if actor is distinct from mark_from
           and actor is distinct from mark_to
           and not exists (
             select 1
             from (values
               ('עדן גיל', 'אורן גיל'),
               ('דור לירז', 'עדן לירז'),
               ('שגיא גיל', 'דוד בני גיל'),
               ('אופיר סנה', 'נתנאל כהן'),
               ('איציק תפילין', 'ירדן תפילין')
             ) as couple(a, b)
             where (couple.a = actor and (couple.b = mark_from or couple.b = mark_to))
                or (couple.b = actor and (couple.a = mark_from or couple.a = mark_to))
           ) then
          raise exception 'marker is not a party to this transfer';
        end if;
      end if;
      side_map := coalesce(payments->p_field, '{}'::jsonb);
      side_was := coalesce(side_map ->> mark_index::text, 'false') = 'true';
      side_map := jsonb_set(side_map, array[mark_index::text], to_jsonb(p_paid), true);
      conf := coalesce(payments->'confirmations', '[]'::jsonb);
      if p_paid is true and coalesce(btrim(p_by), '') <> '' then
        -- גל 5, פריט 5.3: ‏retry של אותה קריאה לא מכפיל את האירוע —
        -- הדגל כבר true והאירוע האחרון לאותו (index, action) הוא
        -- מאותו by. כל מקרה אחר (סימון ראשון, חזרה אחרי ביטול,
        -- מאשר אחר) מוסיף אירוע כרגיל.
        last_by := null;
        for k in 0 .. jsonb_array_length(conf) - 1 loop
          ev := conf -> k;
          if (case when (ev ->> 'index') ~ '^-?[0-9]+$' then (ev ->> 'index')::integer end) = mark_index
             and (ev ->> 'action') = p_field then
            last_by := ev ->> 'by';
          end if;
        end loop;
        if not (side_was and last_by is not distinct from actor) then
          conf := conf || jsonb_build_array(jsonb_build_object(
            'index', mark_index,
            'action', p_field,
            'by', btrim(p_by),
            'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ));
        end if;
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
