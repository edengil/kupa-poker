/* בדיקת איזון ערב לפני שמירה — אזהרה רכה, בלי לחסום משחק. */
import { balance, r2 } from "./helpers.js";
import { fmtGap } from "./format.js";
import { proportionalCuts } from "../settlement";

const DEFAULT_TOL = 0.005;

/**
 * בודק שסכום הנטו ≈ 0, ואם יש נתונים — ג'יטונים מול קופה.
 * @param {{
 *   entries?: { amount: number }[],
 *   netSum?: number,
 *   cashSumChips?: number|null,
 *   potChips?: number|null,
 *   cps?: number,
 *   tol?: number,
 * }} opts
 * @returns {{
 *   ok: boolean,
 *   netGap: number,
 *   chipsGap: number|null,
 *   chipsGapShekels: number|null,
 *   warnings: string[],
 * }}
 */
export function checkNightBalance(opts = {}) {
  const tol = opts.tol ?? DEFAULT_TOL;
  let netGap = 0;
  if (opts.netSum != null && Number.isFinite(+opts.netSum)) {
    netGap = r2(+opts.netSum);
  } else if (Array.isArray(opts.entries)) {
    const sum = opts.entries.reduce((s, e) => s + (+e.amount || 0), 0);
    netGap = r2(sum);
    /* גם דרך balance — אותה תוצאה כשאין עיגולים מוזרים */
    const b = balance(opts.entries);
    if (Math.abs(b.gap - netGap) < 0.05) netGap = b.gap;
  }

  let chipsGap = null;
  let chipsGapShekels = null;
  const hasChips =
    opts.cashSumChips != null &&
    opts.potChips != null &&
    Number.isFinite(+opts.cashSumChips) &&
    Number.isFinite(+opts.potChips);
  if (hasChips) {
    chipsGap = r2(+opts.cashSumChips - +opts.potChips);
    const cps = +opts.cps || 0;
    chipsGapShekels = cps > 0 ? r2(chipsGap / cps) : null;
  }

  const netOk = Math.abs(netGap) < tol;
  const chipsOk = chipsGap == null || Math.abs(chipsGap) < tol;
  const warnings = [];
  if (!netOk) {
    warnings.push(`סכום הנטו לא מתאפס — פער ${fmtGap(netGap)}₪`);
  }
  if (!chipsOk) {
    const shekelBit =
      chipsGapShekels != null ? ` (${fmtGap(chipsGapShekels)}₪)` : "";
    warnings.push(`ג'יטונים מול קופה לא תואמים — פער ${chipsGap} ג'יטונים${shekelBit}`);
  }

  return {
    ok: netOk && chipsOk,
    netGap,
    chipsGap,
    chipsGapShekels,
    warnings,
  };
}

/**
 * קיזוז חוסר־ג'יטונים מהמרוויחים בשמירת ערב (ממצא ביקורת 7): החיתוך
 * חל על ה־cashout עצמו (שדה chips), לא רק על amount — החלוקה מחושבת
 * מהג'יטונים, והסיכום לקבוצה מה־amount; כשהם לא מסונכרנים אותם שקלים
 * מופיעים שוב כ"עודף ערב" והזוכה מקבל בחלוקה יותר ממה שהסיכום אמר.
 * החיתוך יחסי לזכיות דרך proportionalCuts — אותו מימוש של settle
 * (פעם גרה כאן גרסת Math.round + שארית־לאחרון שלא הייתה שקולה),
 * ולעולם לא מוריד זוכה מתחת לאפס: חיתוך מוגבל לגובה הזכייה, וחוסר
 * שעולה על סך הזכיות נשאר כפער ערב גלוי במקום סכומים שליליים.
 * משנה את הרשומות במקום ומחזיר אותן.
 */
export function deductChipsShortage(entries, shortageShekels, cps) {
  const shortage = Math.round(+shortageShekels || 0);
  const rate = +cps || 0;
  if (shortage <= 0 || rate <= 0 || !Array.isArray(entries)) return entries;
  const winners = entries.filter((e) => (+e.amount || 0) > 0);
  if (!winners.length) return entries;
  const cuts = proportionalCuts(
    winners.map((w) => +w.amount || 0),
    shortage
  );
  winners.forEach((w, i) => {
    const cap = Math.max(0, Math.floor(+w.amount || 0));
    const deduct = Math.min(cuts[i] || 0, cap);
    if (deduct <= 0) return;
    const chips = Math.max(0, Math.round((+w.chips || 0) - deduct * rate));
    w.chips = chips;
    w.amount = r2(chips / rate - (+w.buyin || 0));
  });
  return entries;
}

/** טקסט אישור לשמירה לא־מאוזנת (עברית, לא מפחיד). */
export function unbalancedSaveConfirmMessage(check) {
  const lines = [
    "הערב עדיין לא מאוזן.",
    ...(check?.warnings || []),
    "",
    "אפשר לחזור ולתקן, או לשמור בכל זאת אם אתה בטוח.",
    "לשמור בכל זאת?",
  ];
  return lines.join("\n");
}

/**
 * אם מאוזן — true. אם לא — שואל אישור מפורש.
 * לא חוסם קניות / ישיבה / משחק — רק בשמירה.
 */
export function confirmSaveIfUnbalanced(check, confirmFn) {
  if (!check || check.ok) return true;
  const ask =
    typeof confirmFn === "function"
      ? confirmFn
      : typeof globalThis !== "undefined" && typeof globalThis.confirm === "function"
        ? globalThis.confirm.bind(globalThis)
        : () => false;
  return !!ask(unbalancedSaveConfirmMessage(check));
}
