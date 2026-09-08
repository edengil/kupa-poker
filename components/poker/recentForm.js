/* טופס אחרון — ערבים אחרונים לשחקן / «חם עכשיו» בקבוצה. */

import { AL, canon, r2 } from "./helpers.js";
import { fmt } from "./format.js";

function nightLabel(s) {
  if (!s || s.d == null) return "";
  return `${s.d}.${s.mo}`;
}

/**
 * תוצאות השחקן ב־N הערבים האחרונים שהשתתף בהם (מהישן לחדש).
 */
export function playerRecentForm(db, playerName, { limit = 8 } = {}) {
  if (!db || !playerName) return null;
  const A = AL(db);
  const name = canon(playerName, A);
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const nights = [];
  for (const s of sessions) {
    let amount = 0;
    let has = false;
    for (const e of s.entries || []) {
      if (canon(e.name, A) !== name) continue;
      has = true;
      amount = r2(amount + (+e.amount || 0));
    }
    if (!has) continue;
    nights.push({
      iso: s.iso,
      d: s.d,
      mo: s.mo,
      y: s.y,
      label: nightLabel(s),
      amount,
      result: amount > 0 ? "win" : amount < 0 ? "loss" : "even",
    });
  }
  if (!nights.length) return null;

  const recent = nights.slice(-Math.max(1, limit));
  let streakType = null;
  let streak = 0;
  for (let i = nights.length - 1; i >= 0; i--) {
    const r = nights[i].result;
    if (r === "even") break;
    if (!streakType) {
      streakType = r;
      streak = 1;
      continue;
    }
    if (r !== streakType) break;
    streak += 1;
  }

  const wins = recent.filter((n) => n.result === "win").length;
  const losses = recent.filter((n) => n.result === "loss").length;
  const net = r2(recent.reduce((s, n) => s + n.amount, 0));

  return {
    name,
    nights: recent,
    wins,
    losses,
    net,
    streakType,
    streak,
    formText: recent.map((n) => (n.result === "win" ? "נ" : n.result === "loss" ? "ה" : "ת")).join(" "),
  };
}

/**
 * דירוג שחקנים לפי נטו ב־N הערבים האחרונים של הקבוצה.
 */
export function groupHotForm(db, { nights: window = 5, top = 3, minAppear = 1 } = {}) {
  if (!db?.sessions?.length) return null;
  const A = AL(db);
  const sessions = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));
  const slice = sessions.slice(-Math.max(1, window));
  if (!slice.length) return null;

  const byName = Object.create(null);
  for (const s of slice) {
    for (const e of s.entries || []) {
      const name = canon(e.name, A);
      if (!name) continue;
      if (!byName[name]) byName[name] = { name, amount: 0, n: 0 };
      byName[name].amount = r2(byName[name].amount + (+e.amount || 0));
      byName[name].n += 1;
    }
  }

  const ranked = Object.values(byName)
    .filter((p) => p.n >= minAppear)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));

  if (!ranked.length) return null;

  const from = slice[0];
  const to = slice[slice.length - 1];
  return {
    windowN: slice.length,
    fromLabel: nightLabel(from),
    toLabel: nightLabel(to),
    fromIso: from.iso,
    toIso: to.iso,
    hot: ranked.slice(0, top),
    cold: ranked.filter((p) => p.amount < 0).slice(-top).reverse(),
    all: ranked,
  };
}

export function formatFormNet(n) {
  return fmt(n);
}
