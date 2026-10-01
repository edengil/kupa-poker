/* עזרי מצב טהורים לערב חי: יצירת מצב, ביטול פעולות ושינוי שמות. */

import { ALIASES, findPlayer, resolveAlias } from "./parse.js";

export const r2 = (v) => Math.round(v * 100) / 100;

export function knownSetOf(list) {
  if (!list) return null;
  if (list instanceof Set) return list.size ? list : null;
  if (Array.isArray(list)) return list.length ? new Set(list) : null;
  return null;
}

export function isKnownName(raw, known, extra = [], aliases = ALIASES) {
  const set = knownSetOf(known);
  if (!set) return true; // בלי רשימה (בדיקות ישנות) — לא חוסמים
  const trimmed = String(raw || "").trim();
  const name = resolveAlias(trimmed, aliases);
  const pool = new Set([...set, ...extra].map((n) => resolveAlias(n, aliases)));
  if (pool.has(name) || pool.has(trimmed)) return true;
  if (name.length < 2) return false;
  const hits = [...pool].filter((n) => n.startsWith(name) || name.startsWith(n));
  return hits.length === 1;
}

export function pickPending(list, rawName, aliases = ALIASES) {
  if (!list.length) return -1;
  if (!rawName) return list.length === 1 ? 0 : -2; // -2 = צריך לדייק
  const name = resolveAlias(rawName, aliases);
  const exact = list.findIndex(
    (p) => p.name === name || p.name === rawName || resolveAlias(p.name, aliases) === name,
  );
  if (exact !== -1) return exact;
  const starts = list
    .map((p, i) => (p.name.startsWith(name) || name.startsWith(p.name) ? i : -1))
    .filter((i) => i !== -1);
  if (starts.length === 1) return starts[0];
  return -1;
}

/** מרחיב שם קצר בשולחן לשם המלא מהכינויים — בלי לדרוס מישהו אחר. */
function expandSeatedName(state, index, canonical, aliases) {
  if (index < 0 || !canonical) return;
  const current = state.players[index]?.name;
  if (!current || current === canonical) return;
  if (state.players.some((p, i) => i !== index && p.name === canonical)) return;
  const aliased = resolveAlias(current, aliases) === canonical;
  const prefix = canonical.startsWith(current + " ") || current.startsWith(canonical + " ");
  if (!aliased && !prefix) return;
  renameEverywhere(state, current, canonical);
}

export function findInState(state, rawName, aliases) {
  const found = findPlayer(state.players, rawName, aliases);
  if (found.index !== -1 && found.resolved) {
    expandSeatedName(state, found.index, found.resolved, aliases);
  }
  return found;
}

export function stampBuyin(player, delta, at = Date.now()) {
  if (!(delta > 0)) return player;
  const events = [...(player.buyinEvents || [])];
  events.push({ amount: delta, at, total: r2(+player.buyin || 0) });
  return { ...player, buyinEvents: events };
}

export function blank(live) {
  return {
    entriesCount: live?.entriesCount ?? "",
    addAmt: live?.addAmt || 50,
    startedAt: live?.startedAt || null,
    players: [...(live?.players || [])],
    applied: { ...(live?.applied || {}) },
    pending: live?.pending ?? null,
    closing: live?.closing ?? false, // סגירה מודרכת בעיצומה
    pendingApprovals: [...(live?.pendingApprovals || [])],
    approvedNames: [...(live?.approvedNames || [])],
    pendingRemindedAt: live?.pendingRemindedAt ?? null,
    bitIdleRemindedAt: live?.bitIdleRemindedAt ?? null,
    /* טיפים: יוצאים מערימת השחקן. tipsGiven על השחקן + יומן tips.
       tipComplimentBag — שקית מחמאות בלי חזרה ברצף. */
    tips: [...(live?.tips || [])],
    tipComplimentBag: Array.isArray(live?.tipComplimentBag) ? [...live.tipComplimentBag] : [],
    tipComplimentLast: live?.tipComplimentLast ?? null,
    coupleFills: [...(live?.coupleFills || [])],
  };
}

export const openPlayers = (state) =>
  state.players.filter((p) => p.cashout === "" || p.cashout == null);

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה. */
export function undo(state, entries) {
  for (const e of [...entries].reverse()) {
    const i = state.players.findIndex((p) => p.name === e.name);
    if (i === -1) continue;
    if (e.t === "add") {
      if (e.created) state.players.splice(i, 1);
      else
        state.players[i] = {
          ...state.players[i],
          buyin: r2((+state.players[i].buyin || 0) - e.delta),
        };
    } else if (e.t === "out") {
      state.players[i] = { ...state.players[i], cashout: e.before };
    } else if (e.t === "tip") {
      const tipsGiven = Math.max(0, r2((+state.players[i].tipsGiven || 0) - e.amount));
      state.players[i] = { ...state.players[i], tipsGiven };
      if (e.tipId != null) {
        state.tips = (state.tips || []).filter((t) => t.id !== e.tipId);
      }
      if (e.bagBefore) {
        state.tipComplimentBag = e.bagBefore;
        state.tipComplimentLast = e.lastBefore ?? null;
      }
    } else if (e.t === "pending") {
      state.pendingApprovals = (state.pendingApprovals || []).filter(
        (p) => !(p.name === e.name && p.amount === e.amount && p.at === e.at),
      );
    } else if (e.t === "approve") {
      const j = state.players.findIndex((p) => p.name === e.name);
      if (e.created && j !== -1) state.players.splice(j, 1);
      if (e.pending) state.pendingApprovals = [...(state.pendingApprovals || []), e.pending];
      state.approvedNames = (state.approvedNames || []).filter((n) => n !== e.name);
    } else if (e.t === "rename") {
      renameEverywhere(state, e.to, e.from);
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at, 0, e.player);
    if (e.t === "entries") state.entriesCount = e.before;
  }
}

/** מחליף שם בכל מקומות הלייב של ערב פעיל (שולחן, ממתינים, טיפים…). */
export function renameEverywhere(state, from, to) {
  for (const p of state.players || []) {
    if (p.name === from) p.name = to;
  }
  if (state.pending === from) state.pending = to;
  state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
    p.name === from ? { ...p, name: to } : p,
  );
  state.approvedNames = (state.approvedNames || []).map((n) => (n === from ? to : n));
  state.tips = (state.tips || []).map((t) => (t.name === from ? { ...t, name: to } : t));
  state.coupleFills = (state.coupleFills || []).map((c) => {
    if (!c || typeof c !== "object") return c;
    const next = { ...c };
    if (next.name === from) next.name = to;
    if (next.a === from) next.a = to;
    if (next.b === from) next.b = to;
    return next;
  });
}
