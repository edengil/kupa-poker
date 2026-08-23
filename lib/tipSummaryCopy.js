/* טקסטים לסיכום טיפים בסוף ערב — מקומות, מחמאות, צחוק על מי שלא שם.
   מגדר לפי isFemaleName (אורן, עדן לירז וכו'). */

/** מחמאות סלנג למקום ראשון — {name} מוחלף. */
export const FIRST_PLACE_PRAISE_M = [
  "{name} יא מלך — כל הכבוד על הטיפ",
  "{name} אתה נותן טיפים, נזמין אותך לציסר",
  "{name} אח יקר, הטיפ שלך עושה סדר בערב",
  "{name} תותח על הטיפ — כבוד גדול",
  "{name} יא אגדה, ככה מחזיקים שולחן",
  "{name} מלך הטיפים הערב, בלי מילים",
];

export const FIRST_PLACE_PRAISE_F = [
  "{name} יא מלכה — כל הכבוד על הטיפ",
  "{name} את נותנת טיפים, נזמין אותך לציסר",
  "{name} אחות יקרה, הטיפ שלך עושה סדר בערב",
  "{name} תותחית על הטיפ — כבוד גדול",
  "{name} יא אגדה, ככה מחזיקים שולחן",
  "{name} מלכת הטיפים הערב, בלי מילים",
];

/**
 * שקית צחוקים למי שלא שם טיפ.
 * מחרוזת = ניטרלי / רבים.
 * אובייקט: m / f ליחיד; multi לרבים/מעורב (אם חסר — נופל ל־m).
 */
export const NON_TIPPER_ROASTS = [
  "מה קרה, לא מכניסים את היד לכיס?",
  { m: "טיפ = ברכה. מה, לא תוציא כמה שקלים?", f: "טיפ = ברכה. מה, לא תוציאי כמה שקלים?", multi: "טיפ = ברכה. מה, לא תוציאו כמה שקלים?" },
  "הכיס נעול עם מנעול ביטחוני הערב?",
  "היד לא הגיעה לכיס, אבל לקופה כן?",
  "טיפ זה לא חובה — אבל כבוד זה כן. ולך אין",
  "שכחת טיפ או ששכחת שיש לך כיס?",
  "הערב היד לא יצאה מהכיס?",
  { m: "גם הקופה רעבה, מה לא תשחרר?", f: "גם הקופה רעבה, מה לא תשחררי?", multi: "גם הקופה רעבה, מה לא תשחררו?" },
  { m: "אלה יודעים רק איך לקחת", f: "אלה יודעות רק איך לקחת", multi: "אלה יודעים רק איך לקחת" },
  "הארנק נשאר בבית, או שרק הכיס נשאר סגור?",
  "יד קפוצה כזו — גם פרוטה לא יוצאת",
  "שחקת כל הערב, ובטיפ? פולד.",
  "אלה אם תשים להם סודה ביד שבוע לא יצא הגזים",
  "בונקר של כיס — הטיפ לא עובר את הביצור",
  { m: "הרווחת צ'יפים, אבל פרגון? אפס", f: "הרווחת צ'יפים, אבל פרגון? אפס", multi: "הרווחתם צ'יפים, אבל פרגון? אפס" },
  { m: "גם המלצר היה מתייאש ממך", f: "גם המלצר היה מתייאש ממך", multi: "גם המלצר היה מתייאש מכם" },
  "היד יודעת לקחת קופה — לתת טיפ פחות",
  "שכחת שיש משהו שנקרא כבוד לשולחן?",
];

const NON_TIP_PREFIXES = ["🙊 בלי טיפ הערב", "🙊 נעלמו בלי טיפ"];

/** אינדקס סיבוב לפי דקה (יציב באותה דקה). */
export function minutePick(len, now = Date.now()) {
  if (!len) return 0;
  return Math.floor(now / 60000) % len;
}

/**
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function pickNonTipperRoast(names, isFemaleName, now = Date.now()) {
  const entry = NON_TIPPER_ROASTS[minutePick(NON_TIPPER_ROASTS.length, now)];
  if (typeof entry === "string") return entry;
  const n = names.length;
  if (n > 1) {
    const allF = names.every((nm) => isFemaleName(nm));
    if (allF && entry.f) return entry.f;
    return entry.multi || entry.m;
  }
  if (n === 1 && isFemaleName(names[0])) return entry.f || entry.m;
  return entry.m;
}

/**
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatNonTipperLine(names, isFemaleName, now = Date.now()) {
  const list = names.join(", ");
  const prefix = NON_TIP_PREFIXES[minutePick(NON_TIP_PREFIXES.length, now)];
  const roast = pickNonTipperRoast(names, isFemaleName, now);
  return `${prefix}: ${list} — ${roast}`;
}

/**
 * מחמאה למקום ראשון. כמה שמות בתיקו — מחמאה לפי כולם נשים או לא.
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatFirstPlaceLine(names, isFemaleName, now = Date.now()) {
  const allF = names.length > 0 && names.every((n) => isFemaleName(n));
  const bag = allF ? FIRST_PLACE_PRAISE_F : FIRST_PLACE_PRAISE_M;
  const tpl = bag[minutePick(bag.length, now)];
  const label = names.join(", ");
  const praise = tpl.replace(/\{name\}/g, label);
  return `🥇 מקום ראשון: ${praise}`;
}

/**
 * שורת הכי־מעט שכן שם.
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatLowestTipperLine(names, isFemaleName) {
  const list = names.join(", ");
  if (names.length === 1) {
    const f = isFemaleName(names[0]);
    return f
      ? `${list} שמה הכי מעט — ובכל זאת שמה. כבוד.`
      : `${list} שם הכי מעט — ובכל זאת שם. כבוד.`;
  }
  return `${list} שמו הכי מעט — ובכל זאת שמו. כבוד.`;
}

/**
 * דירוג לפי סכום — תיקו = אותו מקום, מדלגים על מקומות.
 * @param {{ name: string, amount: number }[]} tippers sorted desc by amount
 * @returns {{ place: 1|2|3, names: string[], amount: number }[]}
 */
export function tipRankPlaces(tippers) {
  const places = [];
  let i = 0;
  let place = 1;
  while (i < tippers.length && place <= 3) {
    const amt = tippers[i].amount;
    const names = [];
    while (i < tippers.length && tippers[i].amount === amt) {
      names.push(tippers[i].name);
      i++;
    }
    places.push({ place, names, amount: amt });
    place += names.length;
  }
  return places.filter((p) => p.place <= 3);
}
