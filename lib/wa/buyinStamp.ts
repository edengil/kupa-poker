/* חותמות קנייה וחיפוש שחקנים במצב הלייב — חולץ מ־lib/wa/state.ts
   (גל B, מנה 6.1). state.ts מייצא הלאה את כל השמות הציבוריים מכאן,
   כך שאף יבואן לא השתנה.
   מעגליות: expandSeatedName קורא ל־renameEverywhere שנשאר ב־state.ts
   (יעבור רק במנה 6.4), ו־state.ts מייבא מכאן את פנימי הביטול. כל
   הקשירות החוצות הן הכרזות פונקציה הנקראות בזמן קריאה בלבד — אין
   הפעלה ברמת־המודול ואין תלות בקבועים (r2 מיובא מהבעלים שלו
   ב־lib/poker/helpers.js, כמו potForBuyin). */

import { ALIASES, findPlayer, resolveAlias } from "./parse.js";
import { potForBuyin, r2 } from "../poker/helpers.js";
import { renameEverywhere } from "./state";
import type { UndoEntry, WaBuyinEvent, WaLiveState, WaPlayer } from "./state";

type AliasTable = typeof ALIASES;

function knownSetOf(list: Set<string> | string[] | null | undefined): Set<string> | null {
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
  const toPot = state.savings5 ? potForBuyin(applied) : 0;
  if (toPot > 0) state.savingsPot = r2((Number(state.savingsPot) || 0) + toPot);
  const ev: WaBuyinEvent = { amount: applied, at, total: buyin, pot: toPot || undefined };
  if (sid) ev.sid = sid;
  const events = [...(player.buyinEvents || []), ev];
  return { ...player, buyin, buyinEvents: events };
}

/** סך ה־pot החתום על אירועי הקנייה של שחקן — החלק שלו ב־savingsPot של
 * הלייב. האינווריאנט של הלייב: savingsPot == ‏Σ playerPotSum על כל
 * השחקנים החיים; כל הוספה/הסרה של שחקן או אירוע חייבת לעדכן את שניהם. */
export function playerPotSum(player?: WaPlayer | null): number {
  return r2((player?.buyinEvents || []).reduce((t, ev) => t + (Number(ev.pot) || 0), 0));
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
export function stampIdOf(entry: UndoEntry): string | undefined {
  return entry.ev?.sid || undefined;
}

/** היפוך מדויק של חותמת על שחקן קיים: מסיר את האירוע שהחותמת הוסיפה
 * ומחסיר את ה־pot שלו מ־savingsPot. זיהוי האירוע: לפי מזהה החותמת
 * (חד־משמעי, לא תלוי שם/סכום/זמן). לרשומה עם מזהה אין נפילה לצילום —
 * אם האירוע עם המזהה לא על השחקן, החותמת איננה וההסרה היא no-op;
 * נפילה לצילום הייתה צורכת אירוע זהה־מראה ומעבירה כסף לאדם הלא־נכון.
 * הנפילה לצילום (amount+at+total), ולרשומות ישנות בלי צילום — לאירוע
 * האחרון עם אותו סכום, נשארת רק לרשומות ישנות בלי מזהה. */
export function unstampEvent(
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
    if (idx === -1) return events;
  } else {
    const matches = (cand: WaBuyinEvent): boolean =>
      snap ? matchesEventSnapshot(cand, snap) : cand.amount === amount;
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
  }
  const [removed] = events.splice(idx, 1);
  if (removed.pot) state.savingsPot = r2((Number(state.savingsPot) || 0) - removed.pot);
  return events;
}

/** איתור השחקן לרשומת ביטול של חותמת קנייה. שם הוא תווית משתנה — שחקן
 * ששמו תוקן בין ההחלה למסירה החוזרת כבר לא נמצא לפי השם שברשומה, והביטול
 * מדולג והפקודה חותמת שוב. לכן מאתרים קודם לפי מזהה החותמת: אירוע שייך
 * לשחקן אחד בדיוק, והמזהה חד־משמעי גם כששני אירועים חולקים צילום זהה.
 * לרשומה עם מזהה שאין לו מחזיק חי (השחקן הוסר מאז) — החותמת איננה
 * והביטול הוא no-op: אסור ליפול לצילום, כי אירוע זהה־מראה של שחקן אחר
 * (אותו סכום/at/total) ייצרך והכסף ינחת על האדם הלא־נכון.
 * בנפילה לאחור (רק רשומות בלי מזהה): צילום האירוע — שחקן בשם המדויק
 * שמחזיק את האירוע קודם; אחרת השחקן היחיד שמחזיק אותו. בלי צילום או
 * בצילום לא חד־משמעי לא מנחשים שחקן אחר, ונשארים עם ההתאמה לפי שם. */
export function findStampPlayerIndex(state: WaLiveState, entry: UndoEntry): number {
  const exact = state.players.findIndex((p) => p.name === entry.name);
  const sid = stampIdOf(entry);
  if (sid) {
    const byId = state.players
      .map((p, i) => ((p.buyinEvents || []).some((ev) => ev.sid === sid) ? i : -1))
      .filter((i) => i !== -1);
    if (byId.length === 1) return byId[0];
    if (byId.length > 1) return exact; // כפילות שחיתותית — לא מנחשים
    return -1; // אין מחזיק חי למזהה — החותמת איננה, הביטול no-op
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
export function undoCreatedStamp(
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
