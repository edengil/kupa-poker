import { describe, it, expect } from "vitest";
import {
  WHAPI_LIMITS,
  applyQuotaSend,
  waQuotaView,
  shouldSkipNudge,
} from "../lib/wa/quota.js";
import { recordWaSend } from "../lib/wa/healthServer.js";
import { maybeRemindBitIdle, BIT_IDLE_REMIND_MS } from "../lib/wa/reminders.js";
import { writeReminderStamp } from "../lib/wa/reminderWrite.js";

/* ============================================================================
   גל 5, פריט 5.6: (א) מד מכסת Whapi — ספירה דרך ה־CAS, תצוגה ודילוג
   נדנודים מעל סף; תזכורות כסף (runPaymentReminders) לא עוברות בשער
   הזה בכלל — הן לא קוראות ל־shouldSkipNudge. (ב) חותמות הצלחה נפרדות
   לרגל DM ולרגל הנדנוד: הצלחה חלקית → אחרי ה־cooldown נשלחת רק הרגל
   החסרה. (ג) ‏written אמיתי בדילוג — מכוסה ב־wave5Correctness.
   ============================================================================ */

describe("5.6(א) — מד המכסה (טהור)", () => {
  const T = Date.UTC(2026, 10, 8, 10, 0); // 12:00 שעון ישראל, 8.11.2026

  it("סופר הודעה רק בהצלחה, בקשה תמיד, ושיחה פעם אחת ליעד", () => {
    let q = applyQuotaSend(null, { now: T, chat: "group", ok: true });
    expect(q).toMatchObject({ day: "2026-11-08", sends: 1, month: "2026-11", requests: 1, chats: ["group"] });
    q = applyQuotaSend(q, { now: T + 1000, chat: "group", ok: true });
    expect(q.sends).toBe(2);
    expect(q.chats).toEqual(["group"]);
    q = applyQuotaSend(q, { now: T + 2000, chat: "dm", ok: false });
    expect(q.sends).toBe(2);
    expect(q.requests).toBe(3);
    expect(q.chats).toEqual(["group", "dm"]);
  });

  it("גלגול יום וחודש מאפס את המונים (שעון ישראל)", () => {
    const before = { day: "2026-11-08", sends: 140, month: "2026-11", requests: 900, chats: ["group"] };
    const nextDay = applyQuotaSend(before, { now: Date.UTC(2026, 10, 8, 22, 30), chat: "group", ok: true });
    expect(nextDay.day).toBe("2026-11-09");
    expect(nextDay.sends).toBe(1);
    expect(nextDay.requests).toBe(901);
    const nextMonth = applyQuotaSend(before, { now: Date.UTC(2026, 10, 30, 22, 30), chat: "group", ok: true });
    expect(nextMonth.month).toBe("2026-12");
    expect(nextMonth.requests).toBe(1);
    expect(nextMonth.chats).toEqual(["group"]);
  });

  it("רמות התראה ודילוג נדנודים בספים", () => {
    const base = { day: "2026-11-08", month: "2026-11", requests: 10, chats: ["group"] };
    expect(waQuotaView({ ...base, sends: 100 }, T).level).toBe("ok");
    expect(shouldSkipNudge({ ...base, sends: 100 }, T)).toBe(false);
    /* 120 = גם 80% (אזהרה) וגם סף הרזרבה לנדנודים (150-30). */
    expect(waQuotaView({ ...base, sends: 120 }, T).level).toBe("near");
    expect(shouldSkipNudge({ ...base, sends: 120 }, T)).toBe(true);
    expect(waQuotaView({ ...base, sends: WHAPI_LIMITS.sendsPerDay }, T).level).toBe("full");
    /* שיחות החודש נגמרו — נדנוד מדלג גם אם היום פנוי. */
    expect(
      shouldSkipNudge({ ...base, sends: 0, chats: ["a", "b", "c", "d", "e"] }, T)
    ).toBe(true);
    /* מרווח הבקשות האחרון נשמר. */
    expect(shouldSkipNudge({ ...base, sends: 0, requests: 950 }, T)).toBe(true);
    expect(shouldSkipNudge(undefined, T)).toBe(false);
  });
});

/* לקוח מזויף עם write_group_cas אמיתי — כמו ב־wave5HealthCas. */
function casFakeSupabase(initialConfig = {}, initialLive = null) {
  const state = { config: initialConfig, live: initialLive, updatedAt: 1000, inserts: [] };
  const sb = {
    rpc: async (fn, args) => {
      if (fn !== "write_group_cas") throw new Error(`unexpected rpc ${fn}`);
      if (args.p_expected_updated_at != null && args.p_expected_updated_at !== state.updatedAt) {
        return { data: null, error: null };
      }
      const patch = args.p_patch || {};
      if (patch.config) state.config = patch.config;
      if (patch.live) state.live = patch.live;
      state.updatedAt += 1;
      return { data: state.updatedAt, error: null };
    },
    from(table) {
      if (table === "diag_events") {
        return { insert: async (row) => { state.inserts.push(row); return { error: null }; } };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: { id: 7, config: state.config, live: state.live, updated_at: state.updatedAt },
          error: null,
        }),
        maybeSingle: async () => ({
          data: { id: 7, config: state.config, live: state.live, updated_at: state.updatedAt },
          error: null,
        }),
      };
      return chain;
    },
  };
  return { sb, state };
}

describe("5.6(א) — recordWaSend סופר מכסה דרך אותו CAS", () => {
  it("שליחות עם יעד מצטברות במד; בלי יעד — אין מפתח מכסה", async () => {
    const { sb, state } = casFakeSupabase({ botOn: true });
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "whatsapp/reply", quotaChat: "group" });
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "wa-reminders/x", quotaChat: "dm" });
    await recordWaSend({ supabase: sb, groupId: 7, ok: false, error: new Error("boom"), where: "whatsapp/reply", quotaChat: "group" });
    const view = waQuotaView(state.config.waQuota);
    expect(view.sendsToday).toBe(2);
    expect(view.requestsMonth).toBe(3);
    expect(view.conversationsMonth).toBe(2);

    const plain = casFakeSupabase({ botOn: true });
    await recordWaSend({ supabase: plain.sb, groupId: 7, ok: true, where: "whatsapp/reply" });
    expect(plain.state.config.waQuota).toBeUndefined();
  });
});

describe("5.6(ב) — הצלחה חלקית: רק הרגל החסרה נשלחת שוב", () => {
  const t0 = 1_000_000;
  const activeLive = {
    startedAt: t0,
    players: [
      {
        name: "עדן",
        buyin: 100,
        cashout: "",
        buyinEvents: [
          { amount: 50, at: t0 },
          { amount: 50, at: t0 + 30_000 },
        ],
      },
    ],
  };
  const T1 = t0 + 30_000 + BIT_IDLE_REMIND_MS;

  it("DM עבר ונדנוד נכשל — אחרי ה־cooldown רק הנדנוד בשל שוב", async () => {
    const cand1 = maybeRemindBitIdle(activeLive, T1, { groupNudge: true });
    expect(cand1.legs).toEqual({ group: true, dm: true });

    const { sb, state } = casFakeSupabase({}, activeLive);
    const stamped = await writeReminderStamp(sb, 7, cand1, T1, {
      legs: { group: false, dm: true },
    });
    expect(stamped).toEqual({ kind: "bit-idle", written: true });
    /* החותמות שנחתו: הצלחת DM משלה; לקבוצה רק ניסיון — אין חותמת
       הצלחת־סוג, כי רגל הקבוצה לא עברה, ואין חותמת ניסיון ל־DM
       (הוא הצליח). */
    expect(state.live.bitIdleDmRemindedAt).toBe(T1);
    expect(state.live.bitIdleRemindedAt).toBeUndefined();
    expect(state.live.bitIdleRemindAttemptAt).toBe(T1);
    expect(state.live.bitIdleDmRemindAttemptAt).toBeUndefined();

    /* בתוך החלון — שום רגל לא נשלחת שוב. */
    expect(maybeRemindBitIdle(state.live, T1 + 60_000, { groupNudge: true })).toBeNull();

    /* אחרי ה־cooldown — רק הרגל החסרה (הנדנוד) בשלה; ה־DM לא חוזר. */
    const cand2 = maybeRemindBitIdle(state.live, T1 + BIT_IDLE_REMIND_MS + 1, {
      groupNudge: true,
    });
    expect(cand2).not.toBeNull();
    expect(cand2.legs).toEqual({ group: true, dm: false });

    /* כשהנדנוד סוף־סוף עובר — האפיזודה שלמה והקצב הרגיל חוזר:
       שתי הרגליים שוב בשלות יחד אחרי cooldown מחותמת ההצלחה. */
    const stamped2 = await writeReminderStamp(sb, 7, cand2, T1 + BIT_IDLE_REMIND_MS + 1, {
      legs: { group: true, dm: null },
    });
    expect(stamped2.written).toBe(true);
    const cand3 = maybeRemindBitIdle(
      state.live,
      T1 + 2 * BIT_IDLE_REMIND_MS + 2,
      { groupNudge: true }
    );
    expect(cand3.legs).toEqual({ group: true, dm: true });
  });

  it("היפוך: נדנוד עבר ו־DM נכשל — אחרי ה־cooldown רק ה־DM בשל", async () => {
    const cand1 = maybeRemindBitIdle(activeLive, T1, { groupNudge: true });
    const { sb, state } = casFakeSupabase({}, activeLive);
    await writeReminderStamp(sb, 7, cand1, T1, { legs: { group: true, dm: false } });
    expect(state.live.bitIdleRemindedAt).toBe(T1);
    expect(state.live.bitIdleDmRemindedAt).toBeUndefined();
    const cand2 = maybeRemindBitIdle(state.live, T1 + BIT_IDLE_REMIND_MS + 1, {
      groupNudge: true,
    });
    expect(cand2.legs).toEqual({ group: false, dm: true });
  });
});
