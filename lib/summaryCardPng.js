/* רינדור כרטיס הסיכום ל-PNG בשרת (לשליחה בוואטסאפ).
   משתמש ב-sharp להמרת ה-SVG שמייצר buildSummaryCardSvg. */

import sharp from "sharp";
import { summaryCardData } from "./poker/summaryCard.js";
import { buildSummaryCardSvg } from "./poker/summaryCardSvg.js";

/**
 * @param {object} db נתוני הקבוצה
 * @param {object} scope { kind: "month"|"quarter"|"half"|"year", y, mo?, q?, h? }
 * @returns {Promise<Buffer|null>} PNG או null אם אין נתונים
 */
export async function renderSummaryCardPng(db, scope) {
  const data = summaryCardData(db, scope);
  if (!data) return null;
  const svg = buildSummaryCardSvg(data);
  const png = await sharp(Buffer.from(svg, "utf-8"))
    .png()
    .toBuffer();
  return png;
}

/** שם קובץ לתמונה לפי התקופה. */
export function summaryCardFileName(scope) {
  const y = scope?.y;
  if (scope?.kind === "month") return `kupa-poker-${y}-${String(scope.mo).padStart(2, "0")}.png`;
  if (scope?.kind === "quarter") return `kupa-poker-${y}-Q${scope.q}.png`;
  if (scope?.kind === "half") return `kupa-poker-${y}-H${scope.h}.png`;
  return `kupa-poker-${y}.png`;
}
