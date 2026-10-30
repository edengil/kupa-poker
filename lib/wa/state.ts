/* עזרי מצב טהורים לערב חי: יצירת מצב, ביטול פעולות ושינוי שמות. */

import { ALIASES, findPlayer, resolveAlias } from "./parse.js";

export const r2 = (v: number): number => Math.round(v * 100) / 100;

export interface WaBuyinEvent {
  amount: number;
  at?: number;
  total?: number;
  pot?: number;
  /* זהות יציבה של החותמת: מזהה הודעת הוואטסאפ + אינדקס הפקודה בתוכה.
     הצילום (amount+at+total) אינו זהות — שתי קניות של 50 באותה אלפית־שנייה
     נראות זהות, ושם השחקן הוא תווית משתנה. ה־sid הוא מה שמאפשר לביטול
     למצוא בדיוק את החותמת הזו גם אחרי שינוי שם, ולהחלה־מחדש לנחות על
     אותו שחקן. שדה פנימי של הבוט — מוסר בהקרנת הצופה (publicShare/SQL). */
  sid?: string;
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
  /* חותמות ניסיון־שליחה (גל 3ב): נכתבות כשהתזכורת נשלחה אך השליחה נכשלה,
     כדי למנוע ספאם ניסיונות על ערוץ פג — בלי לסמן "נשלח" בשקר. חותמת
     ההצלחה (RemindedAt) נכתבת רק אחרי שליחה שהצליחה בפועל. */
  pendingRemindAttemptAt?: number | null;
  bitIdleRemindAttemptAt?: number | null;
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
  sid?: string,
): WaPlayer {
  const prev = +player.buyin || 0;
  const buyin = Math.max(0, r2(prev + delta));
  const applied = r2(buyin - prev);
  if (!(applied > 0)) return { ...player, buyin };
  const toPot = state.savings5 ? r2(applied * 0.05) : 0;
  if (toPot > 0) state.savingsPot = r2((Number(state.savingsPot) || 0) + toPot);
  const ev: WaBuyinEvent = { amount: applied, at, total: buyin, pot: toPot || undefined };
  if (sid) ev.sid = sid;
  const events = [...(player.buyinEvents || []), ev];
  return { ...player, buyin, buyinEvents: events };
}

/** האירוע שחותמת הוסיפה לשחקן, אם הוסיפה — נרשם ברשומת הביטול של הפעולה
 * כדי שהביטול יסיר בדיוק אותו אירוע (ולא אירוע זהה־סכום מהודעה אחרת). */
export function stampedEventOf(before: WaPlayer, after: WaPlayer): WaBuyinEvent | undefined {
  const b = before.buyinEvents || [];
  const a = after.buyinEvents || [];
  return a.length > b.length ? a[a.length - 1] : undefined;
}

/** התאמה מלאה לצילום אירוע שנרשם ברשומת הביטול. */
function matchesEventSnapshot(cand: WaBuyinEvent, snap?: WaBuyinEvent): boolean {
  return !!snap && cand.amount === snap.amount && cand.at === snap.at && cand.total === snap.total;
}

/** מזהה החותמת של רשומת ביטול — נשמר על האירוע החתום עצמו (entry.ev). */
function stampIdOf(entry: UndoEntry): string | undefined {
  return entry.ev?.sid || undefined;
}

/** היפוך מדויק של חותמת על שחקן קיים: מסיר את האירוע שהחותמת הוסיפה
 * ומחסיר את ה־pot שלו מ־savingsPot. זיהוי האירוע: קודם לפי מזהה החותמת
 * (חד־משמעי, לא תלוי שם/סכום/זמן); בנפילה לאחור לפי צילום האירוע שנרשם
 * בפעולה (amount+at+total), ולרשומות ישנות בלי צילום — לפי האירוע האחרון
 * עם אותו סכום. */
function unstampEvent(
  state: WaLiveState,
  player: WaPlayer,
  entry: UndoEntry,
  amount: number,
): WaBuyinEvent[] {
  const events = [...(player.buyinEvents || [])];
  const sid = stampIdOf(entry);
  const snap = entry.ev;
  let idx = -1;
  if (sid) {
    idx = events.findIndex((cand) => cand.sid === sid);
  }
  if (idx === -1) {
    const matches = (cand: WaBuyinEvent): boolean =>
      snap ? matchesEventSnapshot(cand, snap) : cand.amount === amount;
    for (let k = events.length - 1; k >= 0; k--) {
      if (matches(events[k])) {
        idx = k;
        break;
      }
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

/** איתור השחקן לרשומת ביטול של חותמת קנייה. שם הוא תווית משתנה — שחקן
 * ששמו תוקן בין ההחלה למסירה החוזרת כבר לא נמצא לפי השם שברשומה, והביטול
 * מדולג והפקודה חותמת שוב. לכן מאתרים קודם לפי מזהה החותמת: אירוע שייך
 * לשחקן אחד בדיוק, והמזהה חד־משמעי גם כששני אירועים חולקים צילום זהה.
 * בנפילה לאחור (רשומות בלי מזהה): צילום האירוע — שחקן בשם המדויק שמחזיק
 * את האירוע קודם; אחרת השחקן היחיד שמחזיק אותו. בלי צילום או בצילום לא
 * חד־משמעי לא מנחשים שחקן אחר, ונשארים עם ההתאמה לפי שם. */
function findStampPlayerIndex(state: WaLiveState, entry: UndoEntry): number {
  const exact = state.players.findIndex((p) => p.name === entry.name);
  const sid = stampIdOf(entry);
  if (sid) {
    const byId = state.players
      .map((p, i) => ((p.buyinEvents || []).some((ev) => ev.sid === sid) ? i : -1))
      .filter((i) => i !== -1);
    if (byId.length === 1) return byId[0];
    if (byId.length > 1) return exact; // כפילות שחיתותית — לא מנחשים
  }
  if (!entry.ev) return exact;
  if (
    exact !== -1 &&
    (state.players[exact].buyinEvents || []).some((ev) => matchesEventSnapshot(ev, entry.ev))
  ) {
    return exact;
  }
  const byEvent = state.players
    .map((p, i) => ((p.buyinEvents || []).some((ev) => matchesEventSnapshot(ev, entry.ev)) ? i : -1))
    .filter((i) => i !== -1);
  return byEvent.length === 1 ? byEvent[0] : exact;
}

/** מסיר חותמת אחת משחקן: האירוע שהיא הוסיפה, ה־pot שלו והחוב שלו בלבד. */
function removeStampedBuyin(
  state: WaLiveState,
  playerIndex: number,
  entry: UndoEntry,
  amount: number,
): boolean {
  const p = state.players[playerIndex];
  if (!p || !(amount > 0)) return false;
  const before = p.buyinEvents || [];
  const events = unstampEvent(state, p, entry, amount);
  if (events.length === before.length) return false;
  state.players[playerIndex] = {
    ...p,
    buyin: Math.max(0, r2((+p.buyin || 0) - amount)),
    buyinEvents: events,
  };
  return true;
}

/** ביטול רשומת יצירה ברמת החותמת: מסירים רק את האירוע שהיצירה חתמה.
 * השחקן עצמו יוצא מהשולחן רק אם לא נשארו לו אירועי קנייה או חוב
 * מהודעות אחרות — ריביי מאוחר יותר של הודעה אחרת שורד מסירה חוזרת
 * של הודעת היצירה, והחוב מתעדכן לפי האירועים שנשארו. */
function undoCreatedStamp(
  state: WaLiveState,
  playerIndex: number,
  entry: UndoEntry,
  amount: number,
): void {
  if (!removeStampedBuyin(state, playerIndex, entry, amount)) return;
  const p = state.players[playerIndex];
  if (p && !(p.buyinEvents || []).length && !(+p.buyin || 0)) {
    state.players.splice(playerIndex, 1);
  }
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
    /* חותמות הניסיון עוברות רק כשהן קיימות — כדי לא לשנות את צורת הלייב
       לערבים שמעולם לא ניסו תזכורת. */
    ...(live?.pendingRemindAttemptAt != null
      ? { pendingRemindAttemptAt: live.pendingRemindAttemptAt }
      : {}),
    ...(live?.bitIdleRemindAttemptAt != null
      ? { bitIdleRemindAttemptAt: live.bitIdleRemindAttemptAt }
      : {}),
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

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה.
 * מחזיר מפת נחיתה להחלה־מחדש: מזהה חותמת → השם הנוכחי של השחקן שהביטול
 * נגע בו. ההחלה שאחרי הביטול חייבת לנחות על אותו שחקן באותו שם — פתרון
 * השם הגולמי מההודעה מחדש דרך טבלת הכינויים עלול להושיב אדם אחר לגמרי
 * (למשל "דני" → "דני גוטניק" כשהיושב בפועל תוקן ל"דני לוי"). */
export function undo(state: WaLiveState, entries: UndoEntry[]): Map<string, string> {
  const retarget = new Map<string, string>();
  for (const e of [...entries].reverse()) {
    let i = state.players.findIndex((p) => p.name === e.name);
    /* רשומות קנייה מאותבות לפי מזהה/צילום האירוע, לא רק לפי שם — שם ששונה
       מאז ההחלה לא שובר את הביטול. שאר סוגי הרשומות: לפי שם, כמקודם. */
    if (e.t === "add" || e.t === "approve") i = findStampPlayerIndex(state, e);
    if (i === -1) continue;
    if (e.t === "add" || e.t === "approve") {
      const sid = stampIdOf(e);
      if (sid) retarget.set(sid, state.players[i].name);
    }
    if (e.t === "add") {
      if (e.created) {
        undoCreatedStamp(state, i, e, e.delta ?? 0);
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
      const j = i;
      const currentName = state.players[j]?.name;
      const amount = e.pending?.amount ?? e.amount ?? 0;
      if (e.created) {
        /* יצירה באישור מתבטלת ברמת החותמת כמו יצירה בישיבה ישירה —
           אירועי קנייה מהודעות אחרות שורדים, והשחקן נשאר איתם. */
        undoCreatedStamp(state, j, e, amount);
      } else {
        /* אישור לשחקן קיים הוסיף קנייה דרך החותמת — הופכים גם אותה:
           חוב, אירוע חתום ו־pot, בדיוק כמו בביטול ריביי. */
        const p = state.players[j];
        if (p && amount > 0) {
          state.players[j] = {
            ...p,
            buyin: Math.max(0, r2((+p.buyin || 0) - amount)),
            buyinEvents: unstampEvent(state, p, e, amount),
          };
        }
      }
      if (e.pending) state.pendingApprovals = [...(state.pendingApprovals || []), e.pending];
      state.approvedNames = (state.approvedNames || []).filter(
        (n) => n !== e.name && n !== currentName,
      );
    } else if (e.t === "rename") {
      renameEverywhere(state, e.to as string, e.from as string);
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at as number, 0, e.player as WaPlayer);
    if (e.t === "entries") state.entriesCount = e.before as string;
  }
  return retarget;
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
