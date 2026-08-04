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

-- ---------------------------------------------------------------------------
-- קריאה ציבורית לקריאה-בלבד.
-- security definer עוקף RLS, אבל מחזיר רק את העמודות הבטוחות ורק לפי slug.
-- מי שאין לו את הלינק לא יכול להגיע לשום דבר, וגם לא לרשימת הקבוצות.
-- live נכלל כדי שהצופים יראו משחק פעיל. owner_id ו-slug לעולם לא יוצאים החוצה.
-- ---------------------------------------------------------------------------
-- שינוי חתימה מחייב drop קודם
drop function if exists public.public_group(text);

create function public.public_group(p_slug text)
returns table (name text, data jsonb, live jsonb, updated_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select g.name, g.data, g.live, g.updated_at
  from public.groups g
  where g.slug = p_slug
  limit 1;
$$;

revoke all on function public.public_group(text) from public;
grant execute on function public.public_group(text) to anon, authenticated;
