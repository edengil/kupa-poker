-- ============================================================================
-- גל 3ב — הגנת גרסאות על כתיבות (ממצא ביקורת 9): עד היום כל הכותבים
-- (אפליקציה, בוט, ריצות תקופתיות) קראו → חישבו → כתבו את שורת הקבוצה בלי
-- שום תנאי, והאחרון שכתב דרס את כולם — כולל את מנגנון הדדופ של הבוט
-- (applied בלייב) ואת סימוני התשלום הטריים מה־RPC. הטריגר groups_touch
-- כבר מעדכן את updated_at בכל כתיבה; הפונקציה הזו הופכת אותו לתנאי:
-- כתיבה מתקבלת רק אם updated_at עדיין שווה לערך שהכותב קרא, והכותב
-- מקבל בחזרה את updated_at החדש — או null כשיש התנגשות (שורה זזה
-- מאז הקריאה / השורה לא שייכת למתקשר לפי RLS / לא קיימת).
--
-- security invoker בכוונה: ה־UPDATE כפוף ל־RLS של המתקשר בדיוק כמו
-- כתיבת טבלה ישירה — הבעלים כותב את השורה שלו, צופה לא כותב כלום,
-- ו־service_role (הבוט והריצות) עוקף כרגיל. זהו אותו דפוס אטומי כמו
-- mark_group_payment, רק גנרי לכל עמודות הבלוב (data/config/live).
--
-- p_patch: אובייקט עם תת־קבוצה של המפתחות data/config/live. מפתח חסר =
-- העמודה לא נגעת. ערך null ב־JSON עבור live = ניקוי העמודה (סוף משחק);
-- עבור data/config (עמודות NOT NULL) ערך null מתפרש כ־{} (ברירת המחדל).
-- ============================================================================

begin;

create or replace function public.write_group_cas(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_updated_at timestamptz;
begin
  if p_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return null;
  end if;

  update public.groups g set
    data = case
      when p_patch ? 'data' then
        case when p_patch->'data' = 'null'::jsonb then '{}'::jsonb else p_patch->'data' end
      else g.data end,
    config = case
      when p_patch ? 'config' then
        case when p_patch->'config' = 'null'::jsonb then '{}'::jsonb else p_patch->'config' end
      else g.config end,
    live = case
      when p_patch ? 'live' then
        case when p_patch->'live' = 'null'::jsonb then null else p_patch->'live' end
      else g.live end
  where g.id = p_id
    and (p_expected_updated_at is null or g.updated_at = p_expected_updated_at)
  returning g.updated_at into new_updated_at;

  return new_updated_at;
end;
$$;

revoke all on function public.write_group_cas(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.write_group_cas(uuid, timestamptz, jsonb) to authenticated, service_role;

commit;
