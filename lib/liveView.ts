import { r2, canon } from "./poker/helpers";
import { partitionByNet } from "./report";

/**
 * לוגיקת תצוגה טהורה של טאב הלייב — חולצה מ־LiveTab.jsx (פיצול 2026-10-16)
 * כדי שתהיה ניתנת לבדיקה בנפרד מהרכיב. אין כאן שום state.
 */

export interface LivePlayer {
  name: string;
  buyin?: number | string;
  cashout?: number | string;
  buyinEvents?: { amount?: number; pot?: number }[];
}

export interface PlayersViewOpts {
  recent?: Record<string, number>;
  allc?: Record<string, number>;
  aliases?: string[];
  anyCash?: boolean;
  cps?: number;
}

export type ViewGroup = "play" | "win" | "even" | "lose" | "open";

export interface PlayerViewRow {
  p: LivePlayer;
  index: number;
  group: ViewGroup;
}

/** ג'יטונים בפועל של שחקן = (חוב − תרומת 5% לקופה) × ג'יטונים לשקל. */
export function playerChips(p: LivePlayer, cps: number): number {
  const potCut = (p.buyinEvents || []).reduce((s, e) => s + (Number(e.pot) || 0), 0);
  return Math.round(r2((+p.buyin! || 0) - potCut) * cps);
}

/**
 * סדר השורות בשולחן החי.
 * במשחק (אין יציאות): לפי פעילות אחרונה. בסגירה: זוכים → אפס → חייבים → פתוחים.
 * מחזיר [{ p, index, group }] כש־index הוא האינדקס המקורי במערך השחקנים.
 */
export function buildPlayersView(players: LivePlayer[], { recent = {}, allc = {}, aliases = [], anyCash = false, cps = 2 }: PlayersViewOpts = {}): PlayerViewRow[] {
  const activityRank = (a: PlayerViewRow, b: PlayerViewRow) => {
    const na = canon(a.p.name, aliases);
    const nb = canon(b.p.name, aliases);
    return (
      (recent[nb] || 0) - (recent[na] || 0) ||
      (allc[nb] || 0) - (allc[na] || 0) ||
      a.index - b.index
    );
  };
  if (!anyCash) {
    return players
      .map((p, index) => ({ p, index, group: "play" as ViewGroup }))
      .sort(activityRank);
  }
  const { winners, even, losers, open } = partitionByNet(players, cps);
  const row = (item: any, group: ViewGroup): PlayerViewRow => {
    const p: LivePlayer = item.p || item;
    return { p, index: players.indexOf(p), group };
  };
  const openRows: PlayerViewRow[] = open
    .map((p: LivePlayer) => ({ p, index: players.indexOf(p), group: "open" as ViewGroup }))
    .sort(activityRank);
  return [
    ...winners.map((x: any) => row(x, "win")),
    ...even.map((x: any) => row(x, "even")),
    ...losers.map((x: any) => row(x, "lose")),
    ...openRows,
  ];
}

/**
 * סכום הקופה הסופי לערב: ברירת המחדל היא המחושב (5% מהקניות), מעוגל לשקלים
 * שלמים; אם המנהל ערך את השדה בסוף הערב — הערך שלו מנצח (עדן, 19.10:
 * "בסוף כל ערב אני אאשר את הסכום הנצבר או אערוך אותו").
 */
export function effectivePot(computed: number, draft: string | null | undefined): number {
  const fallback = Math.max(0, Math.round(computed || 0));
  const d = String(draft ?? "").trim();
  if (d === "") return fallback;
  const v = Number(d);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
}
