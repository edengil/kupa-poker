/* F2+F3 — קצה־לקצה של סימון ציבורי מול ה־SQL האמיתי (PGlite):
   הצופה מחזיק רק את הקרנת התוכנית השמורה (בלי שורת הקופה), והשרת חייב
   לקבל את הסימון מול התוכנית הגולמית שבמסד — בלי אימוץ מנהל קודם —
   ולשמר מפתחות נוספים ב־payments (potPaid ומפתח עתידי). */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { paymentPlan, rpcMarkTarget } from "../lib/paymentTracking.js";
import { snapshotForViewer } from "../lib/publicShare.js";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

const SLUG = "test-link";
const SESSION_ID = NIGHT_24_10.id;
const storedSession = {
  ...NIGHT_24_10,
  payments: { ...NIGHT_24_10.payments, potPaid: true, futureKey: "keep-me" },
};

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

describe("mark_group_payment — projection acceptance + key preservation", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create table public.groups (id uuid primary key, name text, slug text,
        data jsonb, live jsonb, config jsonb, updated_at timestamptz default now());
      grant usage on schema public to anon, authenticated;`);
    await db.query(`insert into groups(id,name,slug,data,live,config) values
      ('00000000-0000-0000-0000-0000000000aa','test',$1,$2,$3,$4)`, [
      SLUG,
      JSON.stringify({ sessions: [storedSession, { id: "noplan", iso: "2026-10-24", entries: [] }] }),
      JSON.stringify({ players: [] }),
      JSON.stringify({ shareHistory: true }),
    ]);
    for (const file of [
      "202609150001_last_settlement_payments.sql",
      "202609250001_receipt_confirmation.sql",
      "202609250002_confirmation_history.sql",
      "202610080001_fix_rpc_sharehistory_leak.sql",
      "202610190001_pot_privacy.sql",
      "202610250001_mark_payment_projection_potpaid.sql",
      "202610300001_wave1_pot_privacy.sql",
    ]) {
      await db.exec(migration(file));
      await db.exec(migration(file)); // Safe to apply twice.
    }
  }, 30000);
  afterAll(async () => { await db?.close(); });

  /* מגל 1 התגובה של ה־RPC מוקרנת לצופה — טענות על שמירת נתונים באחסון
     (potPaid, מפתח עתידי, התוכנית הגולמית) נקראות מהטבלה עצמה, בתפקיד
     הבעלים (לטבלת groups אין grant ל־authenticated), ואז התפקיד מוחזר. */
  const storedData = async () => {
    await db.exec("reset role");
    try {
      return (await db.query(`select data from groups where slug = $1`, [SLUG])).rows[0].data;
    } finally {
      await db.exec("set role authenticated");
    }
  };

  const callMark = (fingerprint, index, field = "paid", by = "נתנאל כהן") =>
    db.query(`select mark_group_payment($1,$2,$3,$4,true,$5,$6) as data`, [
      SLUG,
      SESSION_ID,
      fingerprint,
      index,
      field,
      by,
    ]);
  const sessionOf = (data) => data.sessions.find((s) => s.id === SESSION_ID);

  it("F2: סימון צופה עם fingerprint מוקרן מתקבל ומתורגם לקואורדינטות הגולמיות", async () => {
    await db.exec("set role authenticated");
    try {
      // נתיב הלקוח האמיתי: הקרנת צופה → יעד RPC
      const snap = { id: "g", data: { sessions: [storedSession] }, config: { shareHistory: true } };
      const viewerSession = snapshotForViewer(snap).data.sessions[0];
      const target = rpcMarkTarget(viewerSession, 1); // נתנאל→אופיר בתוכנית הנוכחית
      expect(target).not.toBeNull();
      expect(target.fingerprint).not.toContain("קופת חיסכון");

      const { rows } = await callMark(target.fingerprint, target.index);
      const sess = sessionOf(rows[0].data);
      // הסימון נחת באינדקס הגולמי של נתנאל→אופיר (0 בתוכנית הלילה)
      expect(sess.payments.paid["0"]).toBe(true);
      // התגובה לצופה היא ההקרנה (בלי שורת הקופה) — והתוכנית הגולמית
      // באחסון לא הוחלפה בהקרנה
      expect(JSON.parse(sess.payments.plan).some((t) => t.pot)).toBe(false);
      expect(sessionOf(await storedData()).payments.plan).toBe(NIGHT_24_10.payments.plan);
      // האישור נרשם בקואורדינטות הגולמיות
      expect(sess.payments.confirmations).toEqual(
        expect.arrayContaining([expect.objectContaining({ index: 0, action: "paid", by: "נתנאל כהן" })])
      );
      // ובצד המנהל הסימון נראה על ההעברה בתוכנית הנוכחית (אינדקס 1)
      expect(paymentPlan(sess).paid[1]).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });

  it("F3: potPaid ומפתח עתידי שורדים סימון ציבורי באחסון — בהקרנה וגם בגולמי", async () => {
    await db.exec("set role authenticated");
    try {
      const projected = JSON.parse(
        snapshotForViewer({ id: "g", data: { sessions: [storedSession] }, config: { shareHistory: true } })
          .data.sessions[0].payments.plan
      );
      await callMark(JSON.stringify(projected), 2, "received", "אופיר סנה");
      /* התגובה מוקרנת לצופה (גל 1) — השמירה נבדקת באחסון עצמו */
      const afterProjected = sessionOf(await storedData());
      expect(afterProjected.payments.received["2"]).toBe(true);
      expect(afterProjected.payments.potPaid).toBe(true);
      expect(afterProjected.payments.futureKey).toBe("keep-me");

      await callMark(NIGHT_24_10.payments.plan, 3, "paid", "עדן גיל");
      const raw = sessionOf(await storedData());
      expect(raw.payments.paid["3"]).toBe(true);
      expect(raw.payments.potPaid).toBe(true);
      expect(raw.payments.futureKey).toBe("keep-me");
      expect(raw.payments.plan).toBe(NIGHT_24_10.payments.plan);
    } finally {
      await db.exec("reset role");
    }
  });

  it("F2/F5: fingerprint זר עדיין נדחה, ואינדקס מוקרן מחוץ לטווח נדחה", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(
        callMark(JSON.stringify([{ from: "א", to: "ב", amount: 1 }]), 0)
      ).rejects.toThrow(/fingerprint mismatch/);
      const projected = snapshotForViewer({
        id: "g",
        data: { sessions: [storedSession] },
        config: { shareHistory: true },
      }).data.sessions[0].payments.plan;
      await expect(callMark(projected, 99)).rejects.toThrow(/invalid index/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("ערב בלי תוכנית שמורה — הסימון הראשון עדיין יוצר payments כבעבר", async () => {
    await db.exec("set role authenticated");
    try {
      const fp = JSON.stringify([{ from: "א", to: "ב", amount: 50 }]);
      const { rows } = await db.query(`select mark_group_payment($1,'noplan',$2,0,true) as data`, [SLUG, fp]);
      const sess = rows[0].data.sessions.find((s) => s.id === "noplan");
      expect(sess.payments.plan).toBe(fp);
      expect(sess.payments.paid["0"]).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });
});
