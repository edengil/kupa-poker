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
 * פער איזון ג'יטונים בסגירת ערב: סך הג'יטונים שנספרו ביציאה פחות סך הג'יטונים
 * שהונפקו בפועל (אחרי קיצוץ הקופה, לפי playerChips). 0 = הערב מאוזן.
 * חיובי = נספרו יותר ג'יטונים ממה שהונפקו (חשד לטעות ספירה, כמו פער ה־+5₪ של 13.10.2026).
 */
export function chipBalanceDiff(players: LivePlayer[], cps: number): number {
  const issued = players.reduce((s, p) => s + playerChips(p, cps), 0);
  const out = players.reduce(
    (s, p) => s + (p.cashout === "" || p.cashout == null ? 0 : +p.cashout || 0),
    0
  );
  return out - issued;
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
