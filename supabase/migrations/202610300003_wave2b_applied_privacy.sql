-- ============================================================================
-- גל 2ב סבב 5 — הסרת applied מהקרנת הלייב לצופה: מפת applied של הלייב היא
-- יומן הביטולים הפנימי של הבוט — רשומה לכל הודעת וואטסאפ שטופלה, ובתוכה
-- צילומי ev של החותמות שנושאים sid (מזהה הודעה חיצוני). גל 2ב (סבב 4) הסיר
-- את ה־sid מאירועי השחקנים ומהערבים השמורים, אבל ה־applied עצמו המשיך
-- לעבור לצופה בתוך אובייקט הלייב — ודרכו דלף ה־sid למכשירי צופים.
--
-- המיגרציה הזו מגדירה מחדש את public_group בגוף זהה ל־202610300002,
-- בתוספת הסרה אחת בלבד: applied יוצא מענף ה־live. שום הסרה אחרת לא
-- השתנתה. לצופה אין שום שימוש ב־applied; האחסון הגולמי לא משתנה והבוט
-- ממשיך לקרוא את ה־applied ממנו למסירות חוזרות. (ערבים שמורים לא נושאים
-- applied כלל — הם נבנים שדה־אחר־שדה ב־sessionFromLive ובשמירת הערב
-- באפליקציה — ולכן project_session_for_viewer לא מוגדר כאן מחדש.)
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- public_group — גוף זהה ל־202610300002, בתוספת '- applied' בענף ה־live
-- (בשני תתי־הענפים: עם מערך שחקנים ובלעדיו).
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
                      - 'potDraft' - 'frozenActual' - 'potPaid' - 'coupleFills'
                      - 'applied',
               '{players}',
               public.strip_buyin_event_sids(g.live->'players'),
               true)
           else g.live - 'savingsPot' - 'savingsPotActual' - 'savingsWithdrawals'
                      - 'potDraft' - 'frozenActual' - 'potPaid' - 'coupleFills'
                      - 'applied' end
         end,
    g.updated_at
  from public.groups g where g.slug = p_slug limit 1;
$$;

revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

commit;
