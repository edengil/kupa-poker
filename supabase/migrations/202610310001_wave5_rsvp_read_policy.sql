-- גל 5 — יישור מדיניות הקריאה של game_rsvps לקוד (ממצא ביקורת 25).
--
-- מיגרציה 202610080002 סגרה דליפה אמיתית: עד אליה כל משתמש מחובר קרא
-- את אישורי ההגעה של כל הקבוצות, כולל כתובות מייל. השער שהיא הציבה
-- ("רק מי שביקר בקבוצה") הוא ההגנה הנכונה מול זרים — אבל הוא חוסם
-- שני קוראים לגיטימיים שהקוד נשען עליהם:
--   1. בעל הקבוצה קורא את הרשימה מאפליקציית המנהל (RsvpList), בלי
--      לעבור בלינק הציבורי — אין לו שורת group_views, והרשימה שלו
--      חזרה ריקה תמיד.
--   2. המצביע עצמו: אם רישום הביקור (logView) נכשל בשקט — ההצבעה
--      נכתבת, אבל בעליה לא רואה אותה חזרה והכרטיס נראה שבור.
--
-- המדיניות הסופית מרכיבה את שלושת הדפוסים הקיימים בסכמה:
--   * בעל הקבוצה — כמו "owner reads views" על group_views;
--   * מי שביקר בקבוצה — שער 202610080002, נשאר כמות שהוא;
--   * השורה של המשתמש עצמו — כמו "viewer reads own views".
-- זר בלי שום קשר לקבוצה עדיין לא קורא כלום.

drop policy if exists "rsvp read" on public.game_rsvps;

create policy "rsvp read"
  on public.game_rsvps for select
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = game_rsvps.group_id
        and g.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.group_views gv
      where gv.group_id = game_rsvps.group_id
        and gv.user_id = auth.uid()
    )
    or auth.uid() = user_id
  );
