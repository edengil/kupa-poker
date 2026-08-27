/* שיאים וסטטיסטיקה אישית לכל שחקן — חישוב טהור, בלי UI.
   נבנה מנתונים שיש באמת: נטו לערב, קנייה/ג'יטונים כשיש, טיפים,
   וחותמות זמן של כניסות נוספות — מהלייב (buyinEvents) ומייצוא הוואטסאפ. */

import { AL, canon, r2 } from "./helpers.js";
import { fmt } from "./format.js";
import { ENTRY } from "../../lib/report.js";
import { sessionDurationMs } from "./durationRecords.js";
import { chatNightsFor } from "./entryTimings.js";
import { resolveEntryChips, resolveEntryBuyin } from "./reconstructChips.js";
import {
  computePartnerEdges,
  hostForSession,
  formatNightClock,
  nightMinutes,
  firstEntryTs,
  fmtPct,
} from "./extraRecords.js";

function dt(n) {
  if (!n || n.d == null) return "";
  return `${n.d}.${n.mo}.${String(n.y).slice(2)}`;
}

function impliedEntries(buyin) {
  const n = +buyin;
  if (!Number.isFinite(n) || n <= 0) return null;
  return r2(n / ENTRY);
}

/** מרווח ממוצע בין כניסות נוספות בערב אחד (חותמות זמן). */
export function rebuyGapsMs(events) {
  const times = (events || [])
    .map((e) => +e.at)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return [];
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 0) gaps.push(g);
  }
  return gaps;
}

export function formatGapMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "פחות מדקה";
  if (mins < 60) return `${mins} דק׳`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 1 && m) return `שעה ו-${m} דק׳`;
  if (h === 1) return "שעה";
  return m ? `${h} שעות ו-${m} דק׳` : `${h} שעות`;
}

function isoParts(iso) {
  const [y, mo, d] = String(iso).split("-").map(Number);
  return { iso, y, mo, d };
}

function eventsFromChatRow(row) {
  const times = row?.t || [];
  return times.map((at, i) => ({ at, amount: row.a?.[i] }));
}

/**
 * מאחד כניסות מהלייב (sessions) עם חותמות מהצ'אט.
 * ערב עם buyinEvents בלייב מנצח; אחרת לוקחים את הצ'אט.
 */
function mergeEntrySources(nights, chatMap) {
  const byIso = {};
  for (const [iso, row] of Object.entries(chatMap || {})) {
    byIso[iso] = { entries: row.n, events: eventsFromChatRow(row), fromChat: true };
  }
  for (const n of nights) {
    const cur = byIso[n.iso] || { entries: null, events: [], fromChat: false };
    if (n.entries != null) cur.entries = n.entries;
    const liveEvents = n.events || [];
    const chatEvents = cur.events || [];
    if (liveEvents.length >= 2) cur.events = liveEvents;
    else if (liveEvents.length > chatEvents.length) cur.events = liveEvents;
    byIso[n.iso] = cur;
  }
  return byIso;
}

/**
 * @returns {null | object}
 */
export function computePersonalStats(db, playerName, opts = {}) {
  if (!db || !playerName) return null;
  const A = AL(db);
  const name = canon(playerName, A);
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));

  const nights = [];
  for (const s of sessions) {
    let amount = 0;
    let has = false;
    let buyin = 0;
    let hasBuyin = false;
    let chips = 0;
    let hasChips = false;
    let events = [];
    const nightsMap = opts.chat === false ? {} : undefined;
    for (const e of s.entries || []) {
      if (canon(e.name, A) !== name) continue;
      has = true;
      amount = r2(amount + (+e.amount || 0));
      const buy = resolveEntryBuyin(e, { iso: s.iso, aliases: A, nightsMap });
      if (buy.buyin != null) {
        buyin = r2(buyin + buy.buyin);
        hasBuyin = true;
      }
      const resolved = resolveEntryChips(e, { iso: s.iso, aliases: A, nightsMap });
      if (resolved.chips != null) {
        chips = r2(chips + resolved.chips);
        hasChips = true;
      }
      if (Array.isArray(e.buyinEvents) && e.buyinEvents.length) {
        events = events.concat(e.buyinEvents);
      }
    }
    if (!has) continue;
    let tips = 0;
    for (const t of s.tips || []) {
      if (canon(t.name, A) === name) tips = r2(tips + (+t.amount || 0));
    }
    for (const e of s.entries || []) {
      if (canon(e.name, A) === name && e.tipsGiven) {
        /* tipsGiven על הרשומה — אם אין יומן טיפים, זה המקור */
        if (!(s.tips || []).some((t) => canon(t.name, A) === name)) {
          tips = r2(tips + (+e.tipsGiven || 0));
        }
      }
    }
    nights.push({
      iso: s.iso,
      d: s.d,
      mo: s.mo,
      y: s.y,
      amount,
      buyin: hasBuyin ? buyin : null,
      chips: hasChips ? chips : null,
      entries: hasBuyin ? impliedEntries(buyin) : null,
      events,
      tips,
      durationMs: sessionDurationMs(s),
    });
  }

  if (!nights.length) return null;

  const amounts = nights.map((n) => n.amount);
  const wins = amounts.filter((v) => v > 0).length;
  const losses = amounts.filter((v) => v < 0).length;
  const even = amounts.filter((v) => v === 0).length;
  const totalNet = r2(amounts.reduce((s, v) => s + v, 0));
  const avgNet = r2(totalNet / nights.length);

  let bestNight = nights[0];
  let worstNight = nights[0];
  for (const n of nights) {
    if (n.amount > bestNight.amount) bestNight = n;
    if (n.amount < worstNight.amount) worstNight = n;
  }

  let curW = 0,
    maxW = 0,
    curL = 0,
    maxL = 0;
  for (const v of amounts) {
    if (v > 0) {
      curW += 1;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else if (v < 0) {
      curL += 1;
      curW = 0;
      if (curL > maxL) maxL = curL;
    } else {
      curW = 0;
      curL = 0;
    }
  }
  let tailW = 0;
  for (let i = amounts.length - 1; i >= 0 && amounts[i] > 0; i--) tailW++;
  let tailL = 0;
  for (let i = amounts.length - 1; i >= 0 && amounts[i] < 0; i--) tailL++;

  let attendCur = 0,
    attendMax = 0;
  const presentIso = new Set(nights.map((n) => n.iso));
  for (const s of sessions) {
    if (presentIso.has(s.iso)) {
      attendCur += 1;
      if (attendCur > attendMax) attendMax = attendCur;
    } else attendCur = 0;
  }

  let comeback = null;
  for (let i = 1; i < nights.length; i++) {
    if (nights[i - 1].amount < 0 && nights[i].amount > 0) {
      const jump = r2(nights[i].amount - nights[i - 1].amount);
      if (!comeback || jump > comeback.jump) {
        comeback = { jump, from: nights[i - 1].amount, to: nights[i].amount, iso: nights[i].iso };
      }
    }
  }

  const sd = Math.round(
    Math.sqrt(amounts.reduce((s, v) => s + (v - avgNet) ** 2, 0) / nights.length)
  );

  let cum = 0,
    peak = 0,
    maxDrawdown = 0;
  for (const v of amounts) {
    cum = r2(cum + v);
    if (cum > peak) peak = cum;
    const dd = r2(peak - cum);
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const withEntries = nights.filter((n) => n.entries != null);
  const chatMap = opts.chat === false ? null : (opts.chatNights ?? chatNightsFor(name));
  const merged = mergeEntrySources(nights, chatMap);
  const mergedRows = Object.values(merged);
  const entryRows = mergedRows.filter((n) => n.entries != null);
  const avgEntries = entryRows.length
    ? r2(entryRows.reduce((s, n) => s + n.entries, 0) / entryRows.length)
    : null;
  let mostEntries = null;
  for (const n of withEntries) {
    if (!mostEntries || n.entries > mostEntries.entries) mostEntries = n;
  }
  for (const [iso, row] of Object.entries(merged)) {
    if (row.entries == null) continue;
    if (!mostEntries || row.entries > mostEntries.entries) {
      mostEntries = { ...isoParts(iso), entries: row.entries };
    }
  }

  const allGaps = [];
  let rebuyGapNights = 0;
  for (const row of mergedRows) {
    const g = rebuyGapsMs(row.events);
    if (g.length) {
      rebuyGapNights += 1;
      allGaps.push(...g);
    }
  }
  const avgRebuyGapMs = allGaps.length
    ? Math.round(allGaps.reduce((s, v) => s + v, 0) / allGaps.length)
    : null;

  const totalTips = r2(nights.reduce((s, n) => s + n.tips, 0));
  let biggestTip = null;
  for (const s of sessions) {
    for (const t of s.tips || []) {
      if (canon(t.name, A) !== name) continue;
      const amt = +t.amount || 0;
      if (!biggestTip || amt > biggestTip.amount) {
        biggestTip = { amount: amt, d: s.d, mo: s.mo, y: s.y };
      }
    }
  }

  const withBuyin = nights.filter((n) => n.buyin != null && n.buyin > 0);
  const totalBuyin = r2(withBuyin.reduce((s, n) => s + n.buyin, 0));
  const netOnBuyin = r2(withBuyin.reduce((s, n) => s + n.amount, 0));
  const lifetimeRoi = totalBuyin > 0 ? r2((netOnBuyin / totalBuyin) * 100) : null;

  const timed = nights.filter((n) => n.durationMs);
  const avgHourly = timed.length
    ? r2(
        timed.reduce((s, n) => s + n.amount / (n.durationMs / 3600000), 0) / timed.length
      )
    : null;

  const withChips = nights.filter((n) => n.chips != null);
  let bestChips = null;
  for (const n of withChips) {
    if (!bestChips || n.chips > bestChips.chips) bestChips = n;
  }

  const last = nights[nights.length - 1];
  const firstMins = [];
  for (const n of nights) {
    const row = chatMap?.[n.iso];
    const ts = firstEntryTs(n.events, row);
    const mins = nightMinutes(ts);
    if (mins != null) firstMins.push(mins);
  }
  const avgFirstMins = firstMins.length
    ? firstMins.reduce((s, v) => s + v, 0) / firstMins.length
    : null;

  const partners = opts.chat === false ? null : computePartnerEdges(db, name);
  const hostedNights = [];
  let hostedNet = 0;
  if (opts.chat !== false) {
    for (const s of sessions) {
      if (hostForSession(s, A) !== name) continue;
      const mine = nights.find((n) => n.iso === s.iso);
      hostedNights.push(s.iso);
      if (mine) hostedNet = r2(hostedNet + mine.amount);
    }
  }

  return {
    name,
    nights: nights.length,
    wins,
    losses,
    even,
    winRate: Math.round((wins / nights.length) * 100),
    totalNet,
    avgNet,
    sd,
    bestNight,
    worstNight,
    maxWinStreak: maxW,
    currentWinStreak: tailW,
    maxLossStreak: maxL,
    currentLossStreak: tailL,
    attendMax,
    comeback,
    peakCum: peak,
    maxDrawdown,
    avgEntries,
    entriesNights: entryRows.length,
    chatEntryNights: Object.keys(chatMap || {}).length,
    mostEntries,
    avgRebuyGapMs,
    rebuyGapNights,
    totalTips,
    biggestTip,
    lifetimeRoi,
    roiNights: withBuyin.length,
    totalBuyin,
    avgHourly,
    hourlyNights: timed.length,
    bestChips,
    lastNight: last,
    avgFirstMins,
    arrivalNights: firstMins.length,
    partners,
    hostedCount: hostedNights.length,
    hostedNet: hostedNights.length ? hostedNet : null,
  };
}

/** שורות תצוגה לשיאים האישיים — כולל הערות כנות כשחסרים נתונים. */
export function personalStatRows(stats, { compact = false } = {}) {
  if (!stats) return [];
  const rows = [];
  const push = (row) => rows.push(row);

  push({
    icon: "💰",
    title: "הרווח הכי גדול",
    detail: `${fmt(stats.bestNight.amount)} · ${dt(stats.bestNight)}`,
    tone: "win",
  });
  push({
    icon: "🥶",
    title: "ההפסד הכי גדול",
    detail:
      stats.worstNight.amount < 0
        ? `${fmt(stats.worstNight.amount)} · ${dt(stats.worstNight)}`
        : "עדיין בלי ערב שלילי",
    tone: stats.worstNight.amount < 0 ? "loss" : "dim",
  });
  push({
    icon: "📅",
    title: "ערבים ששוחקו",
    detail: `${stats.nights} · ${stats.wins} זכיות · ${stats.losses} הפסדים${stats.even ? ` · ${stats.even} אפס` : ""}`,
  });
  push({
    icon: "🎲",
    title: "אחוז ניצחונות",
    detail: `${stats.winRate}%`,
  });
  push({
    icon: "📈",
    title: "ממוצע לערב",
    detail: fmt(stats.avgNet),
    tone: stats.avgNet >= 0 ? "win" : "loss",
  });
  push({
    icon: "🏦",
    title: "נטו כולל",
    detail: fmt(stats.totalNet),
    tone: stats.totalNet >= 0 ? "win" : "loss",
  });

  if (stats.avgEntries != null) {
    push({
      icon: "🎟️",
      title: "ממוצע כניסות",
      detail: `${stats.avgEntries} כניסות לערב`,
      note:
        stats.entriesNights < stats.nights
          ? `מ־${stats.entriesNights} ערבים עם סכום קנייה (בערבים ישנים זה חסר)`
          : stats.chatEntryNights
            ? `כולל רשימות ביט מהצ'אט`
            : null,
    });
  } else {
    push({
      icon: "🎟️",
      title: "ממוצע כניסות",
      detail: "אין סכום קנייה בערבים הישנים",
      note: "יופיע בערבים שנשמרים מהלייב / מהבוט",
      tone: "dim",
    });
  }

  if (stats.avgRebuyGapMs != null) {
    push({
      icon: "⏱️",
      title: "כל כמה זמן כניסה נוספת",
      detail: formatGapMs(stats.avgRebuyGapMs),
      note: stats.rebuyGapNights
        ? `מ־${stats.rebuyGapNights} ערבים עם חותמות זמן (לייב + צ'אט)`
        : null,
    });
  } else {
    push({
      icon: "⏱️",
      title: "כל כמה זמן כניסה נוספת",
      detail: "אין חותמות זמן בין כניסות",
      note: "נשמר בלייב, בבוט, ומרשימות ביט בייצוא הוואטסאפ",
      tone: "dim",
    });
  }

  if (stats.lifetimeRoi != null) {
    push({
      icon: "📊",
      title: "רווח ביחס לקנייה",
      detail: fmtPct(stats.lifetimeRoi),
      note: "נטו חלקי הקנייה, על כל ההיסטוריה עם סכום קנייה. קנייה 150₪ וסיום +100₪ = +67%. קנייה 200₪ והפסד 50₪ = −25%. בלי סכום קנייה לא מוצג.",
    });
  }
  if (stats.avgHourly != null) {
    push({
      icon: "⏳",
      title: "ממוצע לשעה",
      detail: `${fmt(stats.avgHourly)} לשעה`,
      note: `מ־${stats.hourlyNights} ערבים עם שעת התחלה/סיום`,
    });
  }
  if (stats.partners?.best) {
    push({
      icon: "🤝",
      title: "עם מי אתה מרוויח יותר",
      detail: `${stats.partners.best.name} · ממוצע ${fmt(stats.partners.best.avg)}`,
      note: `כשאתם באותו שולחן · ${stats.partners.best.n} ערבים משותפים`,
      tone: stats.partners.best.avg >= 0 ? "win" : "loss",
    });
  }

  if (compact) return rows;

  if (stats.mostEntries) {
    push({
      icon: "🔥",
      title: "הכי הרבה כניסות בערב",
      detail: `${stats.mostEntries.entries} · ${dt(stats.mostEntries)}`,
    });
  }
  if (stats.maxWinStreak >= 2) {
    push({
      icon: "🎖️",
      title: "רצף ניצחונות",
      detail: `${stats.maxWinStreak} ערבים${stats.currentWinStreak >= 2 ? ` · פעיל ${stats.currentWinStreak}` : ""}`,
    });
  }
  if (stats.maxLossStreak >= 2) {
    push({
      icon: "🌧️",
      title: "רצף הפסדים",
      detail: `${stats.maxLossStreak} ערבים${stats.currentLossStreak >= 2 ? ` · פעיל ${stats.currentLossStreak}` : ""}`,
      tone: "loss",
    });
  }
  if (stats.attendMax >= 3) {
    push({
      icon: "🪑",
      title: "נוכחות רצופה",
      detail: `${stats.attendMax} ערבים`,
    });
  }
  if (stats.comeback) {
    push({
      icon: "🎢",
      title: "הקאמבק הגדול",
      detail: `${fmt(stats.comeback.jump)} (מ־${fmt(stats.comeback.from)} ל־${fmt(stats.comeback.to)})`,
      tone: "win",
    });
  }
  if (stats.sd > 0) {
    push({
      icon: "🌪️",
      title: "תנודתיות",
      detail: `±${stats.sd}₪ מול הממוצע של עצמו`,
    });
  }
  if (stats.maxDrawdown > 0) {
    push({
      icon: "📉",
      title: "הירידה מהשיא",
      detail: fmt(-stats.maxDrawdown),
      tone: "loss",
    });
  }
  if (stats.avgFirstMins != null) {
    push({
      icon: "🕐",
      title: "שעת כניסה ראשונה ממוצעת",
      detail: formatNightClock(stats.avgFirstMins),
      note: stats.arrivalNights ? `מ־${stats.arrivalNights} ערבים עם חותמת כניסה בצ'אט` : null,
    });
  }
  if (stats.hostedCount > 0) {
    push({
      icon: "🏠",
      title: "אירוח אצלך",
      detail: `${stats.hostedCount} ערבים · נטו ${fmt(stats.hostedNet)}`,
    });
  }
  if (stats.totalTips > 0) {
    push({
      icon: "💸",
      title: "טיפים שנתן",
      detail: stats.biggestTip
        ? `${stats.totalTips} ג׳ סה״כ · שיא ${stats.biggestTip.amount} ג׳ · ${dt(stats.biggestTip)}`
        : `${stats.totalTips} ג׳`,
    });
  }
  if (stats.bestChips) {
    push({
      icon: "🪙",
      title: "שיא ג׳יטונים ביציאה",
      detail: `${stats.bestChips.chips} ג׳ · ${dt(stats.bestChips)}`,
    });
  }
  if (stats.lastNight) {
    push({
      icon: "🌙",
      title: "הערב האחרון",
      detail: `${fmt(stats.lastNight.amount)} · ${dt(stats.lastNight)}`,
      tone: stats.lastNight.amount >= 0 ? "win" : "loss",
    });
  }

  return rows;
}
