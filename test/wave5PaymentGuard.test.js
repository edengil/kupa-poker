/* גל 5, פריטים 5.3+5.4 — mark_group_payment מול ה־SQL האמיתי (PGlite):
   5.3: ‏retry של אותה קריאת סימון לא מכפיל אירוע confirmation.
   5.4: ‏p_by חייב להיות צד להעברה (from/to), בן/בת זוגם, או הבעלים —
   צד שלישי נדחה בלי אירוע ובלי שינוי במפות הסימון. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { FILL_COUPLES } from "../lib/poker/coupleFills.js";

const SLUG = "guard-link";
const OWNER = "00000000-0000-0000-0000-0000000000bb";
const SESSION_ID = "guard-night";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const PLAN = JSON.stringify([
  { from: "דן לוי", to: "ירין מלאך", amount: 50 },
  { from: "אופיר סנה", to: "נתנאל כהן", amount: 70 },
  { from: "עדן גיל", to: "דן לוי", amount: 40 },
]);

describe("גל 5 — mark_group_payment: אידמפוטנטיות + שער צד־להעברה", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create table public.groups (id uuid primary key, owner_id uuid, name text, slug text,
        data jsonb, live jsonb, config jsonb, updated_at timestamptz default now());
      grant usage on schema public to anon, authenticated;`);
    await db.query(
      `insert into groups(id, owner_id, name, slug, data, live, config) values
       ('00000000-0000-0000-0000-0000000000aa', $1, 'test', $2, $3, $4, $5)`,
      [
        OWNER,
        SLUG,
        JSON.stringify({ sessions: [{ id: SESSION_ID, iso: "2026-11-07", entries: [] }] }),
        JSON.stringify({ players: [] }),
        JSON.stringify({ shareHistory: true }),
      ]
    );
    for (const file of [
      "202609150001_last_settlement_payments.sql",
      "202609250001_receipt_confirmation.sql",
      "202609250002_confirmation_history.sql",
      "202610080001_fix_rpc_sharehistory_leak.sql",
      "202610190001_pot_privacy.sql",
      "202610250001_mark_payment_projection_potpaid.sql",
      "202610300001_wave1_pot_privacy.sql",
      "202611080002_wave5_mark_payment_guard.sql",
    ]) {
      await db.exec(migration(file));
    }
    await db.exec("set role authenticated");
  }, 30000);
  afterAll(async () => { await db?.close(); });

  const storedSession = async () => {
    await db.exec("reset role");
    try {
      const { rows } = await db.query(`select data from groups where slug = $1`, [SLUG]);
      return rows[0].data.sessions.find((s) => s.id === SESSION_ID);
    } finally {
      await db.exec("set role authenticated");
    }
  };
  const mark = (index, paid, field, by) =>
    db.query(`select mark_group_payment($1,$2,$3,$4,$5,$6,$7) as data`, [
      SLUG, SESSION_ID, PLAN, index, paid, field, by,
    ]);
  const eventsFor = async (index, action) =>
    ((await storedSession()).payments?.confirmations || []).filter(
      (e) => e.index === index && e.action === action
    );

  it("5.3: אותה קריאה פעמיים — אירוע אחד; סימון חוזר אחרי ביטול — עוד אחד", async () => {
    await mark(0, true, "paid", "דן לוי");
    await mark(0, true, "paid", "דן לוי"); // retry — לא מכפיל
    expect(await eventsFor(0, "paid")).toHaveLength(1);
    expect((await storedSession()).payments.paid["0"]).toBe(true);

    await mark(0, false, "paid", "דן לוי"); // ביטול — בלי אירוע
    expect(await eventsFor(0, "paid")).toHaveLength(1);
    await mark(0, true, "paid", "דן לוי"); // סימון חדש אמיתי
    expect(await eventsFor(0, "paid")).toHaveLength(2);
  });

  it("5.3: מאשר אחר על אותו ציר — אירוע נוסף (מפתח האידמפוטנטיות כולל by)", async () => {
    await mark(0, true, "received", "ירין מלאך");
    await mark(0, true, "received", "ירין מלאך"); // retry של המקבל
    expect(await eventsFor(0, "received")).toHaveLength(1);
  });

  it("5.4: צד שלישי נדחה — בלי אירוע ובלי שינוי במפת הסימון", async () => {
    const before = await storedSession();
    await expect(mark(1, true, "paid", "שחקן זר")).rejects.toThrow(/not a party/);
    const after = await storedSession();
    expect(after.payments?.paid?.["1"]).toBeFalsy();
    expect(after.payments?.confirmations || []).toEqual(before.payments?.confirmations || []);
  });

  it("5.4: הצדדים הלגיטימיים עוברים — מעביר מסמן paid, מקבל מסמן received", async () => {
    await mark(1, true, "paid", "אופיר סנה");
    await mark(1, true, "received", "נתנאל כהן");
    const sess = await storedSession();
    expect(sess.payments.paid["1"]).toBe(true);
    expect(sess.payments.received["1"]).toBe(true);
  });

  it("כפתור ביטול received: ביטול דרך RPC מחזיר ל־pending בלי אירוע חדש", async () => {
    // אינדקס 1 סומן received בבדיקה הקודמת על ידי נתנאל כהן
    await mark(1, false, "received", "נתנאל כהן");
    const sess = await storedSession();
    expect(sess.payments.received["1"]).toBe(false);
    expect(await eventsFor(1, "received")).toHaveLength(1); // רק אירוע הסימון
    // וסימון מחדש אחרי הביטול הוא סימון חדש — מוסיף אירוע
    await mark(1, true, "received", "נתנאל כהן");
    expect(await eventsFor(1, "received")).toHaveLength(2);
  });

  it("5.4: בן/בת זוג של צד להעברה רשאי לסמן (אותו כלל כמו בממשק)", async () => {
    // אינדקס 2: עדן גיל → דן לוי; אורן גיל היא בת הזוג של המעביר
    await mark(2, true, "paid", "אורן גיל");
    expect((await storedSession()).payments.paid["2"]).toBe(true);
    expect(await eventsFor(2, "paid")).toHaveLength(1);
  });

  it("5.4: כל זוגות FILL_COUPLES — בן הזוג מתקבל, בן זוג של זוג אחר נדחה", async () => {
    for (const [a, b] of FILL_COUPLES) {
      const plan = JSON.stringify([{ from: a, to: "בודק חיצוני", amount: 10 }]);
      const sid = `couple-${a}`;
      await db.exec("reset role");
      const { rows } = await db.query(`select data from groups where slug = $1`, [SLUG]);
      const data = rows[0].data;
      data.sessions.push({ id: sid, iso: "2026-11-07", entries: [] });
      await db.query(`update groups set data = $1 where slug = $2`, [JSON.stringify(data), SLUG]);
      await db.exec("set role authenticated");
      await db.query(`select mark_group_payment($1,$2,$3,0,true,'paid',$4)`, [SLUG, sid, plan, b]);
    }
    // בן זוג מזוג אחר אינו צד להעברה של עדן גיל
    const plan = JSON.stringify([{ from: "עדן גיל", to: "בודק חיצוני", amount: 10 }]);
    await expect(
      db.query(`select mark_group_payment($1,'couple-עדן גיל',$2,0,true,'paid',$3)`, [
        SLUG, plan, FILL_COUPLES[1][1],
      ])
    ).rejects.toThrow(/not a party/);
  });

  it("5.4: הבעלים (auth.uid = owner_id) רשאי לסמן בכל שם", async () => {
    await db.query(`select set_config('app.test_uid', $1, false)`, [OWNER]);
    try {
      await mark(2, true, "received", "המנהל סימן ידנית");
      expect((await storedSession()).payments.received["2"]).toBe(true);
    } finally {
      await db.query(`select set_config('app.test_uid', '', false)`);
    }
  });

  it("5.4: האימות רץ בקואורדינטות הגולמיות אחרי תרגום ההקרנה (שורת קופה ראשונה)", async () => {
    const rawPlan = JSON.stringify([
      { from: "עדן גיל", to: "קופת חיסכון", amount: 60, pot: true },
      { from: "דן לוי", to: "ירין מלאך", amount: 55 },
    ]);
    const projected = JSON.stringify([{ from: "דן לוי", to: "ירין מלאך", amount: 55 }]);
    const sid = "proj-night";
    await db.exec("reset role");
    const { rows } = await db.query(`select data from groups where slug = $1`, [SLUG]);
    const data = rows[0].data;
    data.sessions.push({
      id: sid,
      iso: "2026-11-07",
      entries: [],
      payments: { plan: rawPlan, paid: {}, received: {}, confirmations: [] },
    });
    await db.query(`update groups set data = $1 where slug = $2`, [JSON.stringify(data), SLUG]);
    await db.exec("set role authenticated");
    // אינדקס 0 בהקרנה = אינדקס 1 בגולמי; צד שלישי נדחה גם כאן
    await expect(
      db.query(`select mark_group_payment($1,$2,$3,0,true,'paid',$4)`, [SLUG, sid, projected, "שחקן זר"])
    ).rejects.toThrow(/not a party/);
    // והמעביר האמיתי מתקבל, והסימון נוחת באינדקס הגולמי 1
    await db.query(`select mark_group_payment($1,$2,$3,0,true,'paid',$4)`, [SLUG, sid, projected, "דן לוי"]);
    await db.exec("reset role");
    const { rows: after } = await db.query(`select data from groups where slug = $1`, [SLUG]);
    const stored = after[0].data.sessions.find((s) => s.id === sid);
    expect(stored.payments.paid["1"]).toBe(true);
    expect(stored.payments.plan).toBe(rawPlan);
    await db.exec("set role authenticated");
  });
});
