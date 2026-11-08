/* גל 5 (ממצא ביקורת 19) — רצף פקודות בוט מלא מהפיקסצ'ר העשיר.
   גל 3 נעץ את שימור השדות לפקודת טיפ אחת; כאן רץ רצף ערב שלם (טיפ,
   קנייה נוספת, מסירה חוזרת, טיפ אחרי יציאה) וכל צעד נאמת נגד כל שדות
   המטא, חותמות התזכורות והאינווריאנט של הקופה — כך שרגרסיה בשדה
   "בעייתי" תיתפס בכל פקודה, לא רק בטיפ. */
import { describe, expect, it } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { blank, playerPotSum } from "../lib/wa/state";
import { pickLiveMeta } from "../lib/liveMeta.js";
import { LIVE_T0, makeLiveFull } from "./fixtures/live-full.js";

const known = ["עדן גיל", "קובי סעדה", "אופיר סנה", "דני לוי"];

function apply(live, cmds, msgId, opts = {}) {
  return applyCommands(live, cmds, msgId, 2, {
    knownNames: known,
    now: LIVE_T0 + 10000,
    ...opts,
  }).live;
}

function expectPotInvariant(live) {
  const sumPots = live.players.reduce((s, p) => s + playerPotSum(p), 0);
  expect(live.savingsPot).toBeCloseTo(sumPots, 10);
}

function expectMetaIntact(live) {
  expect(live.pending).toBe("דני לוי");
  expect(live.pendingApprovals).toEqual([
    { name: "דני לוי", amount: 100, at: LIVE_T0 + 5000 },
  ]);
  expect(live.approvedNames).toEqual(["קובי סעדה"]);
  expect(live.potDraft).toBe("55");
  expect(live.pendingRemindedAt).toBe(LIVE_T0 + 1000);
  expect(live.pendingRemindAttemptAt).toBe(LIVE_T0 + 3000);
  expect(live.coupleFills).toEqual([{ name: "קובי סעדה", chips: 30 }]);
  expect(live.actionLog).toEqual([{ t: "add", name: "קובי סעדה" }]);
  expect(live.planSnap).toEqual({ location: "אצל קובי" });
  expect(live.handOfNight).toBe("יד גדולה");
  expect(live.liveAnnounced).toEqual(["rec1"]);
  expect(live.cps).toBe(2);
  expect(live.editedAt).toBe(LIVE_T0 + 4500);
  expect(live.savings5).toBe(true);
  expect(Array.isArray(live.tipComplimentBag)).toBe(true);
  expect(live.applied["wamid.FIX1"]).toHaveLength(2);
  expect(live.applied["wamid.FIX2"]).toHaveLength(1);
}

describe("גל 5 — פיקסצ'ר הלייב המלא", () => {
  it("blank מחזיר כל שדה של הפיקסצ'ר כמות שהוא", () => {
    const src = makeLiveFull();
    const out = blank(src);
    for (const key of Object.keys(src)) {
      expect(out[key], `field ${key}`).toEqual(src[key]);
    }
  });

  it("pickLiveMeta נושא את כל המטא וארבע חותמות התזכורות", () => {
    const meta = pickLiveMeta(makeLiveFull());
    expect(meta.pendingRemindedAt).toBe(LIVE_T0 + 1000);
    expect(meta.bitIdleRemindedAt).toBe(LIVE_T0 + 2000);
    expect(meta.pendingRemindAttemptAt).toBe(LIVE_T0 + 3000);
    expect(meta.bitIdleRemindAttemptAt).toBe(LIVE_T0 + 3500);
    expect(meta.pending).toBe("דני לוי");
    expect(meta.applied["wamid.FIX1"]).toHaveLength(2);
  });

  it("pickLiveMeta לא ממציא חותמות כשאין", () => {
    const meta = pickLiveMeta({ applied: {}, pending: null });
    expect("pendingRemindedAt" in meta).toBe(false);
    expect("bitIdleRemindAttemptAt" in meta).toBe(false);
  });

  /* ביקורת O2: קופת הלייב והשקיות המגדריות הן חלק מחוזה הנשיאה —
     בלי הן, כל שמירת לייב מהאפליקציה מחקה אותן מהמסד. */
  it("pickLiveMeta נושא את savingsPot ואת שקיות המחמאות המגדריות", () => {
    const meta = pickLiveMeta(makeLiveFull());
    expect(meta.savingsPot).toBe(15);
    expect(meta.tipComplimentBagM).toEqual([3, 4]);
    expect(meta.tipComplimentLastM).toBe(3);
    expect(meta.tipComplimentBagF).toEqual([5, 6]);
    expect(meta.tipComplimentLastF).toBe(5);
  });

  it("pickLiveMeta לא ממציא savingsPot כשאין (0 מומצא היה דורס צבירה חיה)", () => {
    const meta = pickLiveMeta({ applied: {}, pending: null });
    expect("savingsPot" in meta).toBe(false);
  });

  it("רצף ערב מלא: המטא, החותמות והקופה שורדים כל פקודה", () => {
    let live = makeLiveFull();
    expectPotInvariant(live);

    /* 1. טיפ לשחקן פתוח — שום חותמת לא מתאפסת. */
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 10 }], "w5-seq-1");
    expect(live.players[0].tipsGiven).toBe(20);
    expect(live.bitIdleRemindedAt).toBe(LIVE_T0 + 2000);
    expect(live.bitIdleRemindAttemptAt).toBe(LIVE_T0 + 3500);
    expectMetaIntact(live);
    expectPotInvariant(live);

    /* 2. קנייה נוספת — הקופה גדלה בדיוק ב־pot של האירוע; חותמת
       השקט־ביט מתאפסת בלוגיקת הבוט, אבל השאר שורד. */
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "w5-seq-2");
    expect(live.players[0].buyin).toBe(250);
    expect(live.savingsPot).toBeCloseTo(17.5, 10);
    expectMetaIntact(live);
    expectPotInvariant(live);

    /* 3. מסירה חוזרת של אותה קנייה — שום שינוי נוסף. */
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "w5-seq-2");
    expect(live.players[0].buyin).toBe(250);
    expect(live.savingsPot).toBeCloseTo(17.5, 10);
    expectMetaIntact(live);
    expectPotInvariant(live);

    /* 4. טיפ לשחקן שכבר יצא — היציאה יורדת, החותמות שורדות. */
    live = apply(live, [{ kind: "tip", name: "אופיר", chips: 20 }], "w5-seq-3");
    expect(live.players[1].cashout).toBe("430");
    expectMetaIntact(live);
    expectPotInvariant(live);
  });
});
