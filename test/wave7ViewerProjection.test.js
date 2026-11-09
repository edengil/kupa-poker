/* גל 7, פריט 7.3 — הקרנת צופה אחת: השוואת SQL↔JS שדה־שדה.

   עד הגל חיו שתי רשימות הסרה נפרדות (JS ב־publicShare.js, SQL
   במיגרציות). מעכשיו הרשימה מוגדרת פעם אחת ב־lib/viewerProjection.js,
   ובדיקה זו מוודאת ששני הצדדים מיישמים אותה בדיוק:
   - צד ה־SQL מריץ את שרשרת המיגרציות המלאה ב־PGlite וקורא
     public_group / filter_shared_group_data / project_session_for_viewer
     האמיתיות (כולל מיגרציית 202611090001 של הגל).
   - צד ה־JS מריץ את snapshotForViewer האמיתי מאותו פיקסצ'רה.
   - הפלטים חייבים להיות זהים שדה־שדה, בשני מצבי shareHistory.

   כלל potPaid האחיד (viewerProjection.js): נשמר באחסון תמיד, מוסר מכל
   הקרנת צופה בשני הצדדים — גם כשה־plan לא מכיל העברת קופה (שם צד
   ה־JS מחזיר את ה־payments כמו שהוא, וה־SQL מסיר תמיד; הכיסוי כאן
   נועד לוודא שבשני הצדדים התוצאה זהה: לא מוקרן). */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { snapshotForViewer } from "../lib/publicShare.js";
import {
  VIEWER_DATA_STRIP_KEYS,
  VIEWER_LIVE_STRIP_KEYS,
  VIEWER_MANUAL_SETTLEMENT_STRIP_KEYS,
  VIEWER_SESSION_STRIP_KEYS,
} from "../lib/viewerProjection.js";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

/* אותה שרשרת של רתמת potPrivacySql — בסדר כרונולוגי מלא. */
const CHAIN = [
  "202609090001_public_history.sql",
  "202609150001_last_settlement_payments.sql",
  "202609250001_receipt_confirmation.sql",
  "202609250002_confirmation_history.sql",
  "202610010001_player_of_night_vote.sql",
  "202610080001_fix_rpc_sharehistory_leak.sql",
  "202610190001_pot_privacy.sql",
  "202610250001_mark_payment_projection_potpaid.sql",
  "202610300001_wave1_pot_privacy.sql",
  "202610300002_wave2b_stamp_sid_privacy.sql",
  "202610300003_wave2b_applied_privacy.sql",
  "202610300004_wave2_frozen_flags_privacy.sql",
  "202611090001_wave7_viewer_projection_unified.sql",
];

/* פיקסצ'רה עשיר — manualSettlement מלא (חוסר + כל סימוני ההקפאה),
   payments עם ובלי העברת קופה ב־plan, potPaid, אירועי קנייה עם sid
   ב־entries, ב־players וב־live, וערב ישן שני כדי שסדר/סינון ייבחנו. */
function richData() {
  return {
    savingsPot: 200,
    savingsWithdrawals: [{ label: "מפת פוקר", amount: 30 }],
    aliases: { "דני": "דן ינקלויץ" },
    plan: { iso: "2026-11-07" },
    yearly: [{ y: 2026 }],
    monthly: [{ y: 2026, mo: 11 }],
    roster: ["עדן גיל", "אורן גיל"],
    sessions: [
      {
        id: "old-night", iso: "2026-10-31", endedAt: 1000,
        entries: [{ name: "עדן גיל", amount: -50 }],
        savingsPot: 50, savingsPotActual: 50,
      },
      {
        id: "rich-night", iso: "2026-11-07", endedAt: 2000,
        entries: [
          {
            name: "עדן גיל",
            buyinEvents: [
              { amount: 550, at: 1700000000000, total: 550, pot: 27.5, sid: "wamid.RICH:0" },
              { amount: 100, at: 1700000060000, total: 650, sid: "wamid.RICH:1" },
            ],
          },
          { name: "אורן גיל", amount: 320 },
        ],
        players: [
          { name: "עדן גיל", buyin: 650, buyinEvents: [{ amount: 650, at: 1700000060000, total: 650 }] },
          { name: "אורן גיל", buyin: 300 },
        ],
        savingsPot: 93, savingsPotActual: 70,
        coupleFills: [{ from: "עדן גיל", to: "אורן גיל", amount: 285 }],
        manualSettlement: {
          shortfall: { "אורן גיל": 13 },
          note: "סוכם בטלפון",
          frozenActual: 70, frozenReal: true, frozenAuto: false,
        },
        payments: {
          /* תוכנית שמורה = מחרוזת (fingerprint), כמו באחסון האמיתי —
             storedPlanTransfers ב־JS קורא רק מחרוזת, וה־SQL מטפל
             במערך גולמי בעדינות (מצב שאינו קיים באחסון). */
          plan: JSON.stringify([
            { from: "נתנאל כהן", to: "אורן גיל", amount: 150 },
            { from: "עדן גיל", to: "קופה", amount: 93, pot: true },
            { from: "עדן גיל", to: "אורן גיל", amount: 285, residual: true },
            { from: "קובי סעדה", to: "דן ינקלויץ", amount: 70, manual: true },
          ]),
          paid: { "0": true, "2": true, "3": true },
          received: { "2": true },
          confirmations: [
            { index: 2, action: "paid", by: "אורן גיל", at: "2026-11-08T00:00:00.000Z" },
            { index: -1, action: "received", by: "עדן גיל", pot: true, at: "2026-11-08T00:00:00.000Z" },
            { index: 3, action: "paid", by: "קובי סעדה", at: "2026-11-08T01:00:00.000Z" },
          ],
          potPaid: true,
        },
      },
      {
        /* ערב עם potPaid אבל plan שרת בלי שום העברת קופה —
           מקרה־הקצה שהכלל האחיד נועד לסגור בשני הצדדים. */
        id: "plain-night", iso: "2026-11-01", endedAt: 1500,
        entries: [{ name: "דן ינקלויץ", amount: 40 }],
        payments: {
          plan: JSON.stringify([
            { from: "דן ינקלויץ", to: "עדן גיל", amount: 40 },
          ]),
          paid: { "0": true },
          received: {},
          confirmations: [],
          potPaid: true,
        },
      },
    ],
  };
}

function richLive() {
  return {
    players: [
      {
        name: "עדן גיל", buyin: 200, cashout: "",
        buyinEvents: [{ amount: 200, at: 1700000000000, total: 200, pot: 10, sid: "wamid.LIVE7:0" }],
      },
    ],
    applied: { "wamid.ZZZ": [{ t: "add", name: "עדן גיל", delta: 200 }] },
    cps: 2,
    savingsPot: 25,
    savingsPotActual: 20,
    savingsWithdrawals: [{ label: "מפת פוקר", amount: 30 }],
    potDraft: { amount: 93 },
    frozenActual: 70,
    potPaid: true,
    coupleFills: [{ from: "עדן גיל", to: "אורן גיל", amount: 100 }],
    startedAt: 1700000000000,
  };
}

/* סידור מפתחות רקורסיבי להשוואה יציבה (סדר מפתחות אינו תוכן).
   מחרוזות שהן JSON של מערך/אובייקט (מחרוזת התוכנית השמורה ב־payments)
   מנורמלות דרך parse+stringify: שני הצדדים כותבים את אותה תוכנית
   בפורמט JSON שונה (JS צפוף, SQL עם רווחים) — תוכן התוכנית זהה,
   הפורמט הוא פרט מימוש, וההשוואה כאן היא על שדות ותוכן. */
function tryParseJson(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t.startsWith("[") && !t.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function sortDeep(v) {
  const parsed = tryParseJson(v);
  if (parsed !== null) return sortDeep(parsed);
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
const canonEq = (a, b) => expect(sortDeep(a)).toEqual(sortDeep(b));

describe("wave7 7.3 — הקרנת צופה SQL↔JS", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create table public.groups (id uuid primary key, name text, slug text,
        data jsonb, live jsonb, config jsonb, updated_at timestamptz default now());
      grant usage on schema public to anon, authenticated;`);
    await db.query(
      `insert into groups(id,name,slug,data,live,config) values
        ('00000000-0000-0000-0000-0000000007a1','test','w7-link',$1,$2,$3),
        ('00000000-0000-0000-0000-0000000007a2','test','w7-hidden',$4,$5,$6)`,
      [
        JSON.stringify(richData()), JSON.stringify(richLive()),
        JSON.stringify({ shareHistory: true, chipsPerShekel: 2 }),
        JSON.stringify(richData()), JSON.stringify(richLive()),
        JSON.stringify({ shareHistory: false, chipsPerShekel: 2 }),
      ]
    );
    for (const file of CHAIN) {
      await db.exec(migration(file));
      await db.exec(migration(file)); // Safe to apply twice.
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });

  const sqlView = async (slug) => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(`select * from public_group($1)`, [slug]);
      return rows[0];
    } finally {
      await db.exec("reset role");
    }
  };

  it("רשימת־ההסרה האחת מכילה את כל המפתחות המוצהרים", () => {
    expect([...VIEWER_SESSION_STRIP_KEYS].sort()).toEqual(
      ["coupleFills", "savingsPot", "savingsPotActual"].sort()
    );
    expect([...VIEWER_MANUAL_SETTLEMENT_STRIP_KEYS].sort()).toEqual(
      ["frozenActual", "frozenAuto", "frozenReal"].sort()
    );
    expect([...VIEWER_DATA_STRIP_KEYS].sort()).toEqual(
      ["savingsPot", "savingsWithdrawals"].sort()
    );
    expect([...VIEWER_LIVE_STRIP_KEYS].sort()).toEqual(
      ["applied", "coupleFills", "frozenActual", "potDraft", "potPaid", "savingsPot", "savingsPotActual", "savingsWithdrawals"].sort()
    );
  });

  it("shareHistory=true: פלט SQL זהה לפלט JS שדה־שדה (data + live)", async () => {
    const sql = await sqlView("w7-link");
    const js = snapshotForViewer({
      data: richData(),
      live: richLive(),
      config: { shareHistory: true, chipsPerShekel: 2 },
    });
    canonEq(sql.data, js.data);
    canonEq(sql.live, js.live);
    /* והערב העשיר אכן מוקרן כמצופה, לא רק זהה בין הצדדים: */
    const night = js.data.sessions.find((s) => s.id === "rich-night");
    expect(night.manualSettlement).toEqual({ shortfall: { "אורן גיל": 13 }, note: "סוכם בטלפון" });
    expect(night.payments.potPaid).toBeUndefined();
    expect(night.entries[0].buyinEvents).toEqual([
      { amount: 550, at: 1700000000000, total: 550, pot: 27.5 },
      { amount: 100, at: 1700000060000, total: 650 },
    ]);
    const plan = typeof night.payments.plan === "string" ? JSON.parse(night.payments.plan) : night.payments.plan;
    expect(night.payments.paid).toEqual({ "0": true, "1": true });
    /* ההפחתה הנצפית בשני הצדדים: pot וגם residual יוצאים מהקרנת
       הצופה (הקרנה אחת — project_payments_for_viewer מסנן את שניהם,
       וגם ה־JS). נשארות שתי ההעברות הרגילות. */
    expect(plan).toEqual([
      { from: "נתנאל כהן", to: "אורן גיל", amount: 150 },
      { from: "קובי סעדה", to: "דן ינקלויץ", amount: 70, manual: true },
    ]);
    expect(js.live.potPaid).toBeUndefined();
    expect(js.live.players[0].buyinEvents).toEqual([
      { amount: 200, at: 1700000000000, total: 200, pot: 10 },
    ]);
  });

  it("shareHistory=false: פלט SQL זהה לפלט JS שדה־שדה — ערב אחרון מוקרן, בלי sid", async () => {
    const sql = await sqlView("w7-hidden");
    const js = snapshotForViewer({
      data: richData(),
      live: richLive(),
      config: { shareHistory: false, chipsPerShekel: 2 },
    });
    canonEq(sql.data, js.data);
    canonEq(sql.live, js.live);
    expect(sql.data.sessions).toHaveLength(1);
    expect(sql.data.sessions[0].id).toBe("rich-night");
    expect(JSON.stringify(sql.data)).not.toContain('"sid"');
    expect(sql.data.sessions[0].payments.potPaid).toBeUndefined();
  });

  it("potPaid בלי העברת קופה ב־plan: מוסר בשני הצדדים (כלל אחיד)", async () => {
    const sql = await sqlView("w7-link");
    const js = snapshotForViewer({
      data: richData(),
      live: richLive(),
      config: { shareHistory: true, chipsPerShekel: 2 },
    });
    const sqlPlain = sql.data.sessions.find((s) => s.id === "plain-night");
    const jsPlain = js.data.sessions.find((s) => s.id === "plain-night");
    expect(sqlPlain.payments.potPaid).toBeUndefined();
    expect(jsPlain.payments.potPaid).toBeUndefined();
    canonEq(sqlPlain, jsPlain);
  });

  it("project_session_for_viewer ישירות: זהה לערב המוקרן של ה־JS", async () => {
    const rich = richData().sessions.find((s) => s.id === "rich-night");
    /* הפונקציה הפנימית נטולת grant ל־authenticated (by design — רק
       filter/public_group חשופים) — הקריאה כאן בתפקיד הבעלים. */
    let sqlSess;
    const { rows } = await db.query(
      `select public.project_session_for_viewer($1::jsonb) as s`,
      [JSON.stringify(rich)]
    );
    sqlSess = rows[0].s;
    const js = snapshotForViewer({
      data: { ...richData(), sessions: [rich] },
      config: { shareHistory: true, chipsPerShekel: 2 },
    });
    canonEq(sqlSess, js.data.sessions[0]);
  });

  it("האחסון לא נגע: potPaid ושדות הקופה שורדים בגולמי", async () => {
    const { rows } = await db.query(`select data, live from groups where slug = 'w7-link'`);
    const storedData = rows[0].data;
    const rich = storedData.sessions.find((s) => s.id === "rich-night");
    expect(rich.payments.potPaid).toBe(true);
    expect(rich.manualSettlement.frozenActual).toBe(70);
    expect(storedData.savingsPot).toBe(200);
    expect(rows[0].live.potPaid).toBe(true);
  });
});
