/* נחיתת צופה — my_last_viewed_group מול ה־SQL האמיתי (PGlite):
   הפונקציה מחזירה את הקבוצה מהצפייה האחרונה של הקורא בלבד (auth.uid),
   לפי group_id — כך שסיבוב slug לא שובר את הניתוב — וסגורה לאנונימיים. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const LONER = "44444444-4444-4444-8444-444444444444";
const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const G2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

const migration = readFileSync(
  new URL("../supabase/migrations/202611060001_viewer_landing_rpc.sql", import.meta.url),
  "utf8"
);

describe("my_last_viewed_group — נחיתת צופה (SQL)", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    /* ב־Supabase האמיתי auth.uid() קורא את תביעת ה־sub מה־JWT. כאן: shim
       שקורא מזהה מבוקר־בדיקה מאותו מנגנון הגדרות־בקשה. */
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create table public.groups (id uuid primary key, owner_id uuid, name text,
        slug text, data jsonb, live jsonb, config jsonb,
        created_at timestamptz default now(), updated_at timestamptz default now());
      create table public.group_views (id bigserial primary key,
        group_id uuid not null references public.groups (id) on delete cascade,
        user_id uuid, email text, name text,
        at timestamptz not null default now(), left_at timestamptz,
        tabs jsonb not null default '[]'::jsonb);
      grant usage on schema public to anon, authenticated;`);
    await db.query(`insert into groups(id, owner_id, name, slug) values
      ($1, $3, 'קבוצה אחת', 'group-one'),
      ($2, $3, 'קבוצה שתיים', 'group-two')`, [G1, G2, OWNER]);
    /* צפיות: הצופה ראה אחת ← שתיים ← שוב אחת (האחרונה קובעת);
       האחר ראה רק את שתיים; הבעלים והבודד לא צפו בכלום. */
    await db.query(`insert into group_views(group_id, user_id, at) values
      ($1, $3, '2026-11-01T10:00:00Z'),
      ($2, $3, '2026-11-02T10:00:00Z'),
      ($1, $3, '2026-11-03T10:00:00Z'),
      ($2, $4, '2026-11-02T12:00:00Z')`, [G1, G2, VIEWER, OTHER]);
    await db.exec(migration);
    await db.exec(migration); // Safe to apply twice.
  }, 30000);
  afterAll(async () => { await db?.close(); });

  const asUser = async (uid) => {
    await db.exec("set role authenticated");
    await db.query(`select set_config('app.test_uid', $1, false)`, [uid]);
  };
  const lastViewed = () => db.query(`select * from my_last_viewed_group()`);

  it("הצפייה האחרונה מנצחת — לא הראשונה ולא בעלות", async () => {
    await asUser(VIEWER);
    try {
      const { rows } = await lastViewed();
      expect(rows).toEqual([{ slug: "group-one", name: "קבוצה אחת" }]);
    } finally { await db.exec("reset role"); }
  });

  it("משתמש אחר מקבל את הקבוצה שלו — אין דליפה חוצת־משתמשים", async () => {
    await asUser(OTHER);
    try {
      const { rows } = await lastViewed();
      expect(rows).toEqual([{ slug: "group-two", name: "קבוצה שתיים" }]);
    } finally { await db.exec("reset role"); }
  });

  it("בלי צפיות — אין שורה (גם לבעלים של קבוצות וגם למי שבלי שום שיוך)", async () => {
    for (const uid of [OWNER, LONER]) {
      await asUser(uid);
      try {
        expect((await lastViewed()).rows).toEqual([]);
      } finally { await db.exec("reset role"); }
    }
  });

  it("סיבוב slug: הניתוב עוקב אחרי ה־slug הנוכחי של הקבוצה (לפי group_id)", async () => {
    await db.query(`update groups set slug = 'rotated-one' where id = $1`, [G1]);
    await asUser(VIEWER);
    try {
      const { rows } = await lastViewed();
      expect(rows).toEqual([{ slug: "rotated-one", name: "קבוצה אחת" }]);
    } finally { await db.exec("reset role"); }
  });

  it("אנונימי לא יכול לקרוא לפונקציה", async () => {
    await db.exec("set role anon");
    try {
      await expect(lastViewed()).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });
});
