/* רשימת תקופות שהסתיימו — לטאב הסיכומים.
   רק תקופה שהסתיימה מקבלת כרטיסיה (לא החודש/רבעון/חציון/שנה הנוכחיים). */

import { yearNum } from "./totals.js";
import { MONTHS } from "./format.js";

interface Session {
  y?: unknown;
  mo?: unknown;
}

interface Db {
  sessions?: Session[];
}

interface PeriodBase {
  kind: "month" | "quarter" | "half" | "year";
  y: number;
  key: string;
  label: string;
}

export interface MonthPeriod extends PeriodBase {
  kind: "month";
  mo: number;
}

export interface QuarterPeriod extends PeriodBase {
  kind: "quarter";
  q: number;
}

export interface HalfPeriod extends PeriodBase {
  kind: "half";
  h: number;
}

export interface YearPeriod extends PeriodBase {
  kind: "year";
}

export type Period = MonthPeriod | QuarterPeriod | HalfPeriod | YearPeriod;
export type PeriodFilter = "month" | "quarter" | "half" | "year";

function sessionKeys(db: Db | null | undefined): { months: Set<string>; years: Set<number> } {
  const months = new Set<string>();
  const years = new Set<number>();
  for (const s of db?.sessions || []) {
    const y = yearNum(s?.y);
    const mo = Number(s?.mo);
    if (y == null || !Number.isFinite(mo) || mo < 1 || mo > 12) continue;
    years.add(y);
    months.add(`${y}-${mo}`);
  }
  return { months, years };
}

function nowParts(): { y: number; mo: number; q: number; h: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  return { y, mo, q: Math.floor((mo - 1) / 3) + 1, h: mo <= 6 ? 1 : 2 };
}

/** חודשים שהסתיימו ויש בהם ערבים — מהחדש לישן. */
export function completedMonths(db: Db | null | undefined): MonthPeriod[] {
  const { months } = sessionKeys(db);
  const { y: cy, mo: cmo } = nowParts();
  return [...months]
    .map((k) => {
      const [y, mo] = k.split("-").map(Number);
      return { kind: "month" as const, y, mo, key: k, label: `${MONTHS[mo - 1]} ${y}` };
    })
    .filter((p) => p.y < cy || (p.y === cy && p.mo < cmo))
    .sort((a, b) => b.y - a.y || b.mo - a.mo);
}

/** רבעונים שהסתיימו ויש בהם ערבים — מהחדש לישן. */
export function completedQuarters(db: Db | null | undefined): QuarterPeriod[] {
  const { months } = sessionKeys(db);
  const { y: cy, q: cq } = nowParts();
  const set = new Set<string>();
  for (const k of months) {
    const [y, mo] = k.split("-").map(Number);
    set.add(`${y}-Q${Math.floor((mo - 1) / 3) + 1}`);
  }
  return [...set]
    .map((k) => {
      const [y, q] = k.split("-Q").map(Number);
      return { kind: "quarter" as const, y, q, key: k, label: `רבעון ${q} · ${y}` };
    })
    .filter((p) => p.y < cy || (p.y === cy && p.q < cq))
    .sort((a, b) => b.y - a.y || b.q - a.q);
}

/** חציונים שהסתיימו ויש בהם ערבים — מהחדש לישן. */
export function completedHalves(db: Db | null | undefined): HalfPeriod[] {
  const { months } = sessionKeys(db);
  const { y: cy, h: ch } = nowParts();
  const set = new Set<string>();
  for (const k of months) {
    const [y, mo] = k.split("-").map(Number);
    set.add(`${y}-H${mo <= 6 ? 1 : 2}`);
  }
  return [...set]
    .map((k) => {
      const [y, h] = k.split("-H").map(Number);
      return { kind: "half" as const, y, h, key: k, label: `חציון ${h} · ${y}` };
    })
    .filter((p) => p.y < cy || (p.y === cy && p.h < ch))
    .sort((a, b) => b.y - a.y || b.h - a.h);
}

/** שנים שהסתיימו ויש בהן ערבים — מהחדש לישן. */
export function completedYears(db: Db | null | undefined): YearPeriod[] {
  const { years } = sessionKeys(db);
  const { y: cy } = nowParts();
  return [...years]
    .map((y) => ({ kind: "year" as const, y, key: `${y}`, label: `${y}` }))
    .filter((p) => p.y < cy)
    .sort((a, b) => b.y - a.y);
}

/** כל התקופות הזמינות לפי סוג סינון. */
export function summaryPeriods(db: Db | null | undefined, filter: PeriodFilter): Period[] {
  if (filter === "quarter") return completedQuarters(db);
  if (filter === "half") return completedHalves(db);
  if (filter === "year") return completedYears(db);
  return completedMonths(db);
}

/** המרת תקופה ל-scope של summaryCardData. */
export function periodToScope(p: Period): { kind: string; y: number; mo?: number; q?: number; h?: number } {
  if (p.kind === "quarter") return { kind: "quarter", y: p.y, q: p.q };
  if (p.kind === "half") return { kind: "half", y: p.y, h: p.h };
  if (p.kind === "year") return { kind: "year", y: p.y };
  return { kind: "month", y: p.y, mo: p.mo };
}
