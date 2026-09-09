import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

describe("public history SQL enforcement", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create table public.groups (id uuid primary key, name text, slug text,
        data jsonb, live jsonb, config jsonb, updated_at timestamptz default now());
      grant usage on schema public to anon, authenticated;`);
    await db.query(`insert into groups(id,name,slug,data,live,config) values
      ('00000000-0000-0000-0000-000000000001','test','secret-link',$1,$2,$3)`, [
      JSON.stringify({ sessions: [{ id: "private" }], yearly: [{ y: 2026 }], monthly: [], roster: ["private name"], aliases: { private: "name" }, extraHistory: "secret", plan: { iso: "2026-09-10" } }),
      JSON.stringify({ players: [{ name: "live player" }], cps: 4 }),
      JSON.stringify({ shareHistory: false, chipsPerShekel: 4, botOn: true, internal: "private setting" }),
    ]);
    const migration = readFileSync(new URL("../supabase/migrations/202609090001_public_history.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // Safe to apply twice.
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it("filters history in both RPCs before the caller receives it", async () => {
    await db.exec("set role authenticated");
    try {
      for (const rpc of ["public_group", "public_group_v2"]) {
        const { rows } = await db.query(`select * from ${rpc}('secret-link')`);
        expect(rows[0].data).toEqual({ sessions: [], yearly: [], monthly: [], roster: [], aliases: {}, plan: { iso: "2026-09-10" } });
        expect(rows[0].live.players[0].name).toBe("live player");
        if (rpc.endsWith("v2")) expect(rows[0].config).toEqual({ shareHistory: false, chipsPerShekel: 4 });
      }
      expect((await db.query("select * from public_group_v2('wrong-link')")).rows).toEqual([]);
    } finally { await db.exec("reset role"); }
  });
  it("preserves authenticated-only access and no direct table access", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public_group_v2('secret-link')")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public_group('secret-link')")).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
    await db.exec("set role authenticated");
    try { await expect(db.query("select * from groups")).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
  });
  it("returns history after explicit enable without modifying the original data", async () => {
    await db.exec(`update groups set config = jsonb_set(config, '{shareHistory}', 'true')`);
    expect((await db.query("select * from public_group_v2('secret-link')")).rows[0].data.sessions).toEqual([{ id: "private" }]);
    await db.exec(`update groups set config = jsonb_set(config, '{shareHistory}', 'false')`);
    expect((await db.query("select data from groups")).rows[0].data.sessions).toHaveLength(1);
  });
});
