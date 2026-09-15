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
      JSON.stringify({
        sessions: [
          { id: "old", iso: "2026-08-01" },
          { id: "latest", iso: "2026-09-10", endedAt: 999 },
        ],
        yearly: [{ y: 2026 }],
        monthly: [],
        roster: ["private name"],
        aliases: { private: "name" },
        extraHistory: "secret",
        plan: { iso: "2026-09-10" },
      }),
      JSON.stringify({ players: [{ name: "live player" }], cps: 4 }),
      JSON.stringify({ shareHistory: false, chipsPerShekel: 4, botOn: true, internal: "private setting" }),
    ]);
    const migration = readFileSync(new URL("../supabase/migrations/202609150001_last_settlement_payments.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // Safe to apply twice.
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it("exposes only the latest session when history is hidden", async () => {
    await db.exec("set role authenticated");
    try {
      for (const rpc of ["public_group", "public_group_v2"]) {
        const { rows } = await db.query(`select * from ${rpc}('secret-link')`);
        expect(rows[0].data.sessions).toEqual([{ id: "latest", iso: "2026-09-10", endedAt: 999 }]);
        expect(rows[0].data.yearly).toEqual([]);
        expect(rows[0].data.roster).toEqual([]);
        expect(rows[0].data.aliases).toEqual({ private: "name" });
        expect(rows[0].data.plan).toEqual({ iso: "2026-09-10" });
        expect(rows[0].live.players[0].name).toBe("live player");
        if (rpc.endsWith("v2")) expect(rows[0].config).toEqual({ shareHistory: false, chipsPerShekel: 4 });
      }
      expect((await db.query("select * from public_group_v2('wrong-link')")).rows).toEqual([]);
    } finally { await db.exec("reset role"); }
  });

  it("marks a payment on the latest session via RPC", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(
        `select mark_group_payment('secret-link','latest',$1,0,true) as data`,
        [JSON.stringify([{ from: "א", to: "ב", amount: 50 }])]
      );
      const sess = rows[0].data.sessions.find((s) => s.id === "latest");
      expect(sess.payments.paid["0"]).toBe(true);
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
    expect((await db.query("select * from public_group_v2('secret-link')")).rows[0].data.sessions).toHaveLength(2);
    await db.exec(`update groups set config = jsonb_set(config, '{shareHistory}', 'false')`);
    expect((await db.query("select data from groups")).rows[0].data.sessions).toHaveLength(2);
  });
});
