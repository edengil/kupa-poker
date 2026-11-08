# גיבוי ושחזור — קופת פוקר (גל 3, 8.11.2026)

## למה גיבוי אפליקטיבי (פסק שער 0.6)

עדן החליט: **אין PITR ואין שום גיבוי בתשלום.** נבדק מול תיעוד Supabase
(5.11.2026): בדרגה חינמית אין גיבויים אוטומטיים כלל; שחזור פלטפורמי
הוא תמיד פרויקט־שלם עם השבתה, ואין שחזור קבוצה־בודדת בשום דרגה.
הגיבוי היחיד הרלוונטי הוא לכן זה שבנינו כאן: צילומי שרת בתוך המסד
עצמו, ברמת קבוצה, בחינם.

שורת ה"לא נבדק" היחידה של השער: האם לפרויקט החי יש בכלל גיבוי
פלטפורמי פעיל — בודקים בדקה אחת ב־Supabase Dashboard ← Database ←
Backups (צמוד לביקור ה־Vercel של מסלול R). גם אם יתברר שיש, הוא לא
מחליף את הצילומים האלה (אין שחזור פר־קבוצה).

## מה קיים

- **טבלה:** `public.group_snapshots` — שורה לכל צילום: `group_id`
  (בלי FK עם cascade, בכוונה — הצילום חייב לשרוד את מחיקת הקבוצה),
  `owner_id`, `slug`, `name`, `reason`
  ‏('daily' | 'pre-delete' | 'manual'), שלושת הבלובים
  `data`/`config`/`live`, ו־`created_at`.
- **אבטחה:** RLS פעיל בלי שום מדיניות; `revoke all` מ־public/anon/
  authenticated; `grant all` ל־service_role בלבד. הבעלים עובד רק דרך
  פונקציות ה־definer, שבודקות בעלות בפנים.
- **פונקציות (security definer):**
  - `snapshot_group(p_group_id, p_reason)` → מזהה הצילום. זורקת על
    סיבה לא חוקית / קבוצה חסרה / בעלות זרה.
  - `delete_group_with_snapshot(p_group_id)` → מצלמת ('pre-delete')
    ואז מוחקת, באותה פונקציה. **אם הצילום נכשל, החריגה עוצרת לפני
    המחיקה והקבוצה נשארת.**
  - `restore_group_snapshot(p_snapshot_id, p_new_slug default null)`
    → בונה קבוצה **חדשה** מהצילום: אותו slug אם פנוי, אחרת סיומת
    אקראית של 6 תווי hex. מחזירה `(id, slug)`.
  - `list_group_snapshots(p_group_id)` → עד 20 צילומים אחרונים
    (מטא־נתונים בלבד) לבעלים.
- **נקודות צילום:** (1) יומי — הקרון היומי מריץ `runGroupSnapshots`
  ‏(lib/groupSnapshots.js) לכל קבוצה; (2) חובה לפני מחיקה — דרך
  `delete_group_with_snapshot` בלבד; (3) ידני — כפתור "צלם עכשיו"
  בכרטיס הגיבוי של הבעלים.
- **שמירה:** צילומים נגזמים אחרי 30 יום באותה ריצת קרון
  (`SNAPSHOT_RETENTION_DAYS`); diag_events נגזם אחרי 90 יום.
- **התראות:** כשל צילום/גיזום בריצת הקרון עובר ל־`reportError`
  ‏(מייל התראה למנהל + לוג) ומופיע בשדה `backups` בתשובת הקרון.
  צילום ידני שנכשל מציג שגיאה בכרטיס. אין כשל שקט.

## נוהל שחזור (מבוצע בתרגיל, test/wave3BackupSql.test.js)

1. **מהממשק:** כרטיס "גיבוי וייצוא" ← מקטע "צילומי גיבוי בשרת" ←
   בשורת הצילום הרצוי: "שחזר כקבוצה חדשה". הקבוצה החדשה מופיעה
   ברשימת הקבוצות של הבעלים בקישור `/g/<slug>`.
2. **מ־SQL (חלופה):**
   ```sql
   select * from public.list_group_snapshots('<group_id>');
   select * from public.restore_group_snapshot('<snapshot_id>');
   ```
3. **אימות אחרי שחזור:** פותחים את הקבוצה המשוחזרת ומשווים: רשימת
   הערבים, ההגדרות (config), והערב החי (אם היה). בתרגיל האוטומטי
   השוויון נבדק על שלושת הבלובים בדיוק (`toEqual` על data/config/live).
4. מחיקת המקור (אם עוד קיימת ורוצים להחליף) — רק אחרי האימות, ורק
   דרך `delete_group_with_snapshot`.

## מחיקת קבוצה — כלל ברזל

**אסור** למחוק שורת קבוצה ב־DELETE ישיר (לא מהקונסול ולא מסקריפט) —
רק דרך `delete_group_with_snapshot`, שמבטיח צילום 'pre-delete' קודם.
הצילום שורד את המחיקה וזמין לשחזור 30 יום.

## גיבוי ידני (קובץ)

כרטיס הגיבוי מייצא **גיבוי מלא**: `{format: "kupa-poker-full-backup",
db, config, live}` בקובץ `kupa-poker-full-<חותמת־זמן־מלאה>.json`
(אין יותר דריסת אותו־יום). הייבוא מאמת את שלושת הבלובים ומשחזר את
כולם; לפני ההחלפה יורד אוטומטית גיבוי מלא של המצב הנוכחי. קבצי
הגיבוי הישנים (db בלבד) עדיין נקראים ומחליפים רק את ה־db.

## שאילתות אימות אחרי הרצת המיגרציה (שלב שחרור)

```sql
-- הטבלה וה־RLS
select relrowsecurity from pg_class where oid = 'public.group_snapshots'::regclass; -- t
select count(*) from pg_policies where schemaname='public' and tablename='group_snapshots'; -- 0

-- האינדקס של 3.3
select indexdef from pg_indexes where indexname = 'group_views_user_recent_idx';

-- revoke מורחב (3.5): כל החמישה חייבים false ל־authenticated
select has_function_privilege('authenticated', oid, 'execute')
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('touch_updated_at','strip_buyin_event_sids',
    'project_payments_for_viewer','project_session_for_viewer',
    'filter_shared_group_data');

-- עשן: צילום ידני לקבוצת עדן דרך ה־RPC כבעלים מחובר
select public.snapshot_group(id, 'manual') from public.groups
where slug = '502329063a21';
```
