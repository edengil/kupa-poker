-- ---------------------------------------------------------------------------
-- גל 3 (תוכנית מקיפה — G10, שער 0.6) — גיבוי אפליקטיבי חינמי: צילומי
-- קבוצה בצד השרת, בתוך המסד עצמו. אין PITR ואין שום רכיב תלוי־דרגה
-- בתשלום של Supabase: הצילום הוא שורה בטבלה שלנו, והשחזור בונה קבוצה
-- חדשה ממנה. נקודות צילום: (א) יומי מהקרון (reason='daily'); (ב) חובה
-- חוסמת לפני מחיקה — delete_group_with_snapshot מצלם בתוך אותה
-- פונקציה, וכשל צילום זורק לפני שהמחיקה רצה; (ג) ידני מכרטיס הבעלים
-- (reason='manual').
--
-- ‏RLS סגור לגמרי (בלי שום מדיניות), גישה רק ל־service_role, והפונקציות
-- הן security definer עם בדיקת בעלות בפנים — כך הבעלים מצלם/משחזר רק
-- את הקבוצות שלו דרך ה־RPC, ומעולם לא נוגע בטבלה ישירות.
--
-- רוכב באותה מיגרציה:
-- • G7/G5 (3.3): אינדקס (user_id, at desc, id desc) ל־group_views —
--   צורת ה־ORDER BY של my_last_viewed_group.
-- • G2 (3.5): revoke מפורש על פונקציות העזר הפנימיות גם
--   מ־authenticated ו־service_role במפורש (עד כה revoke-only מ־public
--   ו־anon), ו־revoke ראשון גם ל־touch_updated_at. הפונקציות נקראות
--   רק מתוך פונקציות־definer אחרות, שם ההקשר הוא הבעלים — אין אובדן
--   פונקציונליות.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- טבלת הצילומים. כל שורה = צילום מלא של קבוצה אחת ברגע נתון:
-- שלושת הבלובים (data/config/live) + מטא־נתונים לשחזור ולאיתור.
-- ---------------------------------------------------------------------------
create table if not exists public.group_snapshots (
  id         uuid primary key default gen_random_uuid(),
  -- בלי on delete cascade על group_id בכוונה: צילום שלפני־מחיקה חייב
  -- לשרוד את מחיקת הקבוצה — הוא כל נקודת השחזור. הצילומים נגזמים לפי
  -- גיל (30 יום) בקרון, ומחיקת הבעלים (owner_id cascade) כן מנקה אותם.
  group_id   uuid not null,
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

-- בלי מדיניות בכלל: anon/authenticated לא רואים ולא כותבים כלום.
revoke all on table public.group_snapshots from public, anon, authenticated;
grant all privileges on table public.group_snapshots to service_role;

-- ---------------------------------------------------------------------------
-- פונקציית הצילום האחת. מתקשר מזוהה (auth.uid()) חייב להיות בעל
-- הקבוצה; מתקשר שרת בלי סשן (service_role, auth.uid() null) — מותר.
-- מחזירה את מזהה הצילום; זורקת על קבוצה חסרה / בעלות זרה / סיבה לא
-- חוקית — והזריקה היא בדיוק מה שהופך את הצילום לחוסם לפני מחיקה.
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

-- ---------------------------------------------------------------------------
-- מחיקת קבוצה עם צילום חובה. הצילום והמחיקה באותה פונקציה: אם הצילום
-- נכשל (טבלה חסרה, שגיאת כתיבה) החריגה עוצרת לפני ה־DELETE והקבוצה
-- נשארת. מחזירה את מזהה הצילום שנוצר, כדי שהמתקשר יוכל לאמת שנוצר.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- שחזור: בונה קבוצה חדשה מהצילום (המקור לא נמחק כאן — מחיקה היא פעולה
-- נפרדת דרך delete_group_with_snapshot). אותו slug אם פנוי; אחרת סיומת
-- אקראית קצרה, בלולאה עד שנמצא פנוי. מחזירה את מזהה הקבוצה החדשה ואת
-- ה־slug שנבחר בפועל.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- רשימת צילומים לבעלים (מטא־נתונים בלבד, בלי הבלובים) — לכרטיס הבעלים.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3.3 — אינדקס לנתיב החם של my_last_viewed_group: סינון לפי user_id
-- וסדר at desc, id desc (אותה צורה כמו ב־RPC).
-- ---------------------------------------------------------------------------
create index if not exists group_views_user_recent_idx
  on public.group_views (user_id, at desc, id desc);

-- ---------------------------------------------------------------------------
-- 3.5 — revoke מפורש ומורחב לפונקציות העזר הפנימיות + פונקציית הטריגר.
-- ---------------------------------------------------------------------------
revoke all on function public.touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.strip_buyin_event_sids(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.project_payments_for_viewer(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.project_session_for_viewer(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.filter_shared_group_data(jsonb, jsonb) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
