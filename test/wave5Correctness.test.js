import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AL, toWhatsApp } from "../lib/poker/helpers.js";
import { parseEntries, parseDate } from "../lib/poker/parse.js";
import { applySessionEdit } from "../lib/sessionEdit.js";
import { paymentPlan, rpcMarkTarget, saveManualPayments } from "../lib/paymentTracking.js";
import { applyCoupleFill } from "../lib/poker/coupleFills.js";
import { castRsvpVote } from "../lib/rsvpVote.js";
import { writeReminderStamp } from "../lib/wa/reminderWrite.js";

/* ============================================================================
   גל 5א — נכונות (ממצאי ביקורת 11, 20, 24, 25 + חותמת תזכורת מגל 3ב).
   כל בדיקה כאן נכשלת על הקוד שלפני הגל ומוכיחה את התיקון.
   ============================================================================ */

describe("finding 11 — edit sheet no longer destroys saved nights", () => {
  it("parseEntries keeps decimals instead of truncating to integers", () => {
    const entries = parseEntries("סיכום פוקר 1.8\nאופיר סנה מגיע 320.5\nקובי סעדה חייב 320.5");
    expect(entries).toEqual([
      { name: "אופיר סנה", amount: 320.5, combined: false },
      { name: "קובי סעדה", amount: -320.5, combined: false },
    ]);
  });

  it("parseEntries reads back the באפס line toWhatsApp prints for a zero player", () => {
    const entries = parseEntries("סיכום פוקר 1.8\nירין מלאך סגר באפס");
    expect(entries).toEqual([{ name: "ירין מלאך", amount: 0, combined: false }]);
  });

  it("open + save with NO changes is a full identity on a night with decimals and all fields", () => {
    const session = {
      id: "s1",
      iso: "2026-10-24",
      d: 24,
      mo: 10,
      y: 2026,
      cps: 2,
      entries: [
        {
          name: "אופיר סנה",
          amount: 320.5,
          buyin: 250,
          chips: 1530,
          tipsGiven: 20,
          buyinEvents: [{ amount: 100 }, { amount: 150 }],
        },
        { name: "דן ינקלויץ", amount: 100, buyin: 150, chips: 500, tipsGiven: 0 },
        { name: "ירין מלאך", amount: 0, buyin: 150, chips: 300, tipsGiven: 5 },
        { name: "קובי סעדה", amount: -400, buyin: 400, chips: 0, tipsGiven: 10 },
      ],
    };
    const db = { sessions: [session], aliases: {} };
    /* בדיוק זרימת הגיליון: seed מטקסט הוואטסאפ, פרסור חזרה, שמירה */
    const text = toWhatsApp(session.entries, session, null, AL(db));
    const parsed = parseEntries(text);
    const out = applySessionEdit(db, session, {
      raw: text.trim(),
      entries: parsed,
      date: parseDate(text, session.y),
    });
    const saved = out.sessions.find((s) => s.id === "s1");
    expect(saved.entries).toEqual(session.entries);
    expect(saved.iso).toBe("2026-10-24");
  });

  it("preserves buyin/chips/tipsGiven by name on an amount edit; new players stay bare, removed players go", () => {
    const session = {
      id: "s2",
      iso: "2026-09-14",
      d: 14,
      mo: 9,
      y: 2026,
      entries: [
        { name: "עדן גיל", amount: 100, buyin: 200, chips: 600, tipsGiven: 15 },
        { name: "אורן גיל", amount: -100, buyin: 100, chips: 0, tipsGiven: 0 },
      ],
    };
    const db = { sessions: [session], aliases: {} };
    const out = applySessionEdit(db, session, {
      raw: "x",
      entries: [
        { name: "עדן גיל", amount: 120, combined: false },
        { name: "שחקן חדש", amount: -120, combined: false },
      ],
      date: { d: 14, mo: 9, y: 2026, iso: "2026-09-14" },
    });
    const saved = out.sessions.find((s) => s.id === "s2");
    expect(saved.entries).toEqual([
      { name: "עדן גיל", amount: 120, buyin: 200, chips: 600, tipsGiven: 15 },
      { name: "שחקן חדש", amount: -120, combined: false },
    ]);
  });
});

describe("finding 20 — rpcMarkTarget maps duplicate transfers positionally", () => {
  const base = {
    iso: "2026-07-26",
    cps: 2,
    entries: [
      { name: "א", amount: -100, buyin: 100, chips: 0 },
      { name: "ב", amount: 100, buyin: 50, chips: 300 },
    ],
  };
  /* שני תשלומים ידניים זהים (א→ב 40 ×2) + יתרה 20 — התוכנית המחושבת
     מכילה את אותה זהות העברה פעמיים, כמו שני תשלומי ביט זהים. */
  const withManual = saveManualPayments(base, [
    { from: "א", to: "ב", amount: 40 },
    { from: "א", to: "ב", amount: 40 },
  ]);
  const oldPlan = JSON.stringify([
    { from: "א", to: "ב", amount: 20 },
    { from: "א", to: "ב", amount: 40 },
    { from: "א", to: "ב", amount: 40 },
  ]);
  const session = {
    ...withManual,
    payments: { ...(withManual.payments || {}), plan: oldPlan, paid: {}, received: {}, confirmations: [] },
  };

  it("the computed plan really holds the identical transfer twice", () => {
    const plan = paymentPlan(session);
    const forties = plan.transfers.filter((t) => t.from === "א" && t.to === "ב" && t.amount === 40);
    expect(forties).toHaveLength(2);
  });

  it("first occurrence → first stored index, second occurrence → second stored index", () => {
    const plan = paymentPlan(session);
    const idxs = plan.transfers
      .map((t, i) => (t.amount === 40 ? i : -1))
      .filter((i) => i !== -1);
    expect(idxs).toHaveLength(2);
    expect(rpcMarkTarget(session, idxs[0])).toEqual({ fingerprint: oldPlan, index: 1 });
    expect(rpcMarkTarget(session, idxs[1])).toEqual({ fingerprint: oldPlan, index: 2 });
    const twenty = plan.transfers.findIndex((t) => t.amount === 20);
    expect(rpcMarkTarget(session, twenty)).toEqual({ fingerprint: oldPlan, index: 0 });
  });

  it("a duplicate the stored plan holds only once has no target for its second occurrence", () => {
    const shortPlan = JSON.stringify([
      { from: "א", to: "ב", amount: 40 },
      { from: "א", to: "ב", amount: 20 },
    ]);
    const s2 = { ...session, payments: { ...session.payments, plan: shortPlan } };
    const plan = paymentPlan(s2);
    const idxs = plan.transfers
      .map((t, i) => (t.amount === 40 ? i : -1))
      .filter((i) => i !== -1);
    expect(rpcMarkTarget(s2, idxs[0])).toEqual({ fingerprint: shortPlan, index: 0 });
    expect(rpcMarkTarget(s2, idxs[1])).toBeNull();
  });
});

describe("finding 24 — couple fill never moves real money on one side only", () => {
  const playing = (name) => ({ name, buyin: 100, cashout: "" });
  const cashed = (name, chips) => ({ name, buyin: 100, cashout: String(chips) });

  it("both still playing: fill is a symmetric stackAdj record, cashouts untouched", () => {
    const players = [playing("עדן גיל"), playing("אורן גיל")];
    const res = applyCoupleFill(players, "עדן גיל", 30);
    expect(res.ok).toBe(true);
    expect(res.players[0].stackAdj).toBe(-30);
    expect(res.players[1].stackAdj).toBe(30);
    expect(res.players[0].cashout).toBe("");
    expect(res.players[1].cashout).toBe("");
  });

  it("giver already cashed out, partner still playing: rejected, nothing moves", () => {
    const players = [cashed("עדן גיל", 500), playing("אורן גיל")];
    const res = applyCoupleFill(players, "עדן גיל", 30);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("partner_cashed");
    expect(res.players).toBeUndefined();
    expect(players[0].cashout).toBe("500");
    expect(players[1].stackAdj).toBeUndefined();
  });

  it("receiver already cashed out, giver still playing: rejected, nothing moves", () => {
    const players = [playing("עדן גיל"), cashed("אורן גיל", 300)];
    const res = applyCoupleFill(players, "עדן גיל", 30);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("partner_cashed");
    expect(players[0].stackAdj).toBeUndefined();
    expect(players[1].cashout).toBe("300");
  });

  it("both cashed out: the symmetric cashout move still works, chips conserved", () => {
    const players = [cashed("עדן גיל", 500), cashed("אורן גיל", 300)];
    const before = players.reduce((s, p) => s + (+p.cashout || 0), 0);
    const res = applyCoupleFill(players, "עדן גיל", 30);
    expect(res.ok).toBe(true);
    expect(res.players[0].cashout).toBe("470");
    expect(res.players[1].cashout).toBe("330");
    const after = res.players.reduce((s, p) => s + (+p.cashout || 0), 0);
    expect(after).toBe(before);
  });
});

describe("finding 25 — RSVP vote is shown as success only when it landed", () => {
  const user = { id: "u1", email: "a@b.c", user_metadata: { full_name: "שחקן" } };
  const args = { groupId: "g1", planIso: "2026-11-01", user, status: "yes" };

  function fakeSupabase({ upsertError = null, rows = [], readError = null } = {}) {
    return {
      from: () => ({
        upsert: async () => ({ error: upsertError }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: async () => ({ data: rows, error: readError }),
            }),
          }),
        }),
      }),
    };
  }

  it("write landed and verified → ok", async () => {
    const sb = fakeSupabase({ rows: [{ user_id: "u1", status: "yes" }] });
    expect(await castRsvpVote(sb, args)).toEqual({ ok: true });
  });

  it("upsert failed → not ok (the pre-fix UI celebrated exactly this)", async () => {
    const sb = fakeSupabase({ upsertError: { message: "rls" }, rows: [{ user_id: "u1", status: "yes" }] });
    expect(await castRsvpVote(sb, args)).toEqual({ ok: false, reason: "write_failed" });
  });

  it("upsert reported no error but the row is not there (RLS ate it) → not ok", async () => {
    const sb = fakeSupabase({ rows: [] });
    expect(await castRsvpVote(sb, args)).toEqual({ ok: false, reason: "not_landed" });
  });

  it("row landed with a different status → not ok", async () => {
    const sb = fakeSupabase({ rows: [{ user_id: "u1", status: "maybe" }] });
    expect(await castRsvpVote(sb, args)).toEqual({ ok: false, reason: "not_landed" });
  });

  it("verification read failed → not ok", async () => {
    const sb = fakeSupabase({ readError: { message: "net" } });
    expect(await castRsvpVote(sb, args)).toEqual({ ok: false, reason: "verify_failed" });
  });

  it("rsvp read policy in schema and migration lets owner + visitor + self read, in chain order", () => {
    const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    const migration = readFileSync(
      new URL("../supabase/migrations/202610310001_wave5_rsvp_read_policy.sql", import.meta.url),
      "utf8"
    );
    for (const sql of [schema, migration]) {
      const block = sql.slice(sql.indexOf('create policy "rsvp read"'));
      const body = block.slice(0, block.indexOf(");"));
      expect(body).toContain("g.owner_id = auth.uid()");
      expect(body).toContain("group_views");
      expect(body).toContain("auth.uid() = user_id");
    }
  });

  it("the valid-token e2e is no longer skipped and the config pins a test secret", () => {
    const spec = readFileSync(new URL("../e2e/wave7-email-invite.spec.js", import.meta.url), "utf8");
    expect(spec).not.toContain("test.skip(!secret");
    const cfg = readFileSync(new URL("../playwright.config.mjs", import.meta.url), "utf8");
    expect(cfg).toContain("RSVP_TOKEN_SECRET");
  });
});

describe("wave 3b cosmetic — writeReminderStamp reports written only when a write landed", () => {
  const NOW = 111;
  function casFake(live) {
    const row = { id: "g1", live, updated_at: "t0" };
    return {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      }),
      rpc: async () => ({ data: "t1", error: null }),
    };
  }
  const reminded = { live: { bitIdleRemindedAt: 999 } };

  it("stamp already on the fresh live (skipped) → written: false", async () => {
    const sb = casFake({ pendingRemindedAt: NOW });
    expect(await writeReminderStamp(sb, "g1", reminded, NOW, { sent: true })).toEqual({
      kind: "pending",
      written: false,
    });
  });

  it("stamp actually written → written: true", async () => {
    const sb = casFake({ pendingRemindedAt: 0 });
    expect(await writeReminderStamp(sb, "g1", reminded, NOW, { sent: true })).toEqual({
      kind: "pending",
      written: true,
    });
  });

  it("no live yet → written: false", async () => {
    const sb = casFake(null);
    expect(await writeReminderStamp(sb, "g1", reminded, NOW, { sent: true })).toEqual({
      kind: "pending",
      written: false,
    });
  });
});
