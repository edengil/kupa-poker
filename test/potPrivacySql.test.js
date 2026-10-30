/* גל 1 — פרטיות קופה ברמת ה־SQL (PGlite, שרשרת המיגרציות המלאה של
   הפונקציות הציבוריות): צופה לא מקבל שום שדה קופה או coupleFills — לא
   מ־public_group, לא מתגובת mark_group_payment ולא מתגובת
   vote_player_of_night — בשום מצב shareHistory. הנתונים השמורים עצמם
   לא משתנים (הקרנה/תגובה בלבד), ו־potPaid שורד באחסון סימון ציבורי. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

/* שרשרת הפונקציות הציבוריות בסדר כרונולוגי — כולל מיגרציות האבטחה
   20261008 (סינון RPC), 20261019 (פרטיות קופה חלקית) ו־20261025 (סימון
   מוקרן), שהרתמה הישנה לא טענה ולכן הרגרסיה של 25.10 לא נתפסה בה. */
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
];

const POT_PLAN = JSON.stringify([
  { from: "נתנאל כהן", to: "אורן גיל", amount: 150 },
  { from: "עדן גיל", to: "קופת חיסכון", amount: 93, pot: true },
  { from: "עדן גיל", to: "אורן גיל", amount: 285 },
]);
const PROJECTED_PLAN = JSON.stringify([
  { from: "נתנאל כהן", to: "אורן גיל", amount: 150 },
  { from: "עדן גיל", to: "אורן גיל", amount: 285 },
]);

function potData() {
  return {
    savingsPot: 163,
    savingsWithdrawals: [{ label: "מפת פוקר", amount: 30 }],
    aliases: { "דני": "דן ינקלויץ" },
    plan: { iso: "2026-10-24" },
    yearly: [{ y: 2026 }],
    monthly: [],
    roster: ["עדן גיל"],
    sessions: [
      {
        id: "old-pot", iso: "2026-10-10", endedAt: 1000,
        entries: [{ name: "עדן גיל", amount: -70 }],
        savingsPot: 70, savingsPotActual: 70,
      },
      {
        id: "pot-night", iso: "2026-10-24", endedAt: 2000,
        entries: [{ name: "עדן גיל" }, { name: "אורן גיל" }, { name: "נתנאל כהן" }],
        savingsPot: 93, savingsPotActual: 70,
        coupleFills: [{ from: "עדן גיל", to: "אורן גיל", amount: 285 }],
        manualSettlement: { shortfall: { "אורן גיל": 13 }, frozenActual: 70 },
        payments: {
          plan: POT_PLAN,
          paid: { "0": true, "2": true },
          received: { "2": true },
          confirmations: [
            { index: 2, action: "paid", by: "אורן גיל", at: "2026-10-25T00:00:00.000Z" },
            { index: -1, action: "paid", by: "עדן גיל", pot: true, at: "2026-10-25T00:00:00.000Z" },
          ],
          potPaid: true,
        },
      },
    ],
  };
}

function potLive() {
  return {
    players: [{ name: "עדן גיל", buyin: 200, cashout: "" }],
    cps: 2,
    savingsPot: 25,
    potDraft: { amount: 93 },
    coupleFills: [{ from: "עדן גיל", to: "אורן גיל", amount: 100 }],
  };
}

const FORBIDDEN = ["savingsPot", "savingsPotActual", "savingsWithdrawals", "frozenActual", "potPaid", "potDraft", "coupleFills", "קופת חיסכון"];
function expectNoPotLeaks(value, label) {
  const s = JSON.stringify(value);
  for (const token of FORBIDDEN) {
    expect(s, `${label} leaks ${token}`).not.toContain(token);
  }
}

describe("wave1 pot privacy SQL", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
      create table public.groups (id uuid primary key, name text, slug text,
        data jsonb, live jsonb, config jsonb, updated_at timestamptz default now());
      grant usage on schema public to anon, authenticated;`);
    await db.query(`insert into groups(id,name,slug,data,live,config) values
      ('00000000-0000-0000-0000-0000000000b1','test','pot-link',$1,$2,$3),
      ('00000000-0000-0000-0000-0000000000b2','test','pot-hidden',$4,$5,$6)`, [
      JSON.stringify(potData()),
      JSON.stringify(potLive()),
      JSON.stringify({ shareHistory: true, chipsPerShekel: 2 }),
      JSON.stringify(potData()),
      JSON.stringify(potLive()),
      JSON.stringify({ shareHistory: false, chipsPerShekel: 2 }),
    ]);
    for (const file of CHAIN) {
      await db.exec(migration(file));
      await db.exec(migration(file)); // Safe to apply twice.
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });

  /* קריאת האחסון הגולמי בתפקיד הבעלים (אין grant ל־authenticated על
     הטבלה), עם החזרת התפקיד ל־authenticated לקריאות הצופה שאחריה. */
  const stored = async (slug) => {
    await db.exec("reset role");
    try {
      return (await db.query(`select data, live from groups where slug = $1`, [slug])).rows[0];
    } finally {
      await db.exec("set role authenticated");
    }
  };

  it("public_group (shareHistory=true): כל שדות הקופה והמילויים מוסרים מהערבים ומהלייב", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(`select * from public_group('pot-link')`);
      const row = rows[0];
      expectNoPotLeaks(row, "public_group(true)");
      expect(row.data.sessions).toHaveLength(2);
      const night = row.data.sessions.find((s) => s.id === "pot-night");
      expect(night.manualSettlement).toEqual({ shortfall: { "אורן גיל": 13 } });
      const plan = JSON.parse(night.payments.plan);
      expect(plan).toEqual(JSON.parse(PROJECTED_PLAN));
      /* הסימונים ממופים לקואורדינטות המוקרנות: גולמי {0,2} -> מוקרן {0,1} */
      expect(night.payments.paid).toEqual({ "0": true, "1": true });
      expect(night.payments.received).toEqual({ "1": true });
      expect(night.payments.confirmations).toEqual([
        { index: 1, action: "paid", by: "אורן גיל", at: "2026-10-25T00:00:00.000Z" },
      ]);
      expect(row.live.players).toHaveLength(1);
      expect(row.live.cps).toBe(2);
      const v2 = (await db.query(`select * from public_group_v2('pot-link')`)).rows[0];
      expect(v2.data).toEqual(row.data);
      expect(v2.live).toEqual(row.live);
    } finally { await db.exec("reset role"); }
  });

  it("public_group (shareHistory=false): ערב אחרון מוקרן + כינויים — לא sessions ריק", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(`select * from public_group('pot-hidden')`);
      const row = rows[0];
      expectNoPotLeaks(row, "public_group(false)");
      expect(row.data.sessions).toHaveLength(1);
      expect(row.data.sessions[0].id).toBe("pot-night");
      expect(row.data.aliases).toEqual({ "דני": "דן ינקלויץ" });
      expect(row.data.yearly).toEqual([]);
      expect(row.data.roster).toEqual([]);
      expect(row.data.plan).toEqual({ iso: "2026-10-24" });
    } finally { await db.exec("reset role"); }
  });

  it("ההקרנה לא נוגעת באחסון: הנתונים השמורים נשארים מלאים", async () => {
    const s = await stored("pot-link");
    const night = s.data.sessions.find((x) => x.id === "pot-night");
    expect(s.data.savingsPot).toBe(163);
    expect(night.savingsPotActual).toBe(70);
    expect(night.coupleFills).toHaveLength(1);
    expect(night.manualSettlement.frozenActual).toBe(70);
    expect(night.payments.plan).toBe(POT_PLAN);
    expect(night.payments.potPaid).toBe(true);
    expect(s.live.coupleFills).toHaveLength(1);
    expect(s.live.savingsPot).toBe(25);
  });

  it("mark_group_payment: התגובה מוקרנת־קופה, הסימון נשמר בגולמי ו־potPaid שורד", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(
        `select mark_group_payment('pot-link','pot-night',$1,1,true,'paid','אורן גיל') as data`,
        [PROJECTED_PLAN]
      );
      const data = rows[0].data;
      expectNoPotLeaks(data, "mark response");
      const night = data.sessions.find((s) => s.id === "pot-night");
      expect(night.payments.paid).toEqual({ "0": true, "1": true });

      const s = await stored("pot-link");
      const storedNight = s.data.sessions.find((x) => x.id === "pot-night");
      expect(storedNight.payments.plan).toBe(POT_PLAN);
      expect(storedNight.payments.paid).toEqual({ "0": true, "2": true });
      expect(storedNight.payments.potPaid).toBe(true);
      /* אירוע האישור החדש נרשם בקואורדינטות הגולמיות, ואירוע הקופה נשמר */
      expect(storedNight.payments.confirmations).toHaveLength(3);
      expect(storedNight.payments.confirmations[2]).toMatchObject({ index: 2, action: "paid", by: "אורן גיל" });
      expect(storedNight.payments.confirmations[1].pot).toBe(true);
    } finally { await db.exec("reset role"); }
  });

  it("mark_group_payment ב־shareHistory=false: התגובה מכילה רק את הערב האחרון, מוקרן", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(
        `select mark_group_payment('pot-hidden','pot-night',$1,0,true) as data`,
        [PROJECTED_PLAN]
      );
      expectNoPotLeaks(rows[0].data, "mark response (hidden)");
      expect(rows[0].data.sessions).toHaveLength(1);
      expect(rows[0].data.sessions[0].id).toBe("pot-night");
    } finally { await db.exec("reset role"); }
  });

  it("vote_player_of_night: התגובה מסוננת, ההצבעה נשמרת באחסון", async () => {
    await db.exec("set role authenticated");
    try {
      const { rows } = await db.query(
        `select vote_player_of_night('pot-link','pot-night','אורן גיל','דני') as data`
      );
      expectNoPotLeaks(rows[0].data, "vote response");
      const s = await stored("pot-link");
      const night = s.data.sessions.find((x) => x.id === "pot-night");
      expect(night.playerOfNightVotes).toEqual({ "דני": "אורן גיל" });
      expect(night.savingsPotActual).toBe(70);
    } finally { await db.exec("reset role"); }
  });
});
