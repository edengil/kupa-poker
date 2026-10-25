/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf, nightDateParts } from "./report";
import { settle, roundedNets, isCashOnly, transferVerb, isFemaleName } from "./settlement";
import { toWhatsApp, canon, DEFAULT_ALIASES, r2 } from "./poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
} from "./tipSummaryCopy.js";
import { withBotMark } from "./botMark";
import { savedSettlement, settlementBasis } from "./savedSettlement";
import { routePotThroughEden, POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

/** האם לרשומות יש buyin/chips (לייב) או רק נטו (הזנה ידנית). */
export function sessionHasBuyinChips(session) {
  const entries = session?.entries || [];
  return entries.some((e) => e.buyin != null || e.chips != null);
}

/**
 * שחקנים ל־settle מתוך ערב שמור.
 * אם יש buyin/chips — משתמשים בהם; אחרת נטו כמו InputTab (cps=1 אצל הקורא).
 */
export function playersFromSession(session) {
  const entries = session?.entries || [];
  if (!entries.length) return [];

  if (sessionHasBuyinChips(session)) {
    return entries.map((e) => {
      if (e.buyin != null || e.chips != null) {
        return {
          name: e.name,
          buyin: +e.buyin || 0,
          cashout: String(e.chips != null ? +e.chips || 0 : Math.max(0, +e.amount || 0)),
          tipsGiven: +e.tipsGiven || 0,
        };
      }
      /* רשומה מעורבת בלי פירוט — כמו נטו */
      return {
        name: e.name,
        buyin: e.amount < 0 ? -e.amount : 0,
        cashout: String(Math.max(0, e.amount)),
        tipsGiven: +e.tipsGiven || 0,
      };
    });
  }

  return entries.map((e) => ({
    name: e.name,
    buyin: e.amount < 0 ? -e.amount : 0,
    cashout: String(Math.max(0, e.amount)),
    tipsGiven: +e.tipsGiven || 0,
  }));
}

const EDEN_CANON = "עדן גיל";

/**
 * קופת החיסכון (חיסכון 5% מהג'יטונים) התחילה בערב 10.10.2026 — רק מערב
 * זה ואילך. בערבים קודמים אין קופה: עודף ברישום מתחלק כרגיל בין החייבים,
 * כמו שהיה בפועל כשאותם ערבים נסגרו (תיקון מעדן, 2026-10-13).
 */
export const POT_START_ISO = "2026-10-10";

export function sessionHasPot(session) {
  const iso = String(session?.iso || "");
  return iso !== "" && iso >= POT_START_ISO;
}

/**
 * [LEGACY — מודל 2026-10-11, הוחלף ב־25.10.2026] שחקנים לחישוב ההעברות —
 * העודף מגולם בנטו של עדן גיל. נשמר אך ורק כדי לזהות ולשרת חלוקות ידניות
 * ישנות שה־basis שלהן חושב על השחקנים המותאמים (ערבים סגורים לא משתנים).
 * חלוקות חדשות עוברות דרך resolveSettlement/settleWithPot בלבד.
 */
export function playersWithPot(session) {
  const players = playersFromSession(session);
  if (!sessionHasPot(session)) return players;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const total = players.reduce((s, p) => s + netOf(p, cps), 0);
  const surplus = Math.max(0, -total);
  if (!(surplus > 0)) return players;
  const idx = players.findIndex((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  if (idx < 0) return players; // עדן לא בערב — הוולידטור ב-paymentPlan יתריע
  const p = players[idx];
  const newNet = netOf(p, cps) + surplus;
  const adjusted = { ...p };
  if (newNet >= 0) {
    adjusted.buyin = 0;
    adjusted.cashout = String(newNet * cps);
  } else {
    adjusted.buyin = -newNet;
    adjusted.cashout = "0";
  }
  const out = players.slice();
  out[idx] = adjusted;
  return out;
}

/* ============================================================================
   מודל הקופה (הכרעת עדן, 25.10.2026) — מחליף את מודל 10.11:
   • הקופה היא ה־5% המתועד בשדה session.savingsPot ("רשום") — תמיד מלאה,
     ולעולם לא נגזרת מפער הערב ולא נחתכת בגללו. בתוכנית החלוקה עצמה
     ההעברה לקופה היא ה"בפועל" אם נערך (R3, potPlanFor) — הרשום נשאר
     הסכום הרשמי בפנקס, והבפועל הוא מה שמועבר בפועל בתוכנית.
   • "בפועל" (session.savingsPotActual) = כמה נשמר במזומן בפועל; ניתן לעריכה,
     ברירת מחדל = הרשום. יתרת המזומן הראשית עוקבת אחרי ה"בפועל".
   • פער הערב (סכום הנטו) הוא שורה נפרדת בשמו — לא קופה ולא חלק ממנה.
   • חלוקת ההעברות חייבת לממן: זוכים (אחרי חלוקת חוסר) + קופה מלאה, מתוך
     תשלומי החייבים המלאים. חוסר מימון = (זכיות + קופה) − חובות, ומתחלק
     בין המרוויחים ביחס לרווחים, בשקלים שלמים — לעולם לא מהקופה.
   • הנטו הגולמי של עדן לא משתנה בשום שלב; אין יותר ניתוב עודף דרך עדן.
   ========================================================================== */

/** שם עדן כפי שהוא מופיע ברשומות הערב (לניתוב הקופה דרכו), או null. */
export function edenNameIn(session) {
  const players = playersFromSession(session || {});
  const eden = players.find((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  return eden ? eden.name : null;
}

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

/** סכום הקופה הרשום לערב: השדה המתועד; אם חסר והמתג דלק — 5% מהקניות. */
export function potRecordedFor(session) {
  if (!sessionHasPot(session)) return 0;
  const raw = session?.savingsPot;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw))) return r2(Number(raw));
  if (session?.savings5 && sessionHasBuyinChips(session)) {
    const totalBuyin = (session.entries || []).reduce((s, e) => s + (+e.buyin || 0), 0);
    return Math.round(totalBuyin * 0.05);
  }
  return 0;
}

/** סכום הקופה בפועל לערב: שדה savingsPotActual אם הוגדר, אחרת הרשום. */
export function potActualFor(session) {
  const raw = session?.savingsPotActual;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
    return r2(Number(raw));
  }
  return potRecordedFor(session);
}

/**
 * סכום הקופה בתוכנית החלוקה (הכרעת עדן, 25.10 — R3): אם נערך "בפועל"
 * (savingsPotActual) — ההעברה לקופה בתוכנית היא הבפועל; בלי שדה — הרשום.
 * זהו בדיוק potActualFor; השם הנפרד מסמן שהשימוש הוא בבניית התוכנית.
 * פנקס הקופה (רשום/בפועל/יתרות ב־potOverview) לא נגזר מכאן ולא משתנה.
 */
export function potPlanFor(session) {
  return potActualFor(session);
}

/**
 * מפת חוסר אוטומטית (יחסית לרווחים, דרך settleWithPot) לסכום קופה נתון —
 * משמשת "להקפיא" את החלוקה כמפה ידנית כשעורכים "בפועל" לערב בלי חלוקה
 * שמורה: המפה מוחלטת, ולכן צופה שמחשב עם הרשום (בלי לדעת את הבפועל)
 * מקבל את אותם סכומי שחקנים בדיוק.
 * @returns {Object<string, number>} שם זוכה → סכום שנחתך; {} אם אין חוסר.
 */
export function autoShortfallMapForPot(session, potAmount) {
  const players = playersFromSession(session || {});
  if (!players.length) return {};
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const r = settleWithPot(players, cps, Math.max(0, Math.round(+potAmount || 0)));
  const received = Object.create(null);
  for (const t of r.playerTransfers || []) {
    received[t.to] = (received[t.to] || 0) + t.amount;
  }
  // ההשוואה היא מול הנטו הגולמי — ה־nets של settleWithPot כבר אחרי החלוקה
  const map = {};
  for (const n of roundedNets(players, cps)) {
    if (n.net <= 0) continue;
    const cut = Math.round(n.net - (received[n.name] || 0));
    if (cut > 0) map[n.name] = cut;
  }
  return map;
}

/** פער הערב החתום: סכום הנטו של כל השחקנים (שלילי = עודף מזומן בקופה). */
export function nightGap(session) {
  const players = playersFromSession(session);
  if (!players.length) return 0;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  return roundedNets(players, cps).reduce((s, r) => s + r.net, 0);
}

/**
 * הקופה של הערב — מעכשיו (25.10) זהו הסכום הרשום (ה־5%), לא פער הערב.
 * נשמר השם computedPot לתאימות קוראים; הסמנטיקה הישנה (גודל העודף) זמינה
 * דרך nightGap.
 */
export function computedPot(session) {
  return potRecordedFor(session);
}

/**
 * חלוקה עם קופה: מריץ את settle על השחקנים הגולמיים + כיור הקופה כזוכה
 * מוגן (נחתך אחרון). ההעברות לכיור מסומנות pot:true ולא מוצגות בקבוצה.
 * עודף מעבר לקופה מופנה לכיור "עודף ערב" (residual:true) כדי שכל חייב
 * ישלם מלא וכל זוכה יקבל מלא — בלי לגעת בנטו של אף שחקן.
 */
export function settleWithPot(players, cps, potAmount, opts = {}) {
  const pot = Math.max(0, Math.round(+potAmount || 0));
  const sinkClaim = pot;
  const withSink = [
    ...players,
    { name: POT_SINK_NAME, buyin: 0, cashout: String(sinkClaim * cps) },
  ];
  const res = settle(withSink, cps, {
    ...opts,
    preferCreditors: [POT_SINK_NAME, ...(opts.preferCreditors || [])],
  });
  const playerNets = res.nets.filter((n) => n.name !== POT_SINK_NAME);
  const sinkNet = res.nets.find((n) => n.name === POT_SINK_NAME)?.net ?? sinkClaim;
  // הקופה חובת הפקדה של עדן — מנתבים את תשלומי הקופה דרכו (הכרעת 25.10).
  const edenPlayer = players.find((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  let allTransfers = res.transfers;
  if (edenPlayer && pot > 0) {
    allTransfers = routePotThroughEden(allTransfers, edenPlayer.name, POT_SINK_NAME).transfers;
  }
  const potTransfers = allTransfers
    .filter((t) => t.to === POT_SINK_NAME)
    .map((t) => (t.pot ? t : { ...t, pot: true }));
  const playerTransfers = allTransfers.filter((t) => t.to !== POT_SINK_NAME);
  // עודף מעבר לקופה: חייבים שעדיין נותרו עם חוב אחרי שכל התביעות שולמו.
  const paidOut = Object.create(null);
  for (const t of allTransfers) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) paidOut[n] = (paidOut[n] || 0) + a;
    } else {
      paidOut[t.from] = (paidOut[t.from] || 0) + t.amount;
    }
  }
  const residualTransfers = [];
  let residual = 0;
  for (const n of playerNets) {
    if (n.net >= 0) continue;
    const leftover = -n.net - (paidOut[n.name] || 0);
    if (leftover > 0) {
      residual += leftover;
      residualTransfers.push({ from: n.name, to: RESIDUAL_SINK_NAME, amount: leftover, residual: true });
    }
  }
  // היתרות הצפויות הן הנטו אחרי קיצוץ המימון — הניתוב דרך עדן לא משנה
  // סכומים כוללים לאף שחקן, רק את יעדי התשלום שלו עצמו.
  const expected = [...playerNets];
  if (pot > 0) expected.push({ name: POT_SINK_NAME, net: sinkNet });
  if (residual > 0) expected.push({ name: RESIDUAL_SINK_NAME, net: residual });
  return {
    transfers: [...playerTransfers, ...potTransfers, ...residualTransfers],
    playerTransfers,
    potTransfers,
    residualTransfers,
    shortfall: res.shortfall,
    surplus: residual,
    nets: playerNets,
    expected,
    potFunded: potTransfers.reduce((s, t) => s + t.amount, 0),
  };
}

/**
 * השחקנים שעליהם נבנית החלוקה: אם קיימת חלוקה ידנית שנשמרה על הבסיס
 * הישן (מותאם־עדן) — מחזירים את השחקנים הישנים כדי שה־basis יתאים והערב
 * הסגור לא ישתנה. בכל מקרה אחר — השחקנים הגולמיים.
 */
export function settlementPlayersFor(session) {
  const raw = playersFromSession(session);
  const ms = session?.manualSettlement;
  if (!ms?.basis) return raw;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  if (ms.basis === settlementBasis(raw, cps)) return raw;
  const legacy = playersWithPot(session);
  if (ms.basis === settlementBasis(legacy, cps)) return legacy;
  return raw;
}

/** האם החלוקה הידנית של הערב נשמרה על הבסיס הישן (לפני מודל 25.10). */
export function isLegacySettlement(session) {
  const ms = session?.manualSettlement;
  if (!ms?.basis) return false;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  if (ms.basis === settlementBasis(raw, cps)) return false;
  return ms.basis === settlementBasis(playersWithPot(session), cps);
}

/**
 * פותר החלוקה האחד של ערב שמור — כל המשטחים (דשבורד, מעקב תשלומים,
 * טקסט שיתוף, עורך ידני) עוברים דרכו כדי שלא יתפצלו שוב.
 * מחזיר { mode, cps, pot, transfers, expected, shortfall, saved? , result? }
 */
export function resolveSettlement(session) {
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  // סכום הקופה בתוכנית = "בפועל" אם נערך, אחרת הרשום (R3). הפנקס קורא את
  // השדות ישירות (potOverview) ולא מושפע מהבחירה כאן.
  const pot = potPlanFor(session);
  const ms = session?.manualSettlement;
  if (ms) {
    if (isLegacySettlement(session)) {
      const legacy = playersWithPot(session);
      const saved = savedSettlement(legacy, cps, ms, { allowResidual: false });
      return { mode: "legacy", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved };
    }
    const saved = savedSettlement(raw, cps, ms, {
      potAmount: pot,
      potSinkName: POT_SINK_NAME,
      edenName: edenNameIn(session),
      allowResidual: sessionHasPot(session),
    });
    return { mode: "manual", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved };
  }
  // בלי חלוקה שמורה: ערבים מעידן הקופה (10.10+) עוברים דרך מודל הקופה —
  // הקופה (אם נרשמה) כיור נפרד, ועודף מעבר לה הולך לכיור "עודף ערב"
  // במקום להתנתב דרך הנטו של עדן. ערבים קודמים נשארים בדיוק כמו שנסגרו.
  if (!sessionHasPot(session)) {
    const s = settle(raw, cps);
    return { mode: "plain", cps, pot: 0, transfers: s.transfers, expected: s.nets, shortfall: s.shortfall, result: s };
  }
  const r = settleWithPot(raw, cps, pot);
  return {
    mode: pot > 0 ? "pot" : "plain",
    cps,
    pot,
    transfers: r.transfers,
    expected: r.expected,
    shortfall: r.shortfall,
    result: r,
  };
}

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * ההעברות הפנימיות לקופה/לעודף מסוננות החוצה — הקבוצה רואה רק שחקנים.
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? (session.cps || CPS) : 1);
  const r = resolveSettlement(session);
  const result = {
    transfers: r.transfers.filter((t) => !t.pot && !t.residual),
    shortfall: r.shortfall,
  };
  const text = buildSettlement(result, {
    now: opts.now ?? session?.endedAt ?? (session?.iso ? new Date(`${session.iso}T12:00:00`).getTime() : Date.now()),
    isCashOnly,
    transferVerb,
  });
  return withBotMark(text);
}

/**
 * סך טיפים לשחקן — מ־tips[] (יומן אירועים) וגם מ־tipsGiven על
 * entries/players. ערבים שמורים מלייב לפעמים נשארים עם tipsGiven בלבד
 * (בלי מערך tips) — חייבים לתפוס את שני המקורות.
 */
export function tipTotalsByName(session, players) {
  const totals = {};
  for (const t of session?.tips || []) {
    const amt = +t.amount || 0;
    if (amt > 0) totals[t.name] = (totals[t.name] || 0) + amt;
  }
  const foldGiven = (name, raw) => {
    const n = +raw || 0;
    if (n > 0) totals[name] = Math.max(totals[name] || 0, n);
  };
  for (const e of session?.entries || []) foldGiven(e.name, e.tipsGiven);
  for (const p of players || []) foldGiven(p.name, p.tipsGiven);
  return totals;
}

/**
 * סיכום טיפים לסוף ערב — תמיד כשהיו שחקנים (גם אם אף אחד לא טיפא).
 * מקבל state לייב {players, tips} או ערב שמור {entries, tips}.
 * בלי סכומים במקומות; תיקו = אותו מקום; מחמאות/צחוקים מתחלפים.
 * מי שלא טיפא מופיע פעם אחת בלבד (שורת צחוק אחת) — בלי שורה כפולה למי שזכה.
 * @param {object} session
 * @param {{ p: { name: string }, net: number }[]} [_withNet] נשמר לתאימות קוראים ישנים
 * @param {{ now?: number }} [opts]
 */
export function tipSummaryForSession(session, _withNet, opts = {}) {
  const now = opts.now ?? Date.now();
  const entries = session?.entries || [];
  const players = session?.players?.length
    ? session.players
    : entries.map((e) => ({
        name: e.name,
        tipsGiven: +e.tipsGiven || 0,
      }));
  if (!players.length) return "";

  const totals = tipTotalsByName(session, players);
  const tippers = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  const tipped = new Set(tippers.map((t) => t.name));
  const noTip = players.filter((p) => !tipped.has(p.name));

  const lines = ["💸 טיפים הערב"];

  if (tippers.length) {
    const ranks = tipRankPlaces(tippers);
    const onPodium = new Set(ranks.flatMap((r) => r.names));
    for (const r of ranks) {
      if (r.place === 1) {
        lines.push(formatFirstPlaceLine(r.names, isFemaleName, now));
      } else if (r.place === 2) {
        lines.push(`🥈 מקום שני בטיפים: ${r.names.join(", ")}`);
      } else if (r.place === 3) {
        lines.push(`🥉 מקום שלישי בטיפים: ${r.names.join(", ")}`);
      }
    }

    /* כבוד רק למי שטיפא ולא על הפודיום (1–3 כולל תיקו) */
    const alsoTipped = tippers.filter((t) => !onPodium.has(t.name)).map((t) => t.name);
    if (alsoTipped.length) {
      lines.push(`👏 גם נתנו טיפ: ${alsoTipped.join(", ")}`);
    }

    const minAmt = tippers[tippers.length - 1].amount;
    const lowest = tippers.filter((t) => t.amount === minAmt).map((t) => t.name);
    /* הכי מעט רק אם יש גם מישהו ששם יותר — אחרת כולם תיקו במקום 1 */
    if (tippers.some((t) => t.amount > minAmt)) {
      lines.push(formatLowestTipperLine(lowest, isFemaleName));
    }
  } else {
    lines.push("אף אחד לא שם טיפ הערב… 🙈");
  }

  if (noTip.length) {
    const names = noTip.map((p) => p.name);
    /* שורה ריקה לפני «בלי טיפ» — שבירת שורה בוואטסאפ */
    lines.push("");
    lines.push(formatNonTipperLine(names, isFemaleName, now));
  }

  /* BOT_MARK — שליחה לקבוצה (ShareSheet / settleSummary) בלי לולאת אקו */
  return withBotMark(lines.join("\n"));
}

/**
 * ערב שמור מתוך מצב לייב — אותו מבנה שהאפליקציה שומרת בסיום ערב,
 * כדי שהבוט יבנה את אותו סיכום כמו גיליון השיתוף.
 */
export function sessionFromLive(state, { cps = CPS, now = Date.now() } = {}) {
  const players = (state?.players || []).filter((p) => p.cashout !== "" && p.cashout != null);
  const startedAt = state?.startedAt || null;
  const { d, mo, y, iso } = nightDateParts(startedAt, now);
  const tips = (state?.tips || []).map(({ name, amount, at }) => ({ name, amount, at }));
  return {
    iso,
    d,
    mo,
    y,
    cps,
    startedAt,
    endedAt: now,
    entries: players.map((p) => ({
      name: p.name,
      amount: netOf(p, cps),
      chips: +p.cashout || 0,
      buyin: +p.buyin || 0,
      tipsGiven: +p.tipsGiven || 0,
    })),
    ...(tips.length ? { tips } : {}),
  };
}

/** סיכום נטו לוואטסאפ + בלוק טיפים — לשיתוף מטאב ערבים / לייב. */
export function nightSummaryText(session, aliases) {
  const entries = Array.isArray(session?.entries)
    ? session.entries
    : (session?.players || []).map((p) => ({
        name: p.name,
        amount: netOf(p, session?.cps || CPS),
      }));
  if (!entries.length) return "";
  const base = toWhatsApp(entries, session, null, aliases || null);
  /* המחמאות מתחלפות לפי דקה — מעוגנים לסוף הערב, כדי שמה שנשלח זהה לתצוגה המקדימה */
  const tips = tipSummaryForSession(session, undefined, { now: session?.endedAt ?? Date.now() });
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0.
     withBotMark על כל ההודעה (טיפים כבר מסומנים — בלי כפילות בתחילה). */
  return withBotMark(tips ? `${base}\n\n${tips}` : base);
}
