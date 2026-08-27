/* שיחזור ג'יטונים ביציאה לערבים ישנים.
   נוסחת עדן: (קנייה₪ + נטו₪) * cps. ברירת מחדל cps=2:
   קנייה 300 וסיום +185 → (300+185)*2 = 970 ג'יטונים.
   שקול ל־קנייה*cps + נטו*cps.

   קנייה = הצילום האחרון ברשימת ביט לפני הסיכום (`b`), לא סכום צילומים.
   נוסחה מנצחת chips שמורים. בלי קנייה או בלי נטו — מדלגים. */

import { AL, canon, r2 } from "./helpers.js";
import { CPS } from "../../lib/report.js";
import { CHAT_ENTRY_NIGHTS } from "./entryTimings.js";

export const MAX_RECOVERABLE_BUYIN = 2500;

export function prevIso(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** קנייה₪ = הצילום האחרון ברשימת ביט (`b`). לא סוכמים צילומים. */
function buyinFromRow(row) {
  if (!row) return null;
  const last = +row.b;
  if (Number.isFinite(last) && last > 0 && last <= MAX_RECOVERABLE_BUYIN) return r2(last);
  const n = +row.n;
  if (Number.isFinite(n) && n > 0) {
    const implied = r2(n * 50);
    if (implied > 0 && implied <= MAX_RECOVERABLE_BUYIN) return implied;
  }
  return null;
}

function namesMatch(a, b, aliases) {
  const ca = canon(String(a || "").trim(), aliases);
  const cb = canon(String(b || "").trim(), aliases);
  if (ca === cb) return true;
  if (ca.startsWith(cb + " ") || cb.startsWith(ca + " ")) return true;
  return false;
}

/** קנייה₪ לשחקן בלילה, מרשימות ביט. */
export function chatBuyinFor(playerName, iso, aliases = {}, nightsMap = CHAT_ENTRY_NIGHTS) {
  if (!playerName || !iso || !nightsMap) return null;
  const tryIso = [iso, prevIso(iso)].filter(Boolean);
  const wanted = canon(String(playerName).trim(), aliases);

  const tryRow = (nights) => {
    if (!nights) return null;
    for (const i of tryIso) {
      const b = buyinFromRow(nights[i]);
      if (b != null) return b;
    }
    return null;
  };

  const direct = tryRow(nightsMap[wanted]) || tryRow(nightsMap[String(playerName).trim()]);
  if (direct != null) return direct;

  for (const [key, nights] of Object.entries(nightsMap)) {
    if (!namesMatch(key, wanted, aliases)) continue;
    const b = tryRow(nights);
    if (b != null) return b;
  }
  return null;
}

/**
 * chips_at_end = (buyin + net) * cps
 * @returns {number | null}
 */
export function reconstructedChips({ buyin, net, cps = CPS } = {}) {
  const b = +buyin;
  const n = +net;
  const c = +cps || CPS;
  if (!Number.isFinite(b) || b <= 0 || b > MAX_RECOVERABLE_BUYIN) return null;
  if (!Number.isFinite(n)) return null;
  if (!Number.isFinite(c) || c <= 0) return null;
  const chips = r2((b + n) * c);
  if (!Number.isFinite(chips) || chips < 0) return null;
  return chips;
}

function storedChips(entry) {
  if (entry == null || entry.chips == null || entry.chips === "") return null;
  const n = +entry.chips;
  return Number.isFinite(n) ? n : null;
}

function storedBuyin(entry) {
  if (entry == null || entry.buyin == null || entry.buyin === "") return null;
  const n = +entry.buyin;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * קנייה₪: שמורה ברשומה, אחרת מסכום כניסות בצ'אט.
 * @returns {{ buyin: number | null, source: string | null }}
 */
export function resolveEntryBuyin(entry, { iso, aliases = {}, nightsMap = CHAT_ENTRY_NIGHTS } = {}) {
  const stored = storedBuyin(entry);
  if (stored != null) return { buyin: stored, source: "entry" };
  const chat = chatBuyinFor(entry?.name, iso, aliases, nightsMap);
  if (chat != null) return { buyin: chat, source: "chat" };
  return { buyin: null, source: null };
}

/**
 * ג'יטונים ביציאה: תמיד נוסחת עדן כשיש קנייה+נטו.
 * chips = (buyin + net) * cps
 * קנייה שמורה ברשומה, אחרת הצילום האחרון בצ'אט.
 * chips שמורים (לייב/גיבוי) רק אם אין קנייה לשחזור.
 * @returns {{ chips: number | null, source: string | null, buyin: number | null }}
 */
export function resolveEntryChips(entry, { iso, aliases = {}, cps = CPS, nightsMap = CHAT_ENTRY_NIGHTS } = {}) {
  const buyinRes = resolveEntryBuyin(entry, { iso, aliases, nightsMap });
  const buyin = buyinRes.buyin;
  const reconstructed = reconstructedChips({ buyin, net: entry?.amount, cps });
  if (reconstructed != null) {
    const source = buyinRes.source === "entry" ? "buyin+net" : "chat+net";
    return { chips: reconstructed, source, buyin };
  }
  const stored = storedChips(entry);
  if (stored != null) return { chips: stored, source: "stored", buyin };
  return { chips: null, source: null, buyin };
}

/** לילות/שחקנים בלי קנייה לשחזור — לפי תאריך. */
export function skippedChipNights(db, { cps = CPS, nightsMap = CHAT_ENTRY_NIGHTS } = {}) {
  const aliases = AL(db);
  const skipped = [];
  for (const s of db?.sessions || []) {
    for (const e of s.entries || []) {
      const r = resolveEntryChips(e, { iso: s.iso, aliases, cps, nightsMap });
      if (r.chips != null) continue;
      skipped.push({
        iso: s.iso,
        d: s.d,
        mo: s.mo,
        y: s.y,
        name: canon(e.name, aliases),
        net: +e.amount || 0,
        why: r.buyin == null ? "אין קנייה בצ'אט ולא ברשומה" : "נוסחה לא תקינה (ג'יטונים שליליים או קנייה חריגה)",
      });
    }
  }
  return skipped;
}

/**
 * אם הרווח הכי גדול חיובי, שיא הג'יטונים חייב להתאים לערב הזה
 * ברוח (קנייה קטנה + נטו) * cps. מציינים חריגות.
 */
export function chipSanityVsMaxNet(db, { cps = CPS, nightsMap = CHAT_ENTRY_NIGHTS } = {}) {
  const aliases = AL(db);
  const byPlayer = {};
  for (const s of db?.sessions || []) {
    for (const e of s.entries || []) {
      const nm = canon(e.name, aliases);
      const net = +e.amount || 0;
      const r = resolveEntryChips(e, { iso: s.iso, aliases, cps, nightsMap });
      const st = byPlayer[nm] || { name: nm, maxNet: null, maxNetIso: null, maxChips: null, maxChipsIso: null, maxNetBuyin: null, maxNetChips: null };
      if (st.maxNet == null || net > st.maxNet) {
        st.maxNet = net;
        st.maxNetIso = s.iso;
        st.maxNetBuyin = r.buyin;
        st.maxNetChips = r.chips;
      }
      if (r.chips != null && (st.maxChips == null || r.chips > st.maxChips)) {
        st.maxChips = r.chips;
        st.maxChipsIso = s.iso;
      }
      byPlayer[nm] = st;
    }
  }
  const flags = [];
  for (const st of Object.values(byPlayer)) {
    if (!(st.maxNet > 0)) continue;
    const floor = reconstructedChips({ buyin: 50, net: st.maxNet, cps });
    if (st.maxNetChips == null) {
      flags.push({
        name: st.name,
        iso: st.maxNetIso,
        buyin: st.maxNetBuyin,
        net: st.maxNet,
        chips: null,
        why: "ערב השיא בנטו בלי קנייה — אין ג'יטונים משוחזרים",
      });
      continue;
    }
    if (floor != null && st.maxChips != null && st.maxChips + 0.01 < floor) {
      flags.push({
        name: st.name,
        iso: st.maxNetIso,
        buyin: st.maxNetBuyin,
        net: st.maxNet,
        chips: st.maxChips,
        why: `שיא ג'יטונים ${st.maxChips} נמוך מ־(50+${st.maxNet})*${cps || 2}=${floor}`,
      });
    }
  }
  return flags;
}

/** ספירת כיסוי — לסיכום ולטסטים. */
export function chipReconstructionCoverage(db, { cps = CPS, nightsMap = CHAT_ENTRY_NIGHTS } = {}) {
  const aliases = AL(db);
  let stored = 0;
  let reconstructed = 0;
  let skipped = 0;
  const nightsWithAny = new Set();
  const nightsSkippedAll = new Set();

  for (const s of db?.sessions || []) {
    let any = false;
    let allSkipped = true;
    for (const e of s.entries || []) {
      const r = resolveEntryChips(e, { iso: s.iso, aliases, cps, nightsMap });
      if (r.source === "stored") {
        stored += 1;
        any = true;
        allSkipped = false;
      } else if (r.chips != null) {
        reconstructed += 1;
        any = true;
        allSkipped = false;
      } else {
        skipped += 1;
      }
    }
    if (any) nightsWithAny.add(s.iso);
    if (allSkipped && (s.entries || []).length) nightsSkippedAll.add(s.iso);
  }

  return {
    stored,
    reconstructed,
    skipped,
    nightsWithChips: nightsWithAny.size,
    nightsWithoutBuyin: nightsSkippedAll.size,
  };
}
