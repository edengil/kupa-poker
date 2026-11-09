-- ============================================================================
-- גל 7, פריט 7.3 — הקרנת צופה אחת בצד ה־SQL.
--
-- עד היום חיו שתי רשימות הסרה: אחת ב־JS (publicShare.js) ואחת כאן.
-- מהמיגרציה הזו יש רשימה אחת מוצהרת — ב־lib/viewerProjection.js — וצד
-- ה־SQL כאן מיישם אותה בדיוק, ושני הצדדים נבדקים זה מול זה בבדיקת
-- ההשוואה (test/wave7ViewerProjection.test.js, PGlite, שרשרת מלאה).
--
-- מה משתנה בפועל מול 202610300004 (הגופים העדכניים):
--  1. filter_shared_group_data: ההסרה הכפולה של סימוני ההקפאה
--     (frozenActual/frozenReal/frozenAuto) — גם בתוך project_session
--     וגם אינליין מעל התוצאה — מאוחדת להסרה אחת, בתוך
--     project_session_for_viewer בלבד. filter קורא ל־project לכל ערב
--     ולא מוסיף הסרות משלו.
--  2. ענף ה־shareHistory=false: אין כאן חידוש בנתיב הזה — הענף כבר
--     עבר דרך project_session_for_viewer עוד ב־202610300004
--     (שורות 80–85), ולכן הסרת ה־sid חלה בו כבר אז. החידוש הוא
--     הסרת הסרת־ההקפאה הכפולה (סעיף 1) ואיחוד רשימת־ההסרה במקום
--     אחד: filter לא מוסיף הסרות משלו מעל project.
--
-- כלל potPaid האחיד והמוצהר: potPaid נשמר באחסון תמיד (סימון ציבורי
-- לא מוחק אותו — mark_group_payment במיזוג השמרני), ומוסר מכל הקרנת
-- צופה: project_payments_for_viewer מסיר אותו מה־payments של כל ערב,
-- וענף ה־live של public_group מסיר אותו מהלייב. שום נתיב צופה לא
-- מחזיר potPaid.
--
-- גופי project_session_for_viewer ו־project_payments_for_viewer לא
-- משתנים כאן — הם כבר מיישמים את הרשימה האחת. רק filter מוגדר מחדש.
-- האחסון הגולמי לא משתנה; זו הקרנה בלבד.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- filter_shared_group_data — גוף נקי מעל project_session_for_viewer:
-- אין הסרות אינליין משלו. shareHistory=false: אותו ערב־אחרון לפי
-- (endedAt, iso) יורד — כמו 202610300004 — אבל מוקרן דרך project,
-- ולכן גם בלי sid, בדיוק כמו צד ה־JS.
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

revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon, authenticated, service_role;

commit;
