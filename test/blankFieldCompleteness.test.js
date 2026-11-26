/* גל B, מנה 6.4-PREP (טסט בלבד) — שער שלמות־השדות של blank() לקראת
   מעבר הלייב־סטייט במנה 6.4 (ביקורת 6.0, §12).

   הרקע: הפיקסצ'ר המשותף test/fixtures/live-full.js טען לשאת את כל שדות
   blank() אבל חסרו בו ארבע חותמות רגל ה־DM (גל 5, 5.6) — שדה שלא נמצא
   בפיקסצ'ר לא יכול ללכת לאיבוד בשום טסט, בדיוק המלכודת שמנה 6.4
   (הזזת blank ל־liveState) עלולה להפעיל. השער כאן בנוי מתתי־קבוצות
   כיווניות + רשימות־היתר מפורשות, לא משוויון תלת־כיווני: שוויון כזה
   שגוי כאן כי שלושת המשטחים (פיקסצ'ר / WaLiveState / pickLiveMeta)
   שונים זה מזה בכוונה — ההבדלים החוקיים מקודדים למטה בשם, וכל הבדל
   חדש שלא מופיע ברשימה = כשל.

   המלכודת האמיתית לשער: שדה שנופל מרשימת הנרמול המפורשת של blank().
   ה־spread ב־blank מעביר כל שדה מקור כמו שהוא, אז הסרת שורת נרמול לא
   תמיד נראית על הפיקסצ'ר המלא — לכן השער פורב גם blank({}) (שם שורת
   נרמול חסרה = מפתח חסר בפלט) וגם blank עם חותמת null (שם שורת מחיקה
   חסרה = מפתח null ששורד בניגוד לחוזה הצורה). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { blank } from "../lib/wa/state";
import { pickLiveMeta } from "../lib/liveMeta.js";
import { LIVE_T0, makeLiveFull } from "./fixtures/live-full.js";

const sorted = (arr) => [...arr].sort();
const keysOf = (obj) => sorted(Object.keys(obj));

/* השדות ש־blank() מנרמל תמיד (רשימת השדות המפורשת בגוף blank ב־
   lib/wa/liveState.ts — עבר לשם מ־state.ts במנה 6.4) — נוכחים בפלט
   גם מלייב ריק, עם ברירות־המחדל. */
const BLANK_NORMALIZED_ALWAYS = [
  "entriesCount",
  "addAmt",
  "startedAt",
  "players",
  "applied",
  "pending",
  "closing",
  "pendingApprovals",
  "approvedNames",
  "pendingRemindedAt",
  "bitIdleRemindedAt",
  "tips",
  "tipComplimentBag",
  "tipComplimentLast",
  "coupleFills",
  "savings5",
  "savingsPot",
  "potDraft",
];

/* החותמות ש־blank() מנרמל בתנאי (בלוק המחיקה־כש־null בגוף blank):
   חותמת אמיתית עוברת כמו שהיא; null/חסר = המפתח לא קיים בפלט בכלל. */
const BLANK_NORMALIZED_CONDITIONAL = [
  "pendingRemindAttemptAt",
  "bitIdleRemindAttemptAt",
  "pendingDmRemindedAt",
  "bitIdleDmRemindedAt",
  "pendingDmRemindAttemptAt",
  "bitIdleDmRemindAttemptAt",
];

/* קבוצת הנשיאה המדויקת של pickLiveMeta (lib/liveMeta.js) על לייב מלא:
   11 מפתחות קבועים + 10 מותנים־בקיום שכולם קיימים בפיקסצ'ר המלא. */
const PICK_LIVE_META_CARRIED = [
  "applied",
  "pending",
  "closing",
  "pendingApprovals",
  "approvedNames",
  "tipComplimentBag",
  "tipComplimentLast",
  "tipComplimentBagM",
  "tipComplimentLastM",
  "tipComplimentBagF",
  "tipComplimentLastF",
  "savingsPot",
  "ts",
  "pendingRemindedAt",
  "bitIdleRemindedAt",
  "pendingRemindAttemptAt",
  "bitIdleRemindAttemptAt",
  "pendingDmRemindedAt",
  "bitIdleDmRemindedAt",
  "pendingDmRemindAttemptAt",
  "bitIdleDmRemindAttemptAt",
];

/* רשימת־היתר: שדות הפלט של blank(פיקסצ'ר) ש־pickLiveMeta בכוונה לא
   נושא — שדות הליבה שהאפליקציה כותבת מרשימת השדות הסגורה שלה, ושדות
   האפליקציה שעוברים דרך blank בשמירת הבוט בלבד. */
const PICK_LIVE_META_NOT_CARRIED = [
  /* ליבה — הבעלים הוא מסך האפליקציה, לא pickLiveMeta: */
  "entriesCount",
  "addAmt",
  "startedAt",
  "players",
  "tips",
  "coupleFills",
  "savings5",
  "potDraft",
  /* שדות אפליקציה עוברים־דרך (הרשימה בהערת blank עצמה): */
  "cps",
  "actionLog",
  "planSnap",
  "handOfNight",
  "liveAnnounced",
  "editedAt",
];

/* סטייה ידועה (KNOWN DIVERGENCE — לא כשל): שדות ההומור נמצאים בטיפוס
   WaLiveState ונכתבים ב־apply, אבל שורדים את blank() רק דרך ה־spread,
   אינם בפיקסצ'ר ואינם נישאים ב־pickLiveMeta — מוזרות קיימת בייצור
   (שמירת אפליקציה מוחקת אותם). מקודדים את האמת הנוכחית; לא מתקנים
   התנהגות במנה הזו. */
const KNOWN_DIVERGENCE_HUMOR = ["potMilestonesAnnounced", "openingProphecyDone"];

/* רשימת־היתר: שדות הפיקסצ'ר שאינם מוצהרים ב־WaLiveState — שקיות
   המחמאות המגדריות (נכתבות דרך מפתחות מחושבים ב־tipCompliments.js)
   ושדות האפליקציה העוברים־דרך. */
const FIXTURE_ONLY_VS_TYPE = [
  "tipComplimentBagM",
  "tipComplimentLastM",
  "tipComplimentBagF",
  "tipComplimentLastF",
  "cps",
  "actionLog",
  "planSnap",
  "handOfNight",
  "liveAnnounced",
  "editedAt",
];

/* רשימת־היתר: שדות WaLiveState שאינם בפיקסצ'ר — בדיוק שדות ההומור
   מהסטייה הידועה שלמעלה, שום דבר אחר. */
const TYPE_ONLY_VS_FIXTURE = [...KNOWN_DIVERGENCE_HUMOR];

function waLiveStateFields() {
  const src = readFileSync(new URL("../lib/wa/liveState.ts", import.meta.url), "utf8");
  const start = src.indexOf("interface WaLiveState {");
  const block = src.slice(start, src.indexOf("\n}", start));
  return sorted([...block.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map((m) => m[1]));
}

describe("6.4-PREP — שלמות שדות blank() מול הפיקסצ'ר המלא", () => {
  it("כל שדה של הפיקסצ'ר שורד את blank() (כולל ארבע חותמות ה־DM)", () => {
    const fixture = makeLiveFull();
    const out = blank(fixture);
    for (const key of Object.keys(fixture)) {
      expect(Object.hasOwn(out, key), `field ${key} dropped by blank()`).toBe(true);
      expect(out[key], `field ${key}`).toEqual(fixture[key]);
    }
    /* ארבע החותמות שהושלמו במנה זו — ערכי הפיקסצ'ר במפורש: */
    expect(out.pendingDmRemindedAt).toBe(LIVE_T0 + 1500);
    expect(out.bitIdleDmRemindedAt).toBe(LIVE_T0 + 2500);
    expect(out.pendingDmRemindAttemptAt).toBe(LIVE_T0 + 3200);
    expect(out.bitIdleDmRemindAttemptAt).toBe(LIVE_T0 + 3700);
  });

  it("כל שדה ש־blank() מנרמל תמיד נוכח בפלט — גם מהפיקסצ'ר וגם מלייב ריק", () => {
    /* הפרוב על לייב ריק הוא המלכודת האמיתית: על הפיקסצ'ר המלא ה־spread
       מסתיר שורת נרמול שנפלה; על {} אין מה שיסתיר. */
    for (const key of BLANK_NORMALIZED_ALWAYS) {
      expect(Object.hasOwn(blank(makeLiveFull()), key), `${key} missing from blank(fixture)`).toBe(true);
      expect(Object.hasOwn(blank({}), key), `${key} missing from blank({})`).toBe(true);
      expect(Object.hasOwn(blank(null), key), `${key} missing from blank(null)`).toBe(true);
    }
    /* ואין בפלט של לייב ריק שום מפתח מעבר לרשימת הנרמול־תמיד: */
    expect(keysOf(blank({}))).toEqual(sorted(BLANK_NORMALIZED_ALWAYS));
  });

  it("החותמות המותנות: חותמת אמיתית עוברת, null/חסר נמחק מהפלט", () => {
    const fixture = makeLiveFull();
    for (const key of BLANK_NORMALIZED_CONDITIONAL) {
      expect(blank(fixture)[key], `${key} lost by blank()`).toBe(fixture[key]);
      expect(Object.hasOwn(blank({}), key), `${key} invented by blank({})`).toBe(false);
      expect(
        Object.hasOwn(blank({ ...fixture, [key]: null }), key),
        `${key}: null stamp survived blank()`,
      ).toBe(false);
    }
  });

  it("pickLiveMeta(blank(פיקסצ'ר)) = קבוצת הנשיאה המתועדת בדיוק", () => {
    const out = blank(makeLiveFull());
    expect(keysOf(pickLiveMeta(out))).toEqual(sorted(PICK_LIVE_META_CARRIED));
    /* והמשלים בתוך פלט blank הוא בדיוק רשימת־ההיתר של הלא־נישאים: */
    const notCarried = keysOf(out).filter((k) => !PICK_LIVE_META_CARRIED.includes(k));
    expect(notCarried).toEqual(sorted(PICK_LIVE_META_NOT_CARRIED));
  });

  it("סטייה ידועה: שדות ההומור שורדים blank ב־spread בלבד ולא נישאים ב־pickLiveMeta", () => {
    const withHumor = { ...makeLiveFull(), potMilestonesAnnounced: [500], openingProphecyDone: true };
    const out = blank(withHumor);
    expect(out.potMilestonesAnnounced).toEqual([500]);
    expect(out.openingProphecyDone).toBe(true);
    const meta = pickLiveMeta(out);
    for (const key of KNOWN_DIVERGENCE_HUMOR) {
      expect(Object.hasOwn(meta, key), `${key} unexpectedly carried`).toBe(false);
    }
  });

  it("שדות הפיקסצ'ר = שדות WaLiveState מודולו רשימות־ההיתר המפורשות", () => {
    const fixtureKeys = keysOf(makeLiveFull());
    const typeFields = waLiveStateFields();
    expect(fixtureKeys.filter((k) => !typeFields.includes(k))).toEqual(sorted(FIXTURE_ONLY_VS_TYPE));
    expect(typeFields.filter((k) => !fixtureKeys.includes(k))).toEqual(sorted(TYPE_ONLY_VS_FIXTURE));
  });
});
