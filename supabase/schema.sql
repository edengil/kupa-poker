-- ============================================================================
-- קופה — פוקר · סכימת Supabase
-- להריץ ב-Supabase → SQL Editor → New query → Run
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- טבלת הקבוצות. כל שורה = קבוצת פוקר אחת, עם כל ה-DB בתוך jsonb.
-- slug הוא הטוקן שמופיע בלינק לשיתוף (/g/<slug>) ומשמש כמפתח גישה.
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  slug        text not null unique,
  name        text not null default 'קופה — פוקר',
  data        jsonb not null default '{}'::jsonb,   -- poker:db
  config      jsonb not null default '{}'::jsonb,   -- poker:config
  live        jsonb,                                -- poker:live
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists groups_owner_idx on public.groups (owner_id);

-- עדכון אוטומטי של updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists groups_touch on public.groups;
create trigger groups_touch
  before update on public.groups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: רק הבעלים ניגש לשורה שלו. אין לאף אחד אחר גישה ישירה לטבלה.
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;

drop policy if exists "owner reads own groups"   on public.groups;
drop policy if exists "owner inserts own groups" on public.groups;
drop policy if exists "owner updates own groups" on public.groups;
drop policy if exists "owner deletes own groups" on public.groups;

create policy "owner reads own groups"
  on public.groups for select
  using (auth.uid() = owner_id);

create policy "owner inserts own groups"
  on public.groups for insert
  with check (auth.uid() = owner_id);

create policy "owner updates own groups"
  on public.groups for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner deletes own groups"
  on public.groups for delete
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- הרשאות מפורשות.
--
-- ב-Supabase יש הגדרה בשם "Automatically expose new tables" שנותנת הרשאות
-- אוטומטית לכל טבלה חדשה. Supabase עצמה ממליצה לכבות אותה, ולכן הבלוק הזה
-- נותן במפורש בדיוק את מה שצריך — כך שהסכימה עובדת בין אם ההגדרה דלוקה ובין
-- אם לא.
--
-- authenticated מקבל גישה לטבלה, אבל RLS עדיין מגביל אותו לשורה שלו בלבד.
-- anon לא מקבל כלום. הצפייה הציבורית עוברת רק דרך public_group() למטה.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.groups to authenticated;
revoke all on table public.groups from anon;

-- service_role הוא התפקיד שהמפתח הסודי מתחזה אליו, וה-webhook של הוואטסאפ
-- עובד דרכו. הוא אמנם עוקף RLS, אבל עדיין חייב הרשאה ברמת הטבלה — ובלי
-- ההגדרה האוטומטית של Supabase אף אחד לא נותן לו אותה.
grant usage on schema public to service_role;
grant all privileges on table public.groups to service_role;

-- ---------------------------------------------------------------------------
-- קריאה ציבורית לקריאה-בלבד.
-- security definer עוקף RLS, אבל מחזיר רק את העמודות הבטוחות ורק לפי slug.
-- מי שאין לו את הלינק לא יכול להגיע לשום דבר, וגם לא לרשימת הקבוצות.
-- live נכלל כדי שהצופים יראו משחק פעיל. owner_id ו-slug לעולם לא יוצאים החוצה.
-- ---------------------------------------------------------------------------
-- שינוי חתימה מחייב drop קודם
drop function if exists public.public_group(text);

create function public.public_group(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.name, g.data, g.live, g.updated_at
  from public.groups g
  where g.slug = p_slug
  limit 1;
$$;

revoke all on function public.public_group(text) from public;
grant execute on function public.public_group(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- יומן צפיות.
--
-- כל כניסה של צופה נרשמת כאן: מי, מתי, ומאיזה חשבון. זה מה שמאפשר לראות
-- אחר כך מי פתח את הלינק ומתי — כולל מי שנכנס באמצע היום סתם להציץ.
-- ---------------------------------------------------------------------------
create table if not exists public.group_views (
  id        bigserial primary key,
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid references auth.users (id) on delete set null,
  email     text,
  name      text,
  at        timestamptz not null default now(),
  left_at   timestamptz,                      -- "נראה לאחרונה" — מתעדכן כל דקה וביציאה
  tabs      jsonb not null default '[]'::jsonb -- [{tab, at}] — במה הצופה הסתכל ומתי
);

-- שדרוג להתקנות קיימות (בטוח להריץ שוב)
alter table public.group_views add column if not exists left_at timestamptz;
alter table public.group_views add column if not exists tabs jsonb not null default '[]'::jsonb;

create index if not exists group_views_recent_idx on public.group_views (group_id, at desc);

alter table public.group_views enable row level security;

drop policy if exists "owner reads views"      on public.group_views;
drop policy if exists "viewer logs own view"   on public.group_views;
drop policy if exists "viewer updates own view" on public.group_views;

-- הבעלים רואה את היומן של הקבוצה שלו בלבד
create policy "owner reads views"
  on public.group_views for select
  using (exists (
    select 1 from public.groups g
    where g.id = group_id and g.owner_id = auth.uid()
  ));

-- כל מחובר רושם את הכניסה של עצמו, ולא של אף אחד אחר
create policy "viewer logs own view"
  on public.group_views for insert
  with check (auth.uid() = user_id);

-- הצופה מעדכן רק את השורות של עצמו: זמן יציאה ורשימת הטאבים שנצפו
create policy "viewer updates own view"
  on public.group_views for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.group_views to authenticated;
grant usage, select on sequence public.group_views_id_seq to authenticated;
grant all privileges on table public.group_views to service_role;

-- ---------------------------------------------------------------------------
-- הצפייה דורשת עכשיו התחברות. ה-slug נשאר מפתח הגישה, אבל בנוסף אליו
-- צריך חשבון Google — אחרת אין דרך לדעת מי צופה.
-- ---------------------------------------------------------------------------
revoke execute on function public.public_group(text) from anon;
grant execute on function public.public_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- מנויי התראות פוש.
--
-- כל צופה שביקש "עדכן אותי כשמתחיל משחק" נשמר כאן עם פרטי המנוי של הדפדפן
-- שלו. השליחה עצמה נעשית בצד השרת עם המפתח הסודי, ולכן service_role מקבל הכל.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         bigserial primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  name       text,
  created_at timestamptz not null default now()
);

create index if not exists push_subs_group_idx on public.push_subscriptions (group_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "viewer manages own subscription" on public.push_subscriptions;

create policy "viewer manages own subscription"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant usage, select on sequence public.push_subscriptions_id_seq to authenticated;
grant all privileges on table public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- אישורי הגעה לערב מתוכנן.
--
-- המנהל קובע תאריך באפליקציה (נשמר בתוך data.plan), והצופים עונים כאן.
-- שורה אחת לאדם בקבוצה; plan_iso מציין לאיזה ערב התשובה שייכת, כך שתכנון
-- חדש מאפס אוטומטית את התשובות הישנות.
-- ---------------------------------------------------------------------------
create table if not exists public.game_rsvps (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  plan_iso   text not null,
  status     text not null check (status in ('yes', 'no', 'maybe')),
  name       text,
  email      text,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.game_rsvps enable row level security;

drop policy if exists "rsvp read"  on public.game_rsvps;
drop policy if exists "rsvp write" on public.game_rsvps;

-- כל מי שמחובר ומחזיק את מזהה הקבוצה (שמגיע רק מהלינק) רואה מי מגיע —
-- זו בדיוק המטרה: שהחברים יראו אחד את השני
create policy "rsvp read"
  on public.game_rsvps for select
  to authenticated
  using (true);

create policy "rsvp write"
  on public.game_rsvps for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.game_rsvps to authenticated;
grant all privileges on table public.game_rsvps to service_role;
