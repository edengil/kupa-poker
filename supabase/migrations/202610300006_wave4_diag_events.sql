-- ============================================================================
-- גל 4ב — טבלת האבחון diag_events נכנסת לשרשרת (ממצא ביקורת 15).
-- הטבלה נוצרה ידנית במסד הייצור באירוע קריסת עמוד הבעלים (24.10.2026)
-- וחיה מאז רק שם — שום קובץ לא תיאר אותה, והתקנה מהסכמה לא יצרה אותה
-- (כתיבות האבחון של /api/diag ושל lib/wa/healthServer.js נכשלו בשקט).
-- המבנה כאן זהה לטבלת הייצור, כפי שאומת מול קטלוג הייצור ב־30.10.2026:
-- id כ־identity, ‏created_at עם ברירת־מחדל now(), עמודות הטקסט וה־payload
-- כפי ששני אתרי הכתיבה שולחים, RLS מופעל בלי מדיניות (הכתיבה והקריאה
-- נעשות רק דרך service_role בצד השרת).
-- ההרצה בטוחה על הייצור הקיים: create if not exists הוא no-op שם.
-- ============================================================================

begin;

create table if not exists public.diag_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text,
  message    text,
  stack      text,
  url        text,
  ua         text,
  phase      integer,
  payload    jsonb
);

alter table public.diag_events enable row level security;

-- אין מדיניות = אין גישה ל־anon/authenticated. השרת כותב דרך service_role.
grant all privileges on table public.diag_events to service_role;

notify pgrst, 'reload schema';
commit;
