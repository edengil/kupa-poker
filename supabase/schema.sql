-- ============================================================================
-- קופה — פוקר · סכימת Supabase (מאוחדת, גל 4ב — ממצא ביקורת 15)
-- להריץ ב-Supabase → SQL Editor → New query → Run
--
-- הקובץ הזה הוא צילום המצב הסופי של שרשרת המיגרציות שבתיקיית migrations:
-- כל טבלה, מדיניות ופונקציה מופיעים כאן בגרסתם האחרונה בשרשרת (כולל
-- מיגרציות הגלים המקיפים 1–3: צילומי גיבוי group_snapshots ואינדקס
-- הצפיות של גל 3, וטבלת diag_events של גל 4ב), כך שהתקנה ממנו נותנת את
-- מערכת הייצור בדיוק. תיקון עתידי למסד נעשה במיגרציה חדשה — והסכמה כאן
-- מתעדכנת לאותה גרסה סופית. בדיקת הטעינה test/wave4InfraSql.test.js
-- מוכיחה שהקובץ נטען נקי ושהמלאי שלו זהה למלאי של "הסכמה + כל השרשרת".
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

-- גל 3 (3.5, G2): פונקציית טריגר — אין לאף תפקיד־לקוח צורך ב־execute.
revoke all on function public.touch_updated_at() from public, anon, authenticated, service_role;

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

-- גל 3 (3.3, G7/G5): הנתיב החם של my_last_viewed_group — סינון לפי
-- user_id וסדר at desc, id desc.
create index if not exists group_views_user_recent_idx on public.group_views (user_id, at desc, id desc);

alter table public.group_views enable row level security;

drop policy if exists "owner reads views"      on public.group_views;
drop policy if exists "viewer reads own views"  on public.group_views;
drop policy if exists "viewer logs own view"   on public.group_views;
drop policy if exists "viewer updates own view" on public.group_views;

-- הבעלים רואה את היומן של הקבוצה שלו בלבד
create policy "owner reads views"
  on public.group_views for select
  using (exists (
    select 1 from public.groups g
    where g.id = group_id and g.owner_id = auth.uid()
  ));

-- הצופה חייב לראות את השורה של עצמו: הרישום מחזיר את מזהה השורה
-- (insert ... returning), וב-RLS זה נכשל בלי הרשאת select על השורה.
create policy "viewer reads own views"
  on public.group_views for select
  using (auth.uid() = user_id);

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
  email      text,
  player_name text,
  created_at timestamptz not null default now()
);

create index if not exists push_subs_group_idx on public.push_subscriptions (group_id);

alter table public.push_subscriptions add column if not exists email text;
alter table public.push_subscriptions add column if not exists player_name text;

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

-- מי קורא את ההיענויות — נוסח סופי ממיגרציה 202610310001 (גל 5):
-- בעל הקבוצה (הרשימה באפליקציית המנהל), מי שביקר בקבוצה (שער
-- 202610080002 נגד קריאה חוצת־קבוצות), והשורה של המשתמש עצמו.
-- לפני 202610080002 הקריאה הייתה פתוחה לכל מחובר, כולל מיילים.
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

create policy "rsvp write"
  on public.game_rsvps for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.game_rsvps to authenticated;
grant all privileges on table public.game_rsvps to service_role;

-- ---------------------------------------------------------------------------
-- אישורי Google Calendar (מיגרציה 202610060001). טוקן הרענון של חיבור
-- היומן נשמר כאן, בצד השרת בלבד: RLS בלי שום מדיניות = אין גישה
-- ל־anon/authenticated, ו־service_role עוקף.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_credentials (
  group_id uuid primary key references public.groups(id) on delete cascade,
  refresh_token text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_credentials enable row level security;

-- תור ההתראות (push_queue, מיגרציה 202610080003) הוסר בגל 5
-- (מיגרציה 202610310002): המנגנון מעולם לא חווט — לא היה יצרן, לא היה
-- תזמון לעיבוד, והטבלה עמדה ריקה בייצור. ההתראות יוצאות בנתיבים ישירים.

-- ---------------------------------------------------------------------------
-- יומן אבחון (מיגרציה 202610300006, גל 4ב). שורות מ־/api/diag ומרישום
-- אירועי השליחה של הבוט (lib/wa/healthServer.js). הטבלה חיה בייצור מאז
-- 24.10.2026; כאן היא נכנסת לסכמה במבנה זהה לייצור. RLS בלי מדיניות —
-- כתיבה וקריאה רק דרך service_role בצד השרת.
-- ---------------------------------------------------------------------------
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

grant all privileges on table public.diag_events to service_role;

-- ---------------------------------------------------------------------------
-- צילומי גיבוי של קבוצות (מיגרציה 202611080001, גל 3 מקיף — G10).
-- גיבוי אפליקטיבי חינמי בתוך המסד: כל שורה היא צילום מלא של קבוצה
-- (data+config+live) מנקודת צילום יומית / לפני־מחיקה / ידנית. RLS סגור
-- בלי מדיניות; גישה רק דרך service_role ודרך פונקציות ה־definer שלמטה
-- (בסוף הקובץ, אחרי write_group_cas). שחזור בונה קבוצה חדשה מהצילום.
-- ---------------------------------------------------------------------------
create table if not exists public.group_snapshots (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  slug       text not null,
  name       text not null,
  reason     text not null check (reason in ('daily', 'pre-delete', 'manual')),
  data       jsonb not null,
  config     jsonb not null default '{}'::jsonb,
  live       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists group_snapshots_group_idx
  on public.group_snapshots (group_id, created_at desc);

alter table public.group_snapshots enable row level security;

revoke all on table public.group_snapshots from public, anon, authenticated;
grant all privileges on table public.group_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- קריאה ציבורית לקריאה-בלבד.
-- security definer עוקף RLS, אבל מחזיר רק את העמודות הבטוחות ורק לפי slug.
-- מי שאין לו את הלינק לא יכול להגיע לשום דבר, וגם לא לרשימת הקבוצות.
-- live נכלל כדי שהצופים יראו משחק פעיל. owner_id ו-slug לעולם לא יוצאים החוצה.
-- הצפייה דורשת התחברות: ה-slug נשאר מפתח הגישה, אבל בנוסף אליו צריך
-- חשבון Google — אחרת אין דרך לדעת מי צופה. לכן execute רק ל-authenticated.
-- ---------------------------------------------------------------------------
-- פרטיות קופה (גלים 1–2): הקרנת צופה אחת לכל הפונקציות הציבוריות.
-- הגדרות הפונקציות בבלוק הזה הן הגרסאות הסופיות בשרשרת המיגרציות:
-- project_payments_for_viewer — 202610300001; ‏strip_buyin_event_sids —
-- 202610300002; ‏public_group — 202610300003; ‏project_session_for_viewer
-- ו־filter_shared_group_data — 202610300004.
-- ---------------------------------------------------------------------------

-- עזר הקרנה: מערך שחקנים/שורות־ערב → אותו מערך כשמכל אירוע קנייה הוסר
-- מפתח ה־sid (מזהה הודעת הוואטסאפ — שדה פנימי של הבוט, לא לצופה).
create or replace function public.strip_buyin_event_sids(p_rows jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_rows is null or jsonb_typeof(p_rows) <> 'array' then p_rows
    else coalesce((
      select jsonb_agg(
        case when jsonb_typeof(elem) = 'object' and jsonb_typeof(elem->'buyinEvents') = 'array' then
          jsonb_set(elem, '{buyinEvents}', coalesce((
            select jsonb_agg(case when jsonb_typeof(ev) = 'object' then ev - 'sid' else ev end order by eord)
            from jsonb_array_elements(elem->'buyinEvents') with ordinality as t(ev, eord)
          ), '[]'::jsonb), true)
        else elem end
        order by ord)
      from jsonb_array_elements(p_rows) with ordinality as t(elem, ord)
    ), '[]'::jsonb)
  end;
$$;

revoke all on function public.strip_buyin_event_sids(jsonb) from public, anon, authenticated, service_role;

-- הקרנת תשלומי ערב לצופה: שורת הקופה יוצאת ממחרוזת התוכנית והסימונים
-- ממופים מחדש לקואורדינטות המוקרנות; potPaid מוסר מהתגובה (באחסון נשמר).
create or replace function public.project_payments_for_viewer(p_payments jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  plan_txt text;
  plan_arr jsonb;
  elem jsonb;
  i integer;
  kept jsonb := '[]'::jsonb;
  idx_map jsonb := '{}'::jsonb;
  has_pot boolean := false;
  out_payments jsonb;
  new_paid jsonb := '{}'::jsonb;
  new_received jsonb := '{}'::jsonb;
  new_conf jsonb := '[]'::jsonb;
  kv record;
  ev jsonb;
  new_idx text;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'object' then
    return p_payments;
  end if;
  out_payments := p_payments - 'potPaid';
  plan_txt := p_payments->>'plan';
  if plan_txt is null then
    return out_payments;
  end if;
  begin
    plan_arr := plan_txt::jsonb;
  exception when others then
    return out_payments;
  end;
  if jsonb_typeof(plan_arr) <> 'array' then
    return out_payments;
  end if;

  for i in 0 .. jsonb_array_length(plan_arr) - 1 loop
    elem := plan_arr->i;
    if coalesce(elem->>'pot', 'false') = 'true'
       or coalesce(elem->>'residual', 'false') = 'true' then
      has_pot := true;
    else
      idx_map := jsonb_set(idx_map, array[i::text], to_jsonb(jsonb_array_length(kept)), true);
      kept := kept || jsonb_build_array(elem);
    end if;
  end loop;

  if not has_pot then
    return out_payments;
  end if;

  for kv in select key, value from jsonb_each(coalesce(p_payments->'paid', '{}'::jsonb)) loop
    if kv.value = 'true'::jsonb and idx_map ? kv.key then
      new_paid := jsonb_set(new_paid, array[idx_map->>kv.key], 'true'::jsonb, true);
    end if;
  end loop;
  for kv in select key, value from jsonb_each(coalesce(p_payments->'received', '{}'::jsonb)) loop
    if kv.value = 'true'::jsonb and idx_map ? kv.key then
      new_received := jsonb_set(new_received, array[idx_map->>kv.key], 'true'::jsonb, true);
    end if;
  end loop;
  for ev in select value from jsonb_array_elements(coalesce(p_payments->'confirmations', '[]'::jsonb)) loop
    if jsonb_typeof(ev) <> 'object' then
      continue;
    end if;
    if coalesce(ev->>'pot', 'false') = 'true' then
      continue;
    end if;
    new_idx := idx_map->>(ev->>'index');
    if new_idx is null then
      continue;
    end if;
    new_conf := new_conf || jsonb_build_array(jsonb_set(ev, '{index}', to_jsonb(new_idx::integer), true));
  end loop;

  return jsonb_build_object(
    'plan', to_jsonb(kept::text),
    'paid', new_paid,
    'received', new_received,
    'confirmations', new_conf
  );
end;
$$;

revoke all on function public.project_payments_for_viewer(jsonb) from public, anon, authenticated, service_role;

-- הקרנת ערב בודד לצופה: בלי שדות קופה, בלי coupleFills, בלי סימוני
-- הקפאה (frozenActual/frozenReal/frozenAuto), עם הסרת sid מאירועי הקנייה.
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

revoke all on function public.project_session_for_viewer(jsonb) from public, anon, authenticated, service_role;

-- סינון נתוני קבוצה לתגובות RPC ציבוריות: shareHistory + הקרנת קופה מלאה
-- + הסרת סימוני ההקפאה מ־manualSettlement של כל ערב מוקרן, בשני המצבים.
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

revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon, authenticated, service_role;

-- שינוי חתימה מחייב drop קודם
drop function if exists public.public_group(text);

create function public.public_group(p_slug text)
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

-- Versioned signature keeps older clients compatible. Only public settings are returned.
create or replace function public.public_group_v2(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz, config jsonb)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name, p.data, p.live, p.updated_at,
    jsonb_build_object(
      'shareHistory', coalesce(g.config->'shareHistory', 'true'::jsonb),
      'chipsPerShekel', coalesce(g.config->'chipsPerShekel', '2'::jsonb)
    )
  from public.public_group(p_slug) p
  join public.groups g on g.id = p.id;
$$;
revoke all on function public.public_group_v2(text) from public, anon;
grant execute on function public.public_group_v2(text) to authenticated;

-- נחיתת צופה מהשורש: ה־slug (והשם) של הקבוצה מהצפייה האחרונה של הקורא
-- ב־group_views. השורש מנתב לפי זה צופה בלי קבוצה בבעלותו למשטח הצפייה
-- של הקבוצה — במקום ליצור לו קבוצה חדשה וריקה. מסנן לפי auth.uid() בלבד;
-- ה־slug נשלף דרך group_id, כך שסיבוב לינק לא שובר את הניתוב.
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

-- ---------------------------------------------------------------------------
-- צופים מסמנים העברות כ"שולם/התקבל" בלי גישת כתיבה מלאה לקבוצה
-- (הגרסה הסופית בשרשרת: 202610300001 — זיהוי הקרנת הצופה מול התוכנית
-- הגולמית, תרגום אינדקס, מיזוג שמרני, ותגובה מסוננת לצופה).
-- ---------------------------------------------------------------------------
drop function if exists public.mark_group_payment(text, text, text, integer, boolean, text);
drop function if exists public.mark_group_payment(text, text, text, integer, boolean, text, text);
create or replace function public.mark_group_payment(
  p_slug text,
  p_session_id text,
  p_fingerprint text,
  p_index integer,
  p_paid boolean,
  p_field text default 'paid',
  p_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  sessions jsonb;
  sess jsonb;
  i integer;
  j integer;
  sid text;
  payments jsonb;
  stored_plan text;
  plan_arr jsonb;
  projected jsonb;
  incoming jsonb;
  elem jsonb;
  proj_pos integer;
  mark_index integer;
  plan_to_store text;
  side_map jsonb;
  conf jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
begin
  if p_slug is null or p_session_id is null or p_fingerprint is null or p_index is null then
    raise exception 'missing arguments';
  end if;
  if p_index < 0 then
    raise exception 'invalid index';
  end if;
  if p_field is distinct from 'paid' and p_field is distinct from 'received' then
    raise exception 'invalid field';
  end if;

  select * into g from public.groups where slug = p_slug for update;
  if not found then
    raise exception 'group not found';
  end if;

  sessions := coalesce(g.data->'sessions', '[]'::jsonb);

  for i in 0 .. jsonb_array_length(sessions) - 1 loop
    sess := sessions->i;
    sid := sess->>'id';
    if sid = p_session_id then
      session_found := true;
      payments := coalesce(sess->'payments', '{}'::jsonb);
      stored_plan := payments->>'plan';
      mark_index := p_index;
      plan_to_store := p_fingerprint;
      if stored_plan is not null and stored_plan is distinct from p_fingerprint then
        -- The public client holds the projection of the stored plan (admin
        -- rows stripped) and sends it as the fingerprint. If it matches the
        -- stored plan's projection semantically, translate the index into
        -- raw-plan coordinates and keep the raw string stored.
        begin
          plan_arr := stored_plan::jsonb;
          incoming := p_fingerprint::jsonb;
        exception when others then
          raise exception 'fingerprint mismatch';
        end;
        if jsonb_typeof(plan_arr) is distinct from 'array' then
          raise exception 'fingerprint mismatch';
        end if;
        projected := '[]'::jsonb;
        proj_pos := -1;
        mark_index := null;
        for j in 0 .. jsonb_array_length(plan_arr) - 1 loop
          elem := plan_arr->j;
          if coalesce(elem->>'pot', 'false') = 'true'
             or coalesce(elem->>'residual', 'false') = 'true' then
            continue;
          end if;
          proj_pos := proj_pos + 1;
          projected := projected || jsonb_build_array(elem);
          if proj_pos = p_index then
            mark_index := j;
          end if;
        end loop;
        if incoming is distinct from projected then
          raise exception 'fingerprint mismatch';
        end if;
        if mark_index is null then
          raise exception 'invalid index';
        end if;
        plan_to_store := stored_plan;
      end if;
      side_map := coalesce(payments->p_field, '{}'::jsonb);
      side_map := jsonb_set(side_map, array[mark_index::text], to_jsonb(p_paid), true);
      conf := coalesce(payments->'confirmations', '[]'::jsonb);
      if p_paid is true and coalesce(btrim(p_by), '') <> '' then
        conf := conf || jsonb_build_array(jsonb_build_object(
          'index', mark_index,
          'action', p_field,
          'by', btrim(p_by),
          'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ));
      end if;
      -- Conservative merge: update only the three marking keys inside the
      -- stored payments object — potPaid and any future keys survive.
      payments := jsonb_set(payments, '{plan}', to_jsonb(plan_to_store), true);
      payments := jsonb_set(payments, array[p_field], side_map, true);
      payments := jsonb_set(payments, '{confirmations}', conf, true);
      sess := jsonb_set(sess, '{payments}', payments, true);
    end if;
    out_sessions := out_sessions || jsonb_build_array(sess);
  end loop;

  if not session_found then
    raise exception 'session not found';
  end if;

  update public.groups
  set data = jsonb_set(coalesce(g.data, '{}'::jsonb), '{sessions}', out_sessions, true),
      updated_at = now()
  where id = g.id
  returning data into g.data;

  -- גל 1: התגובה לצופה מסוננת ומוקרנת־קופה, כמו public_group
  return public.filter_shared_group_data(g.data, g.config);
end;
$$;

revoke all on function public.mark_group_payment(text, text, text, integer, boolean, text, text) from public, anon;
grant execute on function public.mark_group_payment(text, text, text, integer, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- צופים מצביעים ל"שחקן הערב" בלי גישת כתיבה מלאה. ההצבעות נשמרות על
-- הערב: session.playerOfNightVotes = { voter: candidate }.
-- הגרסה הסופית בשרשרת: 202610080001 — כולל נוסח השגיאה
-- 'candidate not in session' והחזרת נתונים מסוננים (הסכמה הישנה נשאה
-- נוסח אחר, 'candidate did not sit this night' — תוקן בגל 4ב).
-- ---------------------------------------------------------------------------
create or replace function public.vote_player_of_night(
  p_slug text,
  p_session_id text,
  p_candidate text,
  p_voter text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  sessions jsonb;
  sess jsonb;
  i integer;
  sid text;
  votes jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
  candidate_ok boolean := false;
  e jsonb;
begin
  if p_slug is null or p_session_id is null
     or coalesce(btrim(p_candidate), '') = ''
     or coalesce(btrim(p_voter), '') = '' then
    raise exception 'missing arguments';
  end if;

  select * into g from public.groups where slug = p_slug for update;
  if not found then
    raise exception 'group not found';
  end if;

  sessions := coalesce(g.data->'sessions', '[]'::jsonb);

  for i in 0 .. jsonb_array_length(sessions) - 1 loop
    sess := sessions->i;
    sid := sess->>'id';
    if sid = p_session_id then
      session_found := true;
      candidate_ok := false;
      for e in select value from jsonb_array_elements(coalesce(sess->'entries', '[]'::jsonb)) loop
        if e->>'name' = btrim(p_candidate) then
          candidate_ok := true;
        end if;
      end loop;
      if not candidate_ok then
        raise exception 'candidate not in session';
      end if;
      votes := coalesce(sess->'playerOfNightVotes', '{}'::jsonb);
      votes := jsonb_set(votes, array[btrim(p_voter)], to_jsonb(btrim(p_candidate)), true);
      sess := jsonb_set(sess, '{playerOfNightVotes}', votes, true);
    end if;
    out_sessions := out_sessions || jsonb_build_array(sess);
  end loop;

  if not session_found then
    raise exception 'session not found';
  end if;

  update public.groups
  set data = jsonb_set(coalesce(g.data, '{}'::jsonb), '{sessions}', out_sessions, true),
      updated_at = now()
  where id = g.id
  returning data, config into g.data, g.config;

  -- תיקון אבטחה: להחזיר מסונן, לא את ה-blob המלא
  return public.filter_shared_group_data(g.data, g.config);
end;
$$;

revoke all on function public.vote_player_of_night(text, text, text, text) from public, anon;
grant execute on function public.vote_player_of_night(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- כתיבת קבוצה עם הגנת גרסאות (מיגרציה 202610300005, גל 3ב — ממצא 9).
-- הטריגר groups_touch מעדכן את updated_at בכל כתיבה; הפונקציה הופכת
-- אותו לתנאי: כתיבה מתקבלת רק אם updated_at עדיין שווה לערך שהכותב
-- קרא, והכותב מקבל את updated_at החדש — או null כשיש התנגשות.
-- security invoker בכוונה: ה־UPDATE כפוף ל־RLS של המתקשר כמו כתיבת
-- טבלה ישירה. p_patch: תת־קבוצה של data/config/live; מפתח חסר = העמודה
-- לא נגעת; null על live מנקה, על data/config מתפרש כ־{}.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- צילומי גיבוי (מיגרציה 202611080001, גל 3 מקיף — G10): פונקציית הצילום
-- האחת, מחיקה־עם־צילום־חובה, שחזור כקבוצה חדשה, ורשימת צילומים לבעלים.
-- כולן security definer עם בדיקת בעלות בפנים (מתקשר שרת בלי סשן מותר).
-- ---------------------------------------------------------------------------
create or replace function public.snapshot_group(p_group_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  snap_id uuid;
begin
  if p_reason is null or p_reason not in ('daily', 'pre-delete', 'manual') then
    raise exception 'invalid snapshot reason: %', coalesce(p_reason, '(null)');
  end if;

  select * into g from public.groups where id = p_group_id;
  if not found then
    raise exception 'group not found: %', p_group_id;
  end if;

  if auth.uid() is not null and auth.uid() <> g.owner_id then
    raise exception 'forbidden: not the group owner';
  end if;

  insert into public.group_snapshots
    (group_id, owner_id, slug, name, reason, data, config, live)
  values
    (g.id, g.owner_id, g.slug, g.name, p_reason, g.data, g.config, g.live)
  returning id into snap_id;

  return snap_id;
end;
$$;

revoke all on function public.snapshot_group(uuid, text) from public, anon;
grant execute on function public.snapshot_group(uuid, text) to authenticated, service_role;

create or replace function public.delete_group_with_snapshot(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  snap_id uuid;
begin
  snap_id := public.snapshot_group(p_group_id, 'pre-delete');

  delete from public.groups where id = p_group_id;

  return snap_id;
end;
$$;

revoke all on function public.delete_group_with_snapshot(uuid) from public, anon;
grant execute on function public.delete_group_with_snapshot(uuid) to authenticated, service_role;

create or replace function public.restore_group_snapshot(p_snapshot_id uuid, p_new_slug text default null)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.group_snapshots%rowtype;
  chosen_slug text;
  new_id uuid;
begin
  select * into s from public.group_snapshots where group_snapshots.id = p_snapshot_id;
  if not found then
    raise exception 'snapshot not found: %', p_snapshot_id;
  end if;

  if auth.uid() is not null and auth.uid() <> s.owner_id then
    raise exception 'forbidden: not the snapshot owner';
  end if;

  chosen_slug := coalesce(nullif(btrim(p_new_slug), ''), s.slug);
  while exists (select 1 from public.groups g where g.slug = chosen_slug) loop
    chosen_slug := coalesce(nullif(btrim(p_new_slug), ''), s.slug)
      || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  end loop;

  insert into public.groups (owner_id, slug, name, data, config, live)
  values (s.owner_id, chosen_slug, s.name, s.data, s.config, s.live)
  returning groups.id into new_id;

  return query select new_id, chosen_slug;
end;
$$;

revoke all on function public.restore_group_snapshot(uuid, text) from public, anon;
grant execute on function public.restore_group_snapshot(uuid, text) to authenticated, service_role;

create or replace function public.list_group_snapshots(p_group_id uuid)
returns table (id uuid, reason text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  g_owner uuid;
begin
  select owner_id into g_owner from public.groups where groups.id = p_group_id;
  if g_owner is null then
    raise exception 'group not found: %', p_group_id;
  end if;

  if auth.uid() is not null and auth.uid() <> g_owner then
    raise exception 'forbidden: not the group owner';
  end if;

  return query
    select gs.id, gs.reason, gs.created_at
    from public.group_snapshots gs
    where gs.group_id = p_group_id
    order by gs.created_at desc
    limit 20;
end;
$$;

revoke all on function public.list_group_snapshots(uuid) from public, anon;
grant execute on function public.list_group_snapshots(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
