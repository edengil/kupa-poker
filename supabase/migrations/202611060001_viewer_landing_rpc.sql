-- נחיתת צופה מהשורש: הקבוצה האחרונה שהמשתמש המחובר צפה בה.
--
-- רקע: האפליקציה המותקנת (מסך הבית) נפתחת תמיד בשורש "/" (start_url
-- במניפסט), והשורש הוא מסך הבעלים. שחקן שצופה בקבוצה דרך הלינק /g/<slug>
-- לא בעלים של שום קבוצה, ולכן הנחיתה בשורש יצרה לו בשקט קבוצה חדשה
-- וריקה והציגה לו מסך מנהלים בלי נתונים.
--
-- הפונקציה מחזירה את ה־slug (והשם) של הקבוצה מהצפייה האחרונה של המשתמש
-- ב־group_views, כדי שהשורש ינתב אותו למשטח הצפייה של אותה קבוצה במקום
-- ליצור קבוצה. ה־slug נשלף דרך group_id, כך שהחלפת לינק (סיבוב slug)
-- לא שוברת את הניתוב.
--
-- אבטחה: security definer שמסנן לפי auth.uid() של הקורא בלבד — משתמש רואה
-- רק קבוצות שהוא עצמו כבר צפה בהן (וה־slug שלהן כבר היה בידיו מהלינק).
-- שום שורת groups גולמית לא נחשפת: רק slug + name של קבוצה אחת.

create or replace function public.my_last_viewed_group()
returns table (slug text, name text)
language sql
security definer
stable
set search_path = public
as $$
  select g.slug, g.name
  from public.group_views gv
  join public.groups g on g.id = gv.group_id
  where gv.user_id = auth.uid()
  order by gv.at desc, gv.id desc
  limit 1;
$$;

revoke all on function public.my_last_viewed_group() from public, anon;
grant execute on function public.my_last_viewed_group() to authenticated;
