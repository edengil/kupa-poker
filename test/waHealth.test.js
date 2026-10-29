import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";

import {
  emptyBotHealth,
  applyWaEvent,
  botHealthView,
  formatAgoHe,
} from "../lib/wa/health.js";
import { recordWaSend, trackWaSend, OK_TOUCH_MS } from "../lib/wa/healthServer.js";
import { labelAction } from "../lib/liveActionLog.js";
import { BotToggle } from "../components/poker/BotToggle.jsx";

/* ============================================================================
   ניטור ערוץ Whapi (fix/wa-channel-monitor):
   - לוגיקת מצב טהורה: האירוע האחרון קובע אם הערוץ חי.
   - recordWaSend: כשל → שורת diag_events + config.botHealth; הצלחה לא מציפה
     כתיבות (throttle), ובהתאוששות נרשמת שורת "wa-channel-recovered".
   - הרישום לעולם לא זורק — ניטור לא שובר שליחה.
   ============================================================================ */

const T0 = 1_700_000_000_000;

describe("botHealth — לוגיקת מצב טהורה", () => {
  it("בלי אירועים — unknown", () => {
    expect(botHealthView(null).state).toBe("unknown");
    expect(botHealthView(emptyBotHealth()).state).toBe("unknown");
  });

  it("הצלחה ראשונה — up, כשל אחריה — down, והתאוששות מחזירה ל־up בלי למחוק את פרטי הכשל", () => {
    let h = applyWaEvent(null, { ok: true }, T0);
    expect(botHealthView(h).state).toBe("up");
    expect(h.lastOkAt).toBe(T0);

    h = applyWaEvent(h, { ok: false, error: new Error("Whapi send failed (404): x"), where: "whatsapp/reply", code: "whapi_not_found", hint: "מזהה הקבוצה לא נמצא" }, T0 + 1000);
    let v = botHealthView(h);
    expect(v.state).toBe("down");
    expect(v.fails).toBe(1);
    expect(v.lastFailWhere).toBe("whatsapp/reply");
    expect(v.lastFailCode).toBe("whapi_not_found");

    h = applyWaEvent(h, { ok: false, error: new Error("again") }, T0 + 2000);
    expect(h.fails).toBe(2);

    h = applyWaEvent(h, { ok: true }, T0 + 3000);
    v = botHealthView(h);
    expect(v.state).toBe("up");
    expect(v.fails).toBe(0);
    /* פרטי הכשל האחרון נשמרים גם אחרי התאוששות — "מתי נרשם כשל אחרון" */
    expect(v.lastFailAt).toBe(T0 + 2000);
  });

  it("שגיאה כמחרוזת/לא־Error לא שוברת ומוגבלת באורך", () => {
    const h = applyWaEvent(null, { ok: false, error: "x".repeat(500) }, T0);
    expect(h.lastFailError.length).toBeLessThanOrEqual(200);
  });

  it("formatAgoHe — יחידות זמן בעברית", () => {
    const now = T0 + 10 * 60000;
    expect(formatAgoHe(now, now)).toBe("עכשיו");
    expect(formatAgoHe(now - 5 * 60000, now)).toBe("לפני 5 דק׳");
    expect(formatAgoHe(now - 60 * 60000, now)).toBe("לפני שעה");
    expect(formatAgoHe(now - 3 * 3600000, now)).toBe("לפני 3 שע׳");
    expect(formatAgoHe(now - 24 * 3600000, now)).toBe("לפני יום");
    expect(formatAgoHe(null, now)).toBe("");
  });
});

describe("labelAction — waFail", () => {
  it("כשל שליחה מתויג כהודעה שלא נשלחה", () => {
    expect(labelAction({ t: "waFail", where: "reply" })).toContain("לא נשלחה");
  });
});

/* לקוח Supabase מזויף: groups עם config מתגלגל + diag_events שנאסף. */
function fakeSupabase(initialConfig = {}) {
  const calls = { inserts: [], updates: [] };
  let config = initialConfig;
  const sb = {
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
        single: async () => ({ data: { config }, error: null }),
        update: (payload) => {
          calls.updates.push(payload);
          config = payload.config;
          return { eq: async () => ({ error: null }) };
        },
      };
      return chain;
    },
  };
  return { sb, calls, getConfig: () => config };
}

describe("recordWaSend", () => {
  it("כשל: שורת diag_events + botHealth ב־config עם סיווג השגיאה", async () => {
    const { sb, calls, getConfig } = fakeSupabase({ botOn: true });
    const out = await recordWaSend({
      supabase: sb,
      groupId: 7,
      ok: false,
      error: new Error("Whapi send failed (404): not found"),
      where: "whatsapp/reply",
    });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].kind).toBe("wa-send-fail");
    expect(calls.inserts[0].payload.groupId).toBe(7);
    expect(calls.inserts[0].payload.code).toBe("whapi_not_found");
    expect(out.state ?? botHealthView(out).state).toBe("down");
    const health = getConfig().botHealth;
    expect(health.lastFailWhere).toBe("whatsapp/reply");
    expect(health.fails).toBe(1);
    expect(health.lastFailCode).toBe("whapi_not_found");
    /* מפתחות config אחרים לא נדרסים */
    expect(getConfig().botOn).toBe(true);
  });

  it("התאוששות: הצלחה אחרי down כותבת config + שורת recovered", async () => {
    const down = applyWaEvent(null, { ok: false, error: new Error("boom") }, Date.now() - 60000);
    const { sb, calls, getConfig } = fakeSupabase({ botHealth: down });
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "whatsapp/reply" });
    expect(calls.inserts.map((r) => r.kind)).toEqual(["wa-channel-recovered"]);
    expect(botHealthView(getConfig().botHealth).state).toBe("up");
    expect(getConfig().botHealth.fails).toBe(0);
  });

  it("הצלחה שגרתית כשהערוץ חי וחותמת ההצלחה טרייה — בלי כתיבת config ובלי diag", async () => {
    const up = applyWaEvent(null, { ok: true }, Date.now());
    const { sb, calls } = fakeSupabase({ botHealth: up });
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "whatsapp/reply" });
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it("הצלחה עם חותמת ישנה — מרעננת את config (touch)", async () => {
    const up = applyWaEvent(null, { ok: true }, Date.now() - OK_TOUCH_MS - 1000);
    const { sb, calls, getConfig } = fakeSupabase({ botHealth: up });
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "whatsapp/reply" });
    expect(calls.updates).toHaveLength(1);
    expect(getConfig().botHealth.lastOkAt).toBeGreaterThan(up.lastOkAt);
  });

  it("הצלחה ראשונה אי־פעם — יוצרת botHealth במצב up", async () => {
    const { sb, getConfig } = fakeSupabase({});
    await recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "reports/x" });
    expect(botHealthView(getConfig().botHealth).state).toBe("up");
  });

  it("בלי groupId — עדיין רושם diag על כשל ולא נופל", async () => {
    const { sb, calls } = fakeSupabase({});
    await recordWaSend({ supabase: sb, groupId: null, ok: false, error: new Error("x"), where: "send/manual" });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.updates).toHaveLength(0);
  });

  it("לקוח שבור לגמרי — recordWaSend לא זורק", async () => {
    const broken = {
      from() {
        throw new Error("db down");
      },
    };
    /* כל הכתיבות נכשלות בפנים ונתפסות — החוזה הוא רק "לא זורק החוצה",
       והמצב המחושב עדיין מוחזר למי שרוצה להשתמש בו. */
    const out = await recordWaSend({ supabase: broken, groupId: 7, ok: false, error: new Error("x") });
    expect(botHealthView(out).state).toBe("down");
  });
});

describe("trackWaSend", () => {
  it("הצלחה מחזירה את תוצאת השליחה ורושמת ok", async () => {
    const { sb, getConfig } = fakeSupabase({});
    const out = await trackWaSend({ supabase: sb, groupId: 7, where: "whatsapp/reply" }, async () => ({ id: "m1" }));
    expect(out).toEqual({ id: "m1" });
    expect(botHealthView(getConfig().botHealth).state).toBe("up");
  });

  it("כשל זורק מחדש את השגיאה המקורית ורושם down", async () => {
    const { sb, getConfig } = fakeSupabase({});
    const boom = new Error("Whapi send failed (402): trial version limit");
    await expect(
      trackWaSend({ supabase: sb, groupId: 7, where: "whatsapp/reply" }, async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    const health = getConfig().botHealth;
    expect(botHealthView(health).state).toBe("down");
    expect(health.lastFailCode).toBe("whapi_quota");
  });
});

describe("BotToggle — אינדיקטור בריאות ערוץ", () => {
  const render = (health) =>
    renderToString(
      React.createElement(BotToggle, { on: true, onChange: () => {}, health })
    );

  it("ערוץ נפל — שורת אזהרה עם זמן הכשל והרמז", () => {
    const health = applyWaEvent(
      null,
      { ok: false, error: new Error("x"), hint: "מזהה הקבוצה בוואטסאפ לא נמצא" },
      Date.now() - 5 * 60000
    );
    const html = render(health);
    expect(html).toContain("הערוץ נפל");
    expect(html).toContain("לפני 5 דק׳");
    expect(html).toContain("מזהה הקבוצה בוואטסאפ לא נמצא");
  });

  it("ערוץ חי — שורה שקטה עם זמן השליחה האחרונה", () => {
    const health = applyWaEvent(null, { ok: true }, Date.now() - 60000);
    const html = render(health);
    expect(html).toContain("הערוץ חי");
    expect(html).not.toContain("הערוץ נפל");
  });

  it("בלי נתוני בריאות — אין שורת סטטוס", () => {
    const html = render(null);
    expect(html).not.toContain("הערוץ חי");
    expect(html).not.toContain("הערוץ נפל");
  });
});
