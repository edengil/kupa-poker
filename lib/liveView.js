import { r2, canon } from "./poker/helpers";
import { partitionByNet } from "./report";

/**
 * לוגיקת תצוגה טהורה של טאב הלייב — חולצה מ־LiveTab.jsx (פיצול 2026-10-16)
 * כדי שתהיה ניתנת לבדיקה בנפרד מהרכיב. אין כאן שום state.
 */

/** ג'יטונים בפועל של שחקן = (חוב − תרומת 5% לקופה) × ג'יטונים לשקל. */
export function playerChips(p, cps) {
  const potCut = (p.buyinEvents || []).reduce((s, e) => s + (Number(e.pot) || 0), 0);
  return Math.round(r2((+p.buyin || 0) - potCut) * cps);
}

/**
 * סדר השורות בשולחן החי.
 * במשחק (אין יציאות): לפי פעילות אחרונה. בסגירה: זוכים → אפס → חייבים → פתוחים.
 * מחזיר [{ p, index, group }] כש־index הוא האינדקס המקורי במערך השחקנים.
 */
export function buildPlayersView(players, { recent = {}, allc = {}, aliases = [], anyCash = false, cps = 2 } = {}) {
  const activityRank = (a, b) => {
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
      .map((p, index) => ({ p, index, group: "play" }))
      .sort(activityRank);
  }
  const { winners, even, losers, open } = partitionByNet(players, cps);
  const row = (item, group) => {
    const p = item.p || item;
    return { p, index: players.indexOf(p), group };
  };
  const openRows = open
    .map((p) => ({ p, index: players.indexOf(p), group: "open" }))
    .sort(activityRank);
  return [
    ...winners.map((x) => row(x, "win")),
    ...even.map((x) => row(x, "even")),
    ...losers.map((x) => row(x, "lose")),
    ...openRows,
  ];
}
