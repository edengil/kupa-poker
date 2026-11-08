import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

describe("public history SQL enforcement", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
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
      JSON.stringify({
        players: [
          {
            name: "live player",
            buyinEvents: [
              { amount: 100, total: 100, pot: 5, sid: "wamid.SQL1:0" },
            ],
          },
        ],
        cps: 4,
        applied: { "wamid.SQL1": [{ t: "add", name: "live player" }] },
      }),
      JSON.stringify({ shareHistory: false, chipsPerShekel: 4, botOn: true, internal: "private setting" }),
    ]);
    /* שרשרת הפונקציות הציבוריות המלאה, בסדר כרונולוגי — כולל מיגרציות
       האבטחה (20261008/20261019/20261025/גל־1) שהרתמה לא טענה בעבר. */
    for (const name of [
      "202609090001_public_history.sql",
      "202609150001_last_settlement_payments.sql",
      "202609250001_receipt_confirmation.sql",
      "202609250002_confirmation_history.sql",
      "202610010001_player_of_night_vote.sql",
      "202610080001_fix_rpc_sharehistory_leak.sql",
      "202610190001_pot_privacy.sql",
      "202610250001_mark_payment_projection_potpaid.sql",
      "202610300001_wave1_pot_privacy.sql",
      /* גל 5 (ממצא 19): הרתמה עוצרת כאן — מיגרציות גלים 2–4 (חותמות,
         הסרת applied, דגלי הקפאה, CAS, נוסח ההצבעה) לא נטענו מעולם,
         ולכן שום בדיקת SQL לא הייתה תופסת רגרסיה בהן. */
      "202610300002_wave2b_stamp_sid_privacy.sql",
      "202610300003_wave2b_applied_privacy.sql",
      "202610300004_wave2_frozen_flags_privacy.sql",
      "202610300005_wave3_write_cas.sql",
      "202610300007_wave4_vote_text.sql",
    ]) {
      const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
      await db.exec(sql);
      await db.exec(sql); // Safe to apply twice.
    }
  }, 60000);
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
        /* גלים 2ב: מזהי החותמות ויומן הביטולים לא יוצאים לצופה. */
        expect(rows[0].live).not.toHaveProperty("applied");
        expect(rows[0].live.players[0].buyinEvents[0]).not.toHaveProperty("sid");
        expect(rows[0].live.players[0].buyinEvents[0].amount).toBe(100);
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
      const again = await db.query(
        `select mark_group_payment('secret-link','latest',$1,0,true,'received') as data`,
        [JSON.stringify([{ from: "א", to: "ב", amount: 50 }])]
      );
      const marked = again.rows[0].data.sessions.find((s) => s.id === "latest");
      expect(marked.payments.paid["0"]).toBe(true);
      expect(marked.payments.received["0"]).toBe(true);
      expect(marked.payments.confirmations).toEqual([]);
      const named = await db.query(
        `select mark_group_payment('secret-link','latest',$1,0,true,'paid','אורן גיל') as data`,
        [JSON.stringify([{ from: "א", to: "ב", amount: 50 }])]
      );
      const withName = named.rows[0].data.sessions.find((s) => s.id === "latest");
      expect(withName.payments.confirmations[0]).toMatchObject({
        index: 0,
        action: "paid",
        by: "אורן גיל",
      });
      expect(withName.payments.paid["0"]).toBe(true);
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

  it("write_group_cas (גל 3) מקבל חותמת עדכנית ודוחה חותמת ישנה", async () => {
    const before = (await db.query("select updated_at from groups")).rows[0].updated_at;
    /* write_group_cas הוא security invoker: בייצור ל־authenticated יש
       SELECT+UPDATE על groups עם RLS של הבעלים. הרתמה מונעת גישה ישירה
       בכוונה (הבדיקה שלפני זו), אז לבדיקה הזו מעניקים מקומית ומחזירים. */
    await db.exec("grant select, update on public.groups to authenticated");
    await db.exec("set role authenticated");
    try {
      const okRes = await db.query(
        "select write_group_cas('00000000-0000-0000-0000-000000000001', $1, '{}'::jsonb) as new_ts",
        [before]
      );
      expect(okRes.rows[0].new_ts).not.toBeNull();
      const stale = await db.query(
        "select write_group_cas('00000000-0000-0000-0000-000000000001', $1, '{}'::jsonb) as new_ts",
        ["2000-01-01T00:00:00Z"]
      );
      expect(stale.rows[0].new_ts).toBeNull();
    } finally {
      await db.exec("reset role");
      await db.exec("revoke select, update on public.groups from authenticated");
    }
  });

  it("returns history after explicit enable without modifying the original data", async () => {
    await db.exec(`update groups set config = jsonb_set(config, '{shareHistory}', 'true')`);
    expect((await db.query("select * from public_group_v2('secret-link')")).rows[0].data.sessions).toHaveLength(2);
    await db.exec(`update groups set config = jsonb_set(config, '{shareHistory}', 'false')`);
    expect((await db.query("select data from groups")).rows[0].data.sessions).toHaveLength(2);
  });
});
