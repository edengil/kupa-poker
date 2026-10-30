-- ============================================================================
-- גל 2ב — זהות חותמת יציבה בבוט (ממצאי ביקורת 4+6, סבב 4): כל חותמת קנייה
-- של הבוט נושאת מעכשיו sid — מזהה הודעת הוואטסאפ + אינדקס הפקודה — על
-- אירוע הקנייה עצמו (buyinEvents[].sid), כדי שביטול והחלה־מחדש יאתרו את
-- החותמת בדיוק גם אחרי שינוי שם וגם כששני אירועים חולקים צילום זהה.
--
-- ה־sid הוא מזהה של הודעה חיצונית — שדה פנימי של הבוט, לא נתון לצופה.
-- המיגרציה הזו מרחיבה את הקרנת הצופה של גל 1 (202610300001): אותו גוף
-- בדיוק של project_session_for_viewer ו־public_group, בתוספת הסרת ה־sid
-- מאירועי הקנייה של שחקני הלייב ושל שורות הערבים השמורים. שאר שדות
-- האירוע (amount/at/total/pot) כבר חשופים לצופה היום ונשארים. שינוי
-- הקרנה/תגובה בלבד — הנתונים השמורים לא משתנים, והבוט ממשיך לקרוא את
-- ה־sid מהאחסון הגולמי.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- עזר הקרנה: מערך שחקנים/שורות־ערב → אותו מערך כשמכל אירוע קנייה הוסר
-- מפתח ה־sid. שורות בלי buyinEvents ואירועים לא־אובייקטיים עוברים כמו שהם.
-- ---------------------------------------------------------------------------
create or replace function public.strip_buyin_event_sids(p_rows jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_rows is null or jsonb_typeof(p_rows) <> 'array' then p_rows
    else coalesce((
      select jsonb_agg(
        case when jsonb_typeof(elem) = 'object' and jsonb_typeof(elem->'buyinEvents') = 'array' then
          jsonb_set(elem, '{buyinEvents}', coalesce((
            select jsonb_agg(case when jsonb_typeof(ev) = 'object' then ev - 'sid' else ev end order by eord)
            from jsonb_array_elements(elem->'buyinEvents') with ordinality as t(ev, eord)
          ), '[]'::jsonb), true)
        else elem end
        order by ord)
      from jsonb_array_elements(p_rows) with ordinality as t(elem, ord)
    ), '[]'::jsonb)
  end;
$$;

revoke all on function public.strip_buyin_event_sids(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- הקרנת ערב בודד לצופה — גוף זהה ל־202610300001, בתוספת הסרת sid מאירועי
-- הקנייה של שורות הערב (entries).
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
  if out ? 'entries' and jsonb_typeof(out->'entries') = 'array' then
    out := jsonb_set(out, '{entries}', public.strip_buyin_event_sids(out->'entries'), true);
  end if;
  return out;
end;
$$;

revoke all on function public.project_session_for_viewer(jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- public_group — גוף זהה ל־202610300001, בתוספת הסרת sid מאירועי הקנייה
-- של שחקני הלייב. (public_group_v2 עוטף את public_group ומרוויח אוטומטית;
-- filter_shared_group_data ו־mark_group_payment מרוויחים מהגדרת
-- project_session_for_viewer החדשה.)
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
         else
           case when jsonb_typeof(g.live->'players') = 'array' then
             jsonb_set(
               g.live - 'savingsPot' - 'savingsPotActual' - 'savingsWithdrawals'
                      - 'potDraft' - 'frozenActual' - 'potPaid' - 'coupleFills',
               '{players}',
               public.strip_buyin_event_sids(g.live->'players'),
               true)
           else g.live - 'savingsPot' - 'savingsPotActual' - 'savingsWithdrawals'
                      - 'potDraft' - 'frozenActual' - 'potPaid' - 'coupleFills' end
         end,
    g.updated_at
  from public.groups g where g.slug = p_slug limit 1;
$$;

revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

commit;
