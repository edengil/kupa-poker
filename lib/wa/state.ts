/* עזרי מצב טהורים לערב חי: יצירת מצב, ביטול פעולות ושינוי שמות. */

import { ALIASES, findPlayer, resolveAlias } from "./parse.js";

export const r2 = (v: number): number => Math.round(v * 100) / 100;

export interface WaBuyinEvent {
  amount: number;
  at?: number;
  total?: number;
  pot?: number;
}

export interface WaPlayer {
  name: string;
  buyin?: number | string;
  cashout?: string | number;
  tipsGiven?: number;
  buyinEvents?: WaBuyinEvent[];
}

export interface WaTip {
  id?: string | number;
  name: string;
  amount?: number;
  at?: number;
}

export interface WaPendingApproval {
  name: string;
  amount: number;
  at: number;
}

export interface WaLiveState {
  entriesCount: string | number;
  addAmt: number;
  startedAt: number | null;
  players: WaPlayer[];
  applied: Record<string, unknown>;
  pending: string | null;
  closing: boolean;
  pendingApprovals: WaPendingApproval[];
  approvedNames: string[];
  pendingRemindedAt: number | null;
  bitIdleRemindedAt?: number | null;
  ts?: number;
  tips: WaTip[];
  tipComplimentBag: number[];
  tipComplimentLast: number | null;
  coupleFills: Array<Record<string, unknown>>;
  savings5: boolean;
  savingsPot: number;
  potDraft?: string;
}

export interface UndoEntry {
  t: string;
  name?: string;
  delta?: number;
  created?: boolean;
  ev?: WaBuyinEvent;
  before?: string | number;
  amount?: number;
  tipId?: string | number;
  bagBefore?: number[];
  lastBefore?: number | null;
  female?: boolean;
  at?: number;
  pending?: WaPendingApproval;
  player?: WaPlayer;
  to?: string;
  from?: string;
}

type AliasTable = typeof ALIASES;

export function knownSetOf(list: Set<string> | string[] | null | undefined): Set<string> | null {
  if (!list) return null;
  if (list instanceof Set) return list.size ? list : null;
  if (Array.isArray(list)) return list.length ? new Set(list) : null;
  return null;
}

export function isKnownName(
  raw: string,
  known: Set<string> | string[] | null | undefined,
  extra: string[] = [],
  aliases: AliasTable = ALIASES,
): boolean {
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

export function pickPending(
  list: Array<{ name: string }>,
  rawName: string,
  aliases: AliasTable = ALIASES,
): number {
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
function expandSeatedName(
  state: WaLiveState,
  index: number,
  canonical: string,
  aliases: AliasTable,
): void {
  if (index < 0 || !canonical) return;
  const current = state.players[index]?.name;
  if (!current || current === canonical) return;
  if (state.players.some((p, i) => i !== index && p.name === canonical)) return;
  const aliased = resolveAlias(current, aliases) === canonical;
  const prefix = canonical.startsWith(current + " ") || current.startsWith(canonical + " ");
  if (!aliased && !prefix) return;
  renameEverywhere(state, current, canonical);
}

export function findInState(
  state: WaLiveState,
  rawName: string,
  aliases: AliasTable,
): ReturnType<typeof findPlayer> {
  const found = findPlayer(state.players, rawName, aliases);
  if (found.index !== -1 && found.resolved) {
    expandSeatedName(state, found.index, found.resolved, aliases);
  }
  return found;
}

/** חותמת קנייה מרכזית אחת לכל נתיבי הבוט (ישיבה ישירה, ריביי, אישור) —
 * זהה להתנהגות האפליקציה (LiveTab): החוב נשאר מלא, 5% מהקנייה נרשם כ־pot
 * על האירוע (בשקלים) ומצטבר ב־savingsPot של הלייב, ונוצר אירוע קנייה אחד
 * בדיוק לכל קנייה. הג'יטונים בפועל נגזרים בצריכה: (buyin − Σ pot) × cps.
 * הפחתה (delta שלילי) רק מורידה את החוב — בלי אירוע ובלי קופה, כמו באפליקציה. */
export function stampBuyin(
  state: WaLiveState,
  player: WaPlayer,
  delta: number,
  at: number = Date.now(),
): WaPlayer {
  const prev = +player.buyin || 0;
  const buyin = Math.max(0, r2(prev + delta));
  const applied = r2(buyin - prev);
  if (!(applied > 0)) return { ...player, buyin };
  const toPot = state.savings5 ? r2(applied * 0.05) : 0;
  if (toPot > 0) state.savingsPot = r2((Number(state.savingsPot) || 0) + toPot);
  const events = [
    ...(player.buyinEvents || []),
    { amount: applied, at, total: buyin, pot: toPot || undefined },
  ];
  return { ...player, buyin, buyinEvents: events };
}

/** האירוע שחותמת הוסיפה לשחקן, אם הוסיפה — נרשם ברשומת הביטול של הפעולה
 * כדי שהביטול יסיר בדיוק אותו אירוע (ולא אירוע זהה־סכום מהודעה אחרת). */
export function stampedEventOf(before: WaPlayer, after: WaPlayer): WaBuyinEvent | undefined {
  const b = before.buyinEvents || [];
  const a = after.buyinEvents || [];
  return a.length > b.length ? a[a.length - 1] : undefined;
}

/** מחסיר מ־savingsPot את ה־pot של כל אירועי שחקן שיוצא מהשולחן בביטול —
 * שומר על האינווריאנט savingsPot = ‏Σ pot של כל האירועים החיים. */
function unstampPlayerPots(state: WaLiveState, player: WaPlayer): void {
  const sum = (player.buyinEvents || []).reduce((t, ev) => t + (Number(ev.pot) || 0), 0);
  if (sum) state.savingsPot = r2((Number(state.savingsPot) || 0) - sum);
}

/** היפוך מדויק של חותמת על שחקן קיים: מסיר את האירוע שהחותמת הוסיפה
 * ומחסיר את ה־pot שלו מ־savingsPot. זיהוי האירוע: קודם לפי צילום האירוע
 * שנרשם בפעולה (amount+at+total), ובנפילה לאחור — לרשומות ישנות בלי
 * צילום — לפי האירוע האחרון עם אותו סכום. */
function unstampEvent(
  state: WaLiveState,
  player: WaPlayer,
  entry: UndoEntry,
  amount: number,
): WaBuyinEvent[] {
  const events = [...(player.buyinEvents || [])];
  const snap = entry.ev;
  const matches = (cand: WaBuyinEvent): boolean =>
    snap
      ? cand.amount === snap.amount && cand.at === snap.at && cand.total === snap.total
      : cand.amount === amount;
  let idx = -1;
  for (let k = events.length - 1; k >= 0; k--) {
    if (matches(events[k])) {
      idx = k;
      break;
    }
  }
  if (idx === -1 && snap) {
    for (let k = events.length - 1; k >= 0; k--) {
      if (events[k].amount === amount) {
        idx = k;
        break;
      }
    }
  }
  if (idx === -1) return events;
  const [removed] = events.splice(idx, 1);
  if (removed.pot) state.savingsPot = r2((Number(state.savingsPot) || 0) - removed.pot);
  return events;
}

export function blank(live?: Partial<WaLiveState> | null): WaLiveState {
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
    /* 5% לקופה הצדדית: דלוק אוטומטית (עדן, 2026-10-14) — מכובה רק אם כובה
       במפורש באפליקציה. חייב לעבור דרך blank, אחרת כל כתיבת בוט מוחקת אותו. */
    savings5: live?.savings5 !== false,
    savingsPot: Number(live?.savingsPot) || 0,
    /* עריכת המנהל לסכום הקופה של הערב (אישור בסוף ערב) — חייבת לעבור דרך
       blank, אחרת כל כתיבת בוט מוחקת אותה, כמו שקרה ל־savings5 בעבר. */
    potDraft: typeof live?.potDraft === "string" ? live.potDraft : "",
  };
}

export const openPlayers = (state: WaLiveState): WaPlayer[] =>
  state.players.filter((p) => p.cashout === "" || p.cashout == null);

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה. */
export function undo(state: WaLiveState, entries: UndoEntry[]): void {
  for (const e of [...entries].reverse()) {
    const i = state.players.findIndex((p) => p.name === e.name);
    if (i === -1) continue;
    if (e.t === "add") {
      if (e.created) {
        unstampPlayerPots(state, state.players[i]);
        state.players.splice(i, 1);
      } else {
        const p = state.players[i];
        const delta = e.delta as number;
        state.players[i] = {
          ...p,
          buyin: r2((+p.buyin || 0) - delta),
          buyinEvents: delta > 0 ? unstampEvent(state, p, e, delta) : p.buyinEvents,
        };
      }
    } else if (e.t === "out") {
      state.players[i] = { ...state.players[i], cashout: e.before };
    } else if (e.t === "tip") {
      const tipsGiven = Math.max(0, r2((+state.players[i].tipsGiven || 0) - (e.amount as number)));
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
      if (e.created && j !== -1) {
        unstampPlayerPots(state, state.players[j]);
        state.players.splice(j, 1);
      } else if (!e.created && j !== -1) {
        /* אישור לשחקן קיים הוסיף קנייה דרך החותמת — הופכים גם אותה:
           חוב, אירוע חתום ו־pot, בדיוק כמו בביטול ריביי. */
        const p = state.players[j];
        const amount = e.pending?.amount ?? e.amount ?? 0;
        if (amount > 0) {
          state.players[j] = {
            ...p,
            buyin: Math.max(0, r2((+p.buyin || 0) - amount)),
            buyinEvents: unstampEvent(state, p, e, amount),
          };
        }
      }
      if (e.pending) state.pendingApprovals = [...(state.pendingApprovals || []), e.pending];
      state.approvedNames = (state.approvedNames || []).filter((n) => n !== e.name);
    } else if (e.t === "rename") {
      renameEverywhere(state, e.to as string, e.from as string);
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at as number, 0, e.player as WaPlayer);
    if (e.t === "entries") state.entriesCount = e.before as string;
  }
}

/** מחליף שם בכל מקומות הלייב של ערב פעיל (שולחן, ממתינים, טיפים…). */
export function renameEverywhere(state: WaLiveState, from: string, to: string): void {
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
