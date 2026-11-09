/* גל 7, פריט 7.1 — בדיקות יחידה/אינטגרציה ישירות לחמשת מודולי lib/wa.
   עד הגל, המודולים נבדקו בעיקר דרך צרכנים (נתיב הוואטסאפ, בדיקות
   wave1–wave6 שמייבאות דרך lib/whatsapp.js). כאן כל מודול נבדק ישירות
   מול הקובץ שלו: parse, state, apply (תרחיש מלא + undo מלא), send
   (מול fetch ממוקה) ו־reminders — לכל מודול מסלול הצלחה + מסלול כשל
   לפחות. הבדיקות לא נוגעות ברשת: send ממוקה ב־fetch גלובלי. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALIASES,
  READ_ONLY,
  aliasesOf,
  findPlayer,
  parseCommand,
  parseCommands,
  resolveAlias,
} from "../lib/wa/parse.js";
import {
  MAX_APPLIED_RECORDS,
  blank,
  isKnownName,
  openPlayers,
  playerPotSum,
  renameEverywhere,
  restorePendingSnapshot,
  stampBuyin,
  undo,
} from "../lib/wa/state.ts";
import { applyCommands } from "../lib/wa/apply.ts";
import {
  PRESENCE_THROTTLE_MS,
  listGroups,
  resetPresenceThrottleForTests,
  sendImageToGroup,
  sendToGroup,
  setPresenceOffline,
} from "../lib/wa/send.js";
import {
  BIT_IDLE_REMIND_MS,
  PENDING_REMIND_MS,
  decoratePendingReminder,
  lastBitActivityAt,
  maybeRemindBitIdle,
  maybeRemindPending,
} from "../lib/wa/reminders.js";
import { LIVE_T0, makeLiveFull } from "./fixtures/live-full.js";

const T0 = LIVE_T0;

/* ================================ parse ================================ */

describe("wa/parse — ישיר", () => {
  it("resolveAlias: כינוי ידוע נפתר, שם לא מוכר חוזר כמו שהוא", () => {
    expect(resolveAlias("אופיר")).toBe("אופיר סנה");
    expect(resolveAlias("  עדן ")).toBe("עדן גיל");
    expect(resolveAlias("מישהו חדש")).toBe("מישהו חדש");
    expect(resolveAlias("")).toBe("");
    expect(resolveAlias(null)).toBe("");
  });

  it("aliasesOf: ברירת־המחדל קובעת; תוספת משתמש לא דורסת אותה", () => {
    const merged = aliasesOf({ aliases: { אופיר: "שם אחר", חדש: "חדש מלא" } });
    expect(merged["אופיר"]).toBe("אופיר סנה");
    expect(merged["חדש"]).toBe("חדש מלא");
    expect(ALIASES["אופיר"]).toBe("אופיר סנה");
  });

  it("parseCommands: פקודות הליבה — הצלחה", () => {
    expect(parseCommands("עזרה")).toEqual([{ kind: "help" }]);
    expect(parseCommands("קופה")).toEqual([{ kind: "status" }]);
    expect(parseCommands("לינק")).toEqual([{ kind: "link" }]);
    expect(parseCommands("סיכום")).toEqual([{ kind: "settle" }]);
    expect(parseCommands("טיפים")).toEqual([{ kind: "tipsSummary" }]);
    expect(parseCommands("דן עוד 100")).toEqual([{ kind: "add", name: "דן", amount: 100 }]);
    expect(parseCommands("דן עוד")).toEqual([{ kind: "add", name: "דן", amount: 50 }]);
    expect(parseCommands("דן פחות 50")).toEqual([{ kind: "add", name: "דן", amount: -50 }]);
    expect(parseCommands("אורן יצאה 250")).toEqual([{ kind: "cashout", name: "אורן", chips: 250 }]);
    expect(parseCommands("אופיר טיפ 10")).toEqual([{ kind: "tip", name: "אופיר", chips: 10 }]);
    expect(parseCommands("כניסות 20")).toEqual([{ kind: "entries", count: 20 }]);
    expect(parseCommands("הסר דן")).toEqual([{ kind: "remove", name: "דן" }]);
    expect(parseCommands("דן חוזר")).toEqual([{ kind: "reopen", name: "דן" }]);
    expect(parseCommands("תקן דן → דן ינקלויץ")).toEqual([
      { kind: "rename", from: "דן", to: "דן ינקלויץ" },
    ]);
  });

  it("parseCommands: הודעה רב־שורתית + סכום ברירת־מחדל מותאם", () => {
    const cmds = parseCommands("דן עוד\nאופיר עוד 200", 75, false);
    expect(cmds).toEqual([
      { kind: "add", name: "דן", amount: 75 },
      { kind: "add", name: "אופיר", amount: 200 },
    ]);
  });

  it("parseCommands: כשל/התעלמות — שורות דוח, סימון בוט, שיחה רגילה", () => {
    // שורת דוח של הבוט עצמו לעולם לא פקודה (הגנת 6.8.26)
    expect(parseCommands("אורן גיל מגיע 525₪", 50, true)).toEqual([]);
    // הודעה שמתחילה בסימון הבוט מתעלמים ממנה לגמרי
    expect(parseCommands("🤖 סיכום פוקר\nדן עוד 100")).toEqual([]);
    // שיחה רגילה בלי משחק פעיל — אין פקודה
    expect(parseCommands("מתחילים ב 21", 50, false)).toEqual([]);
    expect(parseCommands("")).toEqual([]);
    expect(parseCommands(null)).toEqual([]);
    // צורה חשופה מותרת רק עם משחק פעיל
    expect(parseCommands("דוד בני 50", 50, false)).toEqual([]);
    expect(parseCommands("דוד בני 50", 50, true)).toEqual([
      { kind: "add", name: "דוד בני", amount: 50 },
    ]);
  });

  it("parseCommand (תאימות): מחזיר את הפקודה הראשונה או null", () => {
    expect(parseCommand("דן עוד 100")).toEqual({ kind: "add", name: "דן", amount: 100 });
    // parseCommand רץ עם gameActive=true (תאימות) — שם־בלבד הוא פקודה לגיטימית שם
    expect(parseCommand("סתם משפט")).toEqual({ kind: "nameOnly", name: "סתם משפט" });
    expect(parseCommand("")).toBeNull();
  });

  it("READ_ONLY מכיל בדיוק את פקודות הקריאה", () => {
    expect([...READ_ONLY].sort()).toEqual(["help", "link", "settle", "status", "tipsSummary"]);
  });

  it("findPlayer: מדויק, כינוי, תחילית יחידה — ורב־משמעות לא מנחשת", () => {
    const players = [{ name: "דן ינקלויץ" }, { name: "דן ויסמן" }, { name: "אופיר סנה" }];
    expect(findPlayer(players, "אופיר סנה")).toEqual({ index: 2, resolved: "אופיר סנה" });
    expect(findPlayer(players, "אופיר")).toEqual({ index: 2, resolved: "אופיר סנה" });
    expect(findPlayer(players, "דן ינקלויץ")).toEqual({ index: 0, resolved: "דן ינקלויץ" });
    const amb = findPlayer(players, "דן");
    // "דן" הוא כינוי של דן ינקלויץ במפה — נפתר דרכה, לא רב־משמעי
    expect(amb).toEqual({ index: 0, resolved: "דן ינקלויץ" });
    const missing = findPlayer(players, "זרים");
    expect(missing.index).toBe(-1);
  });
});

/* ================================ state ================================ */

describe("wa/state — ישיר", () => {
  it("blank: מנרמל לייב חסר לצורת ברירת־המחדל המלאה", () => {
    const s = blank(null);
    expect(s.players).toEqual([]);
    expect(s.pendingApprovals).toEqual([]);
    expect(s.applied).toEqual({});
    expect(s.savingsPot).toBe(0);
    expect(s.savings5).toBe(true);
    expect(s.closing).toBe(false);
    expect(s.addAmt).toBe(50);
  });

  it("blank: שומר שדות אפליקציה לא־מוכרים ולא ממציא חותמות ניסיון ריקות", () => {
    const s = blank({ customField: 42, pendingRemindAttemptAt: null, players: [{ name: "א" }] });
    expect(s.customField).toBe(42);
    expect("pendingRemindAttemptAt" in s).toBe(false);
    expect(s.players).toHaveLength(1);
    const s2 = blank({ pendingRemindAttemptAt: 123 });
    expect(s2.pendingRemindAttemptAt).toBe(123);
  });

  it("stampBuyin + playerPotSum: אירוע אחד חתום, pot מצטבר ב־savingsPot", () => {
    const s = blank(null);
    // stampBuyin מחזיר שחקן חדש (לא מוטציה) עם האירוע החתום עליו
    const p1 = stampBuyin(s, { name: "דן ינקלויץ", buyin: 0, cashout: "", tipsGiven: 0 }, 100, T0, "m1:0");
    expect(p1.buyinEvents[0]).toEqual({ amount: 100, at: T0, total: 100, pot: 5, sid: "m1:0" });
    expect(p1.buyin).toBe(100);
    expect(s.savingsPot).toBe(5);
    const p2 = stampBuyin(s, p1, 100, T0 + 1000, "m2:0");
    expect(p2.buyin).toBe(200);
    expect(p2.buyinEvents).toHaveLength(2);
    expect(playerPotSum(p2)).toBe(10);
    expect(s.savingsPot).toBe(10);
    // הפחתה לא יוצרת אירוע ולא נוגעת בקופה
    const p3 = stampBuyin(s, p2, -50, T0 + 2000);
    expect(p3.buyin).toBe(150);
    expect(p3.buyinEvents).toHaveLength(2);
    expect(s.savingsPot).toBe(10);
  });

  it("openPlayers: רק מי שלא יצא", () => {
    const s = blank({
      players: [
        { name: "א", cashout: "" },
        { name: "ב", cashout: "300" },
        { name: "ג", cashout: null },
      ],
    });
    expect(openPlayers(s).map((p) => p.name)).toEqual(["א", "ג"]);
  });

  it("isKnownName: חתימה (raw, known, extra) — מוכר/כינוי מוכרים, זר לא, בלי רשימה לא חוסם", () => {
    const known = ["דן ינקלויץ", "אופיר סנה"];
    expect(isKnownName("דן ינקלויץ", known)).toBe(true);
    expect(isKnownName("אופיר", known)).toBe(true); // דרך הכינוי
    expect(isKnownName("זר מוחלט", known)).toBe(false);
    expect(isKnownName("זר מוחלט", known, ["זר מוחלט"])).toBe(true); // extra
    expect(isKnownName("כל שם", null)).toBe(true); // בלי רשימה — לא חוסמים
    expect(isKnownName("א", known)).toBe(false); // קצר מדי להתאמת תחילית
  });

  it("renameEverywhere: מעדכן שחקן, ממתינים, אישורים וטיפים במקום", () => {
    const s = blank({
      players: [{ name: "דני", buyin: 100 }],
      pendingApprovals: [{ name: "דני", amount: 50, at: 1 }],
      approvedNames: ["דני"],
      tips: [{ id: "t", name: "דני", amount: 5, at: 1 }],
    });
    renameEverywhere(s, "דני", "דני לוי");
    expect(s.players[0].name).toBe("דני לוי");
    expect(s.pendingApprovals[0].name).toBe("דני לוי");
    expect(s.approvedNames).toEqual(["דני לוי"]);
    expect(s.tips[0].name).toBe("דני לוי");
    renameEverywhere(s, "לא קיים", "אחר");
    expect(s.players[0].name).toBe("דני לוי");
  });

  it("restorePendingSnapshot: משלים פריט ממתין מרשומת ביטול חלקית", () => {
    const full = restorePendingSnapshot({
      t: "pending",
      pending: { name: "דן", amount: 100, at: 5, op: "tip" },
    });
    expect(full).toMatchObject({ name: "דן", amount: 100, at: 5, op: "tip" });
    const bare = restorePendingSnapshot({ t: "pending", name: "דן", amount: 70, at: 9 });
    expect(bare).toEqual({ name: "דן", amount: 70, at: 9 });
  });

  it("MAX_APPLIED_RECORDS הוא תקרה חיובית", () => {
    expect(MAX_APPLIED_RECORDS).toBeGreaterThan(0);
  });
});

/* ============================ apply + undo ============================ */

describe("wa/apply — תרחיש מלא ו־undo מלא (ישיר)", () => {
  const OPTS = { knownNames: ["קובי סעדה", "אופיר סנה", "דן ינקלויץ"], now: T0 };

  it("תרחיש מלא: קנייה לשחקן קיים + שחקן חדש מאושר + טיפ + יציאה", () => {
    const live = makeLiveFull();
    const res = applyCommands(
      live,
      [
        { kind: "add", name: "קובי סעדה", amount: 100 },
        { kind: "tip", name: "קובי סעדה", chips: 20 },
        { kind: "cashout", name: "קובי סעדה", chips: 500 },
      ],
      "wamid.SCEN1",
      2,
      OPTS
    );
    const kobi = res.live.players.find((p) => p.name === "קובי סעדה");
    expect(kobi.buyin).toBe(300);
    expect(kobi.cashout).toBe("500");
    expect(kobi.tipsGiven).toBe(30);
    expect(res.live.applied["wamid.SCEN1"]).toBeTruthy();
    expect(typeof res.reply).toBe("string");
  });

  it("שחקן לא־מוכר נכנס לממתינים ולא לשולחן; אישור מחיל, דחייה מסירה", () => {
    const live = blank(null);
    // רשימת מוכרים ריקה = אין רשימה (לא חוסמים) — לכן מעבירים רשימה עם שם אחר
    const ask = applyCommands(live, [{ kind: "add", name: "זר חדש", amount: 100 }], "m-new", 2, {
      knownNames: ["מישהו אחר לגמרי"],
      now: T0,
    });
    expect(ask.live.players).toHaveLength(0);
    expect(ask.live.pendingApprovals).toEqual([{ name: "זר חדש", amount: 100, at: T0 }]);

    const approved = applyCommands(
      ask.live,
      [{ kind: "approve", name: "זר חדש" }],
      "m-approve",
      2,
      { knownNames: [], now: T0 + 1000 }
    );
    expect(approved.live.pendingApprovals).toEqual([]);
    expect(approved.live.players.map((p) => p.name)).toEqual(["זר חדש"]);
    expect(approved.live.players[0].buyin).toBe(100);

    const rejected = applyCommands(
      ask.live,
      [{ kind: "reject", name: "זר חדש" }],
      "m-reject",
      2,
      { knownNames: [], now: T0 + 1000 }
    );
    expect(rejected.live.pendingApprovals).toEqual([]);
    expect(rejected.live.players).toHaveLength(0);
  });

  it("undo מלא: ביטול אותה הודעה מחזיר את הלייב לצורתו לפני ההחלה", () => {
    const live = makeLiveFull();
    const before = JSON.parse(JSON.stringify(live));
    const res = applyCommands(
      live,
      [
        { kind: "add", name: "קובי סעדה", amount: 100 },
        { kind: "tip", name: "אופיר סנה", chips: 15 },
      ],
      "wamid.UNDO1",
      2,
      OPTS
    );
    expect(res.live.players.find((p) => p.name === "קובי סעדה").buyin).toBe(300);

    // החלה חוזרת של אותה הודעה = undo של הרשומות שלה ואז החלה מחדש;
    // הדרך הישירה של הביטול היא דרך undo() של state על רשומות applied:
    const state = blank(res.live);
    const entries = state.applied["wamid.UNDO1"];
    expect(entries?.length).toBeGreaterThan(0);
    const retarget = undo(state, entries);
    expect(retarget).toBeInstanceOf(Map);
    const kobi = state.players.find((p) => p.name === "קובי סעדה");
    expect(kobi.buyin).toBe(before.players[0].buyin);
    expect(kobi.buyinEvents).toEqual(before.players[0].buyinEvents);
    expect(state.savingsPot).toBe(before.savingsPot);
    const ofir = state.players.find((p) => p.name === "אופיר סנה");
    expect(ofir.tipsGiven).toBe(before.players[1].tipsGiven);
    expect(state.tips).toEqual(before.tips);
  });

  it("מסירה כפולה של אותה הודעה לא מכפילה קנייה (dedup לפי מזהה)", () => {
    const live = blank(null);
    const once = applyCommands(live, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "m-dup", 2, OPTS);
    const twice = applyCommands(once.live, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "m-dup", 2, OPTS);
    const kobi = twice.live.players.find((p) => p.name === "קובי סעדה");
    expect(kobi.buyin).toBe(100);
    expect(kobi.buyinEvents).toHaveLength(1);
  });

  it("כשל: שער מסירה מאוחרת בולע פקודת כסף ישנה ומסמן gate", () => {
    const res = applyCommands(
      blank(null),
      [{ kind: "add", name: "קובי סעדה", amount: 100 }],
      "m-late",
      2,
      { ...OPTS, msgTs: T0 - 10 * 60_000, lastSession: { endedAt: T0 } }
    );
    expect(res.gate).toMatchObject({ reason: "late-delivery", money: true, msgId: "m-late" });
    expect(res.live.players ?? []).toHaveLength(0);
  });

  it("פקודת עזרה (קריאה בלבד) מחזירה טקסט ולא נוגעת בלייב", () => {
    const live = makeLiveFull();
    const res = applyCommands(live, [{ kind: "help" }], "m-help", 2, OPTS);
    expect(res.live).toBe(live);
    expect(res.reply).toContain("פקודות");
  });

  it("כשל: שם רב־משמעי (שני שחקנים באותה תחילית) לא מוחל על אף אחד", () => {
    const live = blank({
      players: [
        { name: "דני גוטניק", buyin: 100, cashout: "", tipsGiven: 0 },
        { name: "דני לוי", buyin: 100, cashout: "", tipsGiven: 0 },
      ],
    });
    // "דנ" — תחילית של שני השחקנים ואינה מילה שלמה: ההתאמה רב־משמעית,
    // והבוט מבקש לדייק במקום לנחש (בניגוד ל"דני" שהוא שם יושב בפני עצמו).
    const res = applyCommands(
      live,
      [{ kind: "add", name: "דנ", amount: 100 }],
      "m-amb",
      2,
      { knownNames: ["דני גוטניק", "דני לוי"], now: T0, aliases: {} }
    );
    expect(res.live.players.map((p) => p.buyin)).toEqual([100, 100]);
    expect(res.reply).toContain("דני גוטניק");
    expect(res.reply).toContain("דני לוי");
  });
});

/* ================================ send ================================ */

describe("wa/send — ישיר (fetch ממוקה)", () => {
  const okJson = (body = {}) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => "",
  });

  beforeEach(() => {
    resetPresenceThrottleForTests();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sendToGroup: הצלחה — POST לנקודת הקצה הנכונה ומחזיר את תגובת השרת", async () => {
    fetch.mockResolvedValue(okJson({ message: { id: "wa-9" } }));
    const out = await sendToGroup("שלום", { token: "tok", groupId: "grp" });
    expect(out).toEqual({ message: { id: "wa-9" } });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("https://gate.whapi.cloud/messages/text");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ to: "grp", body: "שלום" });
    expect(opts.headers.Authorization).toBe("Bearer tok");
  });

  it("sendToGroup: כשל HTTP זורק שגיאה עם הסטטוס", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "server boom",
    });
    await expect(sendToGroup("x", { token: "tok", groupId: "grp" })).rejects.toThrow(
      "Whapi send failed (500)"
    );
  });

  it("sendImageToGroup: הצלחה שולחת base64; כשל זורק", async () => {
    fetch.mockResolvedValue(okJson({ message: { id: "img-1" } }));
    const out = await sendImageToGroup(Buffer.from("png"), {
      token: "tok",
      groupId: "grp",
      caption: "כרטיס",
      fileName: "card.png",
    });
    expect(out).toEqual({ message: { id: "img-1" } });
    const [, opts] = fetch.mock.calls[0];
    expect(JSON.parse(opts.body).media).toBe(
      `data:image/png;base64,${Buffer.from("png").toString("base64")}`
    );
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => "quota",
    });
    await expect(
      sendImageToGroup("AAAA", { token: "tok", groupId: "grp" })
    ).rejects.toThrow("Whapi image send failed (429)");
  });

  it("listGroups: הצלחה מחזיר JSON; כשל זורק", async () => {
    fetch.mockResolvedValue(okJson([{ id: "g1" }]));
    await expect(listGroups("tok")).resolves.toEqual([{ id: "g1" }]);
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(listGroups("tok")).rejects.toThrow("Whapi groups failed (401)");
  });

  it("setPresenceOffline: בלי טוקן מדלג; throttle חוסם קריאה שנייה; force עוקף", async () => {
    await expect(setPresenceOffline("")).resolves.toEqual({ skipped: "no_token" });
    fetch.mockResolvedValue(okJson());
    const first = await setPresenceOffline("tok");
    expect(first).toEqual({ ok: true, status: 200 });
    const second = await setPresenceOffline("tok");
    expect(second).toEqual({ skipped: "throttled" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const forced = await setPresenceOffline("tok", { force: true });
    expect(forced.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(PRESENCE_THROTTLE_MS).toBe(10 * 60 * 1000);
  });

  it("setPresenceOffline: כשל רשת לא זורק — מחזיר ok:false", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    const out = await setPresenceOffline("tok", { force: true });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("network down");
  });
});

/* ============================== reminders ============================== */

describe("wa/reminders — ישיר", () => {
  it("קבועים: ממתין 8 דקות, שקט־ביט שעתיים", () => {
    expect(PENDING_REMIND_MS).toBe(8 * 60 * 1000);
    expect(BIT_IDLE_REMIND_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("lastBitActivityAt: הפעילות האחרונה מבין startedAt ואירועי הקנייה", () => {
    expect(lastBitActivityAt(null)).toBeNull();
    expect(lastBitActivityAt({ startedAt: 100, players: [] })).toBe(100);
    expect(
      lastBitActivityAt({
        startedAt: 100,
        players: [{ buyinEvents: [{ at: 50 }, { at: 900 }] }, { buyinEvents: [{ at: 300 }] }],
      })
    ).toBe(900);
    expect(lastBitActivityAt({ players: [{ buyinEvents: [] }] })).toBeNull();
  });

  it("maybeRemindPending: בלי ממתינים — null; לפני cooldown — null", () => {
    expect(maybeRemindPending(blank(null), T0)).toBeNull();
    const live = blank({
      pendingApprovals: [{ name: "דני לוי", amount: 100, at: T0 }],
    });
    expect(maybeRemindPending(live, T0 + PENDING_REMIND_MS - 1)).toBeNull();
  });

  it("maybeRemindPending: אחרי cooldown — תזכורת DM עם שתי צורות המצב", () => {
    const live = blank({
      pendingApprovals: [{ name: "דני לוי", amount: 100, at: T0 }],
    });
    const now = T0 + PENDING_REMIND_MS + 1000;
    const res = maybeRemindPending(live, now);
    expect(res).not.toBeNull();
    expect(res.ownerDm).toContain("דני לוי");
    expect(res.live.pendingDmRemindedAt).toBe(now);
    expect(res.attemptLive.pendingDmRemindAttemptAt).toBe(now);
    // רגל קבוצה לא בשלה בלי groupNudge
    expect(res.legs.dm).toBe(true);
    expect(res.legs.group).toBe(false);
    expect(res.reply).toBeNull();
  });

  it("maybeRemindPending: עם groupNudge גם רגל הקבוצה בשלה", () => {
    const live = blank({
      pendingApprovals: [{ name: "דני לוי", amount: 100, at: T0 }],
    });
    const now = T0 + PENDING_REMIND_MS + 1000;
    const res = maybeRemindPending(live, now, { groupNudge: true });
    expect(res.legs.group).toBe(true);
    expect(res.reply).toContain("דני לוי");
  });

  it("maybeRemindBitIdle: משחק פעיל שקט מעל שעתיים — תזכורת; פעיל לאחרונה — null", () => {
    const live = blank({
      startedAt: T0,
      players: [
        { name: "קובי סעדה", buyin: 200, buyinEvents: [{ amount: 200, at: T0, total: 200, pot: 10 }] },
      ],
    });
    expect(maybeRemindBitIdle(live, T0 + BIT_IDLE_REMIND_MS - 1000)).toBeNull();
    const res = maybeRemindBitIdle(live, T0 + BIT_IDLE_REMIND_MS + 1000);
    expect(res).not.toBeNull();
    expect(res.ownerDm).toContain("אין עדכון ביט");
    expect(maybeRemindBitIdle(blank(null), T0 + BIT_IDLE_REMIND_MS + 1000)).toBeNull();
  });

  it("decoratePendingReminder: ממתינים נוקו — חותמת ההצלחה יוצאת; בלי שינוי — אותה הפניה", () => {
    const result = { live: { pendingApprovals: [], pendingRemindedAt: 5 }, reply: "x" };
    const out = decoratePendingReminder(result, 100);
    expect("pendingRemindedAt" in out.live).toBe(false);
    const same = { live: { pendingApprovals: [] }, reply: null };
    expect(decoratePendingReminder(same, 100)).toBe(same);
    expect(decoratePendingReminder(null, 100)).toBeNull();
  });
});
