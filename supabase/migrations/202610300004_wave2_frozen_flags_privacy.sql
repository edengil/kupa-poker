-- ============================================================================
-- גל 2 — הסרת סימוני ההקפאה frozenReal/frozenAuto מ־manualSettlement בהקרנת
-- הצופה בצד השרת: גל 2א הוסיף לאפליקציה את סימוני ההקפאה frozenReal
-- (הקפאה על חלוקה אמיתית) ו־frozenAuto (מפה אוטומטית) על manualSettlement,
-- וההקרנה בצד האפליקציה (sessionForViewer) מסירה אותם יחד עם frozenActual.
-- בצד ה־SQL, project_session_for_viewer מסיר את frozenActual בלבד — שני
-- הסימונים החדשים עדיין עברו לצופה דרך הנתיבים שמחזירים filter_shared_group_data
-- (public_group, תגובות mark_group_payment ו־vote_player_of_night).
--
-- המיגרציה הזו מגדירה מחדש את filter_shared_group_data בגוף זהה ל־202610300001,
-- בתוספת ההסרות בלבד: בכל ערב מוקרן יוצאים מ־manualSettlement גם frozenReal
-- ו־frozenAuto (ו־frozenActual נכלל שוב באותה רשימה, למקרה שהקרנת הערב
-- תשתנה). מפת החוסר הקפואה עצמה נשארת — היא נדרשת כדי שהצופה יחשב אותם
-- סכומי שחקנים כמו המנהל, ואין בה סכום קופה. האחסון הגולמי לא משתנה.
--
-- תוספת הכרחית מאותה משפחה: public_group לא עובר דרך filter_shared_group_data
-- כלל — הוא מקרין כל ערב ישירות דרך project_session_for_viewer (שני מצבי
-- השיתוף). לכן אותה הסרה מתווספת גם שם, בגוף זהה ל־202610300002 בתוספת
-- שני המפתחות בשורת ה־manualSettlement הקיימת (שם כבר מוסר frozenActual).
-- project_session_for_viewer הוא צוואר־הבקבוק היחיד של כל נתיבי הצופה:
-- public_group, ו־filter_shared_group_data (וממנו mark_group_payment
-- ו־vote_player_of_night) — כך שתי ההגדרות יחד סוגרות כל נתיב.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- הקרנת ערב בודד לצופה — גוף זהה ל־202610300002, בתוספת frozenReal
-- ו־frozenAuto לרשימת ההסרה מ־manualSettlement (frozenActual כבר שם).
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
    out := jsonb_set(out, '{manualSettlement}', (out->'manualSettlement') - 'frozenActual' - 'frozenReal' - 'frozenAuto', true);
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
-- filter_shared_group_data — גוף זהה ל־202610300001, בתוספת הסרת סימוני
-- ההקפאה (frozenReal/frozenAuto/frozenActual) מ־manualSettlement של כל
-- ערב מוקרן, בשני מצבי השיתוף.
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
    -- גל 2: גם סימוני ההקפאה יוצאים מ־manualSettlement של הערב המוקרן
    if last_sess is not null and jsonb_typeof(last_sess->'manualSettlement') = 'object' then
      last_sess := jsonb_set(last_sess, '{manualSettlement}',
        (last_sess->'manualSettlement') - 'frozenReal' - 'frozenAuto' - 'frozenActual', true);
    end if;
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
  -- גל 2: גם סימוני ההקפאה יוצאים מ־manualSettlement של כל ערב מוקרן
  select coalesce(jsonb_agg(
      case when jsonb_typeof(elem->'manualSettlement') = 'object'
        then jsonb_set(elem, '{manualSettlement}',
               (elem->'manualSettlement') - 'frozenReal' - 'frozenAuto' - 'frozenActual', true)
        else elem
      end order by ord), '[]'::jsonb)
    into projected
    from jsonb_array_elements(projected) with ordinality as t(elem, ord);
  return (p_data - 'savingsPot' - 'savingsWithdrawals')
    || jsonb_build_object('sessions', projected);
end;
$$;

revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon;

commit;
