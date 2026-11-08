import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { recordGateSwallow } from "../lib/wa/healthServer.js";
import { BotToggle } from "../components/poker/BotToggle.jsx";

/* ============================================================================
   גל 5, פריט 5.5 (E9): שער המסירה המאוחרת נשאר — אבל בליעה כבר לא
   שקטה: כל דריכה כותבת משואת diag_events (בלי תוכן הודעה), ובליעת
   פקודת כסף מוסיפה שורת בריאות גלויה לבעלים. הפקודה עדיין לא מוחלת.
   ============================================================================ */

const T0 = 1_700_000_000_000;
const lastSession = { endedAt: T0, startedAt: T0 - 4 * 3600_000 };
const gateOpts = {
  now: T0 + 3600_000,
  lastSession,
  msgTs: T0 - 1800_000, // חותמת הודעה מלפני סוף הערב השמור
};

describe("5.5 — סימון gate בתוצאת applyCommands", () => {
  it("רצף הבליעה מהממצא: פקודת כסף נבלעת, לא מוחלת, ומסומנת כ־gate עם money", () => {
    const res = applyCommands(null, [{ kind: "add", name: "קובי", amount: 50 }], "w5-late-1", 2, gateOpts);
    expect(res.reply).toBeNull();
    expect(res.live?.players ?? []).toHaveLength(0); // לא הוחלה
    expect(res.gate).toMatchObject({
      reason: "late-delivery",
      kinds: ["add"],
      money: true,
      msgId: "w5-late-1",
    });
    /* בלי תוכן הודעה בסימון — רק מטא־נתונים */
    expect(JSON.stringify(res.gate)).not.toContain("קובי");
  });

  it("פקודת מידע שנבלעה — gate בלי money", () => {
    const res = applyCommands(null, [{ kind: "status" }], "w5-late-2", 2, gateOpts);
    expect(res.gate).toMatchObject({ kinds: ["status"], money: false });
  });

  it("הודעה טרייה — אין gate, הערב נפתח כרגיל", () => {
    const res = applyCommands(null, [{ kind: "add", name: "קובי", amount: 50 }], "w5-fresh", 2, {
      now: T0 + 3600_000,
      lastSession,
      msgTs: T0 + 5000,
    });
    expect(res.gate).toBeUndefined();
    expect(res.live.players).toHaveLength(1);
  });
});

/* לקוח מזויף: groups עם config מתגלגל דרך write_group_cas + diag_events. */
function fakeSupabase(initialConfig = {}) {
  const calls = { inserts: [], updates: [] };
  let config = initialConfig;
  const sb = {
    rpc: async (_fn, args) => {
      calls.updates.push(args.p_patch);
      if (args.p_patch?.config) config = args.p_patch.config;
      return { data: "2026-01-01T00:00:01.000Z", error: null };
    },
    from(table) {
      if (table === "diag_events") {
        return {
          insert: async (row) => {
            calls.inserts.push(row);
            return { error: null };
          },
        };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { id: 7, config, updated_at: "t0" }, error: null }),
        maybeSingle: async () => ({ data: { id: 7, config, updated_at: "t0" }, error: null }),
      };
      return chain;
    },
  };
  return { sb, calls, getConfig: () => config };
}

describe("5.5 — recordGateSwallow", () => {
  const moneyGate = {
    reason: "late-delivery",
    kinds: ["add"],
    money: true,
    msgId: "w5-late-1",
    msgTs: T0 - 1800_000,
    lastEndedAt: T0,
  };

  it("בליעת כסף: משואת diag + שורת בריאות ב־botHealth", async () => {
    const { sb, calls, getConfig } = fakeSupabase({ botOn: true });
    await recordGateSwallow({ supabase: sb, groupId: 7, gate: moneyGate });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].kind).toBe("wa-late-gate");
    expect(calls.inserts[0].payload.kinds).toEqual(["add"]);
    expect(calls.inserts[0].payload.msgId).toBe("w5-late-1");
    expect(calls.inserts[0].payload.money).toBe(true);
    const health = getConfig().botHealth;
    expect(health.lastGateAt).toEqual(expect.any(Number));
    expect(health.lastGateKinds).toEqual(["add"]);
    expect(health.gateCount).toBe(1);
    expect(getConfig().botOn).toBe(true);

    await recordGateSwallow({ supabase: sb, groupId: 7, gate: moneyGate });
    expect(getConfig().botHealth.gateCount).toBe(2);
    expect(calls.inserts).toHaveLength(2);
  });

  it("בליעה לא־כספית: משואה בלבד, בלי כתיבת config", async () => {
    const { sb, calls } = fakeSupabase({});
    await recordGateSwallow({
      supabase: sb,
      groupId: 7,
      gate: { ...moneyGate, kinds: ["status"], money: false },
    });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].kind).toBe("wa-late-gate");
    expect(calls.updates).toHaveLength(0);
  });

  it("לקוח שבור — recordGateSwallow לא זורק", async () => {
    const broken = {
      from() {
        throw new Error("db down");
      },
      rpc: async () => {
        throw new Error("db down");
      },
    };
    await expect(
      recordGateSwallow({ supabase: broken, groupId: 7, gate: moneyGate })
    ).resolves.toBeUndefined();
  });
});

describe("5.5 — שורת הבריאות במתג הבוט", () => {
  it("בליעת כסף מוצגת לבעלים עם זמן הבליעה", () => {
    const html = renderToString(
      React.createElement(BotToggle, {
        on: true,
        onChange: () => {},
        health: { lastOkAt: Date.now() - 60000, lastGateAt: Date.now() - 5 * 60000, lastGateKinds: ["add"], gateCount: 1 },
      })
    );
    expect(html).toContain("נבלעה בשער המסירה המאוחרת");
    expect(html).toContain("לפני 5 דק׳");
  });

  it("בלי בליעות — אין שורת שער", () => {
    const html = renderToString(
      React.createElement(BotToggle, {
        on: true,
        onChange: () => {},
        health: { lastOkAt: Date.now() - 60000 },
      })
    );
    expect(html).not.toContain("נבלעה בשער");
  });
});
