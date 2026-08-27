/* בדיקת איזון ערב לפני שמירה — אזהרה רכה, בלי לחסום משחק. */
import { balance, r2 } from "./helpers.js";
import { fmtGap } from "./format.js";

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
