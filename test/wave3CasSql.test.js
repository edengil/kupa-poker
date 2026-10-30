/* גל 3ב — write_group_cas (מיגרציה 202610300005) מול PGlite:
   כתיבה נוחתת רק כשה־updated_at שהכותב קרא עדיין עדכני; התנגשות מחזירה
   NULL ולא כותבת כלום; patch חלקי נוגע רק בעמודות שנמסרו; live=null מנקה;
   data=null הופך ל־{} (עמודת NOT NULL); ל־anon אין הרשאת הרצה. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const GID = "00000000-0000-0000-0000-0000000000c1";

describe("wave3 write_group_cas SQL", () => {
  let db;
  const row = async () =>
    (await db.query(`select data, config, live, updated_at::text as u from groups where id = $1`, [GID])).rows[0];
  const cas = async (expected, patch) =>
    (await db.query(`select write_group_cas($1, $2::timestamptz, $3::jsonb)::text as u`, [
      GID,
      expected,
      JSON.stringify(patch),
    ])).rows[0].u;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.groups (
        id uuid primary key, name text, slug text,
        data jsonb not null default '{}', config jsonb not null default '{}',
        live jsonb, updated_at timestamptz not null default now()
      );
      create or replace function public.touch_test() returns trigger as $t$
      begin new.updated_at := clock_timestamp(); return new; end $t$ language plpgsql;
      create trigger groups_touch before update on public.groups
        for each row execute function public.touch_test();
    `);
    await db.query(
      `insert into groups(id,name,slug,data,config,live) values ($1,'t','cas',$2,$3,$4)`,
      [GID, JSON.stringify({ sessions: [] }), JSON.stringify({ botOn: true }), JSON.stringify({ players: [] })]
    );
    await db.exec(migration("202610300005_wave3_write_cas.sql"));
    await db.exec(migration("202610300005_wave3_write_cas.sql")); // idempotent
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("כתיבה עם expected עדכני נוחתת ומחזירה חותמת חדשה; patch חלקי לא נוגע בשאר", async () => {
    const before = await row();
    const u = await cas(before.u, { config: { botOn: false, pins: { a: 1 } } });
    expect(u).not.toBeNull();
    const after = await row();
    expect(after.config).toEqual({ botOn: false, pins: { a: 1 } });
    expect(after.data).toEqual({ sessions: [] });
    expect(after.live).toEqual({ players: [] });
    expect(after.u).toBe(u);
  });

  it("expected מיושן — התנגשות: NULL ואפס כתיבה", async () => {
    const before = await row();
    const stale = "2000-01-01T00:00:00.000Z";
    const u = await cas(stale, { config: { botOn: true }, live: { players: [{ name: "x" }] } });
    expect(u).toBeNull();
    const after = await row();
    expect(after.u).toBe(before.u);
    expect(after.config.botOn).toBe(false);
    expect(after.live).toEqual({ players: [] });
  });

  it("expected=null — כתיבה בלי תנאי (תאימות לקריאות בלי חותמת)", async () => {
    const u = await cas(null, { live: { players: [{ name: "דן" }] } });
    expect(u).not.toBeNull();
    expect((await row()).live).toEqual({ players: [{ name: "דן" }] });
  });

  it("live=null מנקה את העמודה; data=null הופך ל־{}", async () => {
    const cur = await row();
    const u = await cas(cur.u, { live: null, data: null });
    expect(u).not.toBeNull();
    const after = await row();
    expect(after.live).toBeNull();
    expect(after.data).toEqual({});
  });

  it("שורה לא קיימת — NULL, בלי שגיאה", async () => {
    const u = (
      await db.query(`select write_group_cas($1, null, $2::jsonb)::text as u`, [
        "00000000-0000-0000-0000-000000000099",
        JSON.stringify({ config: {} }),
      ])
    ).rows[0].u;
    expect(u).toBeNull();
  });

  it("הרשאות: anon לא מריץ, authenticated ו־service_role כן", async () => {
    const priv = async (role) =>
      (await db.query(`select has_function_privilege($1, 'public.write_group_cas(uuid, timestamptz, jsonb)', 'execute') as ok`, [role])).rows[0].ok;
    expect(await priv("anon")).toBe(false);
    expect(await priv("authenticated")).toBe(true);
    expect(await priv("service_role")).toBe(true);
  });
});
