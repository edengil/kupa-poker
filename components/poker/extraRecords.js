/* שיאים נוספים שאושרו: ממוצע לשעה, הגעה, רווח ביחס לקנייה, קופה,
   אירוח, סגנון קנייה, יום בשבוע לקבוצה, גיבור ערב, שותפים לשולחן.
   בלי רצף-בלי-טיפ — הטיפים תועדו רק לאחרונה.
   בלי «היום הכי טוב» אישי. */

import { AL, canon, r2 } from "./helpers.js";
import { fmt } from "./format.js";
import { sessionDurationMs } from "./durationRecords.js";
import { CHAT_ENTRY_NIGHTS } from "./entryTimings.js";
import { CHAT_NIGHT_SPANS } from "./chatNightSpans.js";
import { CHAT_NIGHT_HOSTS } from "./chatHosts.js";
import { hostPlayerFromLocation } from "./hosts.js";
import { prevIso, resolveEntryBuyin } from "./reconstructChips.js";

const IL_TZ = "Asia/Jerusalem";
const MIN_NIGHTS = 5;
const MIN_TOGETHER = 4;
const MIN_WEEKDAY = 3;
const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function weekdayHe(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(+d)) return null;
  return DAYS_HE[d.getDay()] || null;
}

export function clockParts(ts) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (t) => +parts.find((p) => p.type === t)?.value;
  return { h: get("hour") || 0, m: get("minute") || 0 };
}

/** דקות משעון לילה: 18:00=1080, 01:00=1500 (אחרי חצות). */
export function nightMinutes(ts) {
  if (ts == null || !Number.isFinite(+ts)) return null;
  const { h, m } = clockParts(+ts);
  const mins = h * 60 + m;
  return h < 12 ? mins + 24 * 60 : mins;
}

export function formatNightClock(mins) {
  if (mins == null || !Number.isFinite(mins)) return null;
  const total = Math.round(mins);
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n)}%`;
}

export function firstEntryTs(events, chatRow) {
  const live = (events || [])
    .map((e) => +e.at)
    .filter((t) => Number.isFinite(t));
  const chat = (chatRow?.t || []).map(Number).filter((t) => Number.isFinite(t));
  const all = live.concat(chat);
  if (!all.length) return null;
  return Math.min(...all);
}

function chatRowFor(nightsMap, playerName, iso) {
  if (!nightsMap || !playerName || !iso) return null;
  const nights = nightsMap[playerName];
  if (!nights) return null;
  return nights[iso] || nights[prevIso(iso)] || null;
}

export function hostForSession(s, aliases = {}, hostsMap = CHAT_NIGHT_HOSTS) {
  if (s?.location) {
    const fromLoc = hostPlayerFromLocation(s.location);
    if (fromLoc) return canon(fromLoc, aliases);
  }
  if (!hostsMap || !s?.iso) return null;
  const raw = hostsMap[s.iso] || hostsMap[prevIso(s.iso)];
  return raw ? canon(raw, aliases) : null;
}

function ensure(map, name) {
  if (!map[name]) {
    map[name] = {
      name,
      nights: 0,
      net: 0,
      buyinSum: 0,
      buyinNights: 0,
      buyinNet: 0,
      hourlySum: 0,
      hourlyNights: 0,
      firstMins: [],
      hero: 0,
    };
  }
  return map[name];
}

function top3(list, key, pred = () => true) {
  const s = list.filter(pred).sort((a, b) => key(b) - key(a));
  return [s[0] || null, s[1] || null, s[2] || null];
}

/**
 * שותפים לשולחן — ממוצע הנטו שלך כשהאחר יושב איתך.
 */
export function computePartnerEdges(db, playerName, { minTogether = MIN_TOGETHER } = {}) {
  if (!db || !playerName) return null;
  const A = AL(db);
  const name = canon(playerName, A);
  const together = {};
  let myNights = 0;

  for (const s of db.sessions || []) {
    const totals = {};
    for (const e of s.entries || []) {
      const nm = canon(e.name, A);
      totals[nm] = r2((totals[nm] || 0) + (+e.amount || 0));
    }
    if (totals[name] == null) continue;
    myNights += 1;
    const mine = totals[name];
    for (const other of Object.keys(totals)) {
      if (other === name) continue;
      const cur = together[other] || { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum = r2(cur.sum + mine);
      together[other] = cur;
    }
  }

  if (!myNights) return null;

  const rows = Object.entries(together)
    .map(([nm, v]) => ({ name: nm, n: v.n, avg: r2(v.sum / v.n), sum: v.sum }))
    .filter((r) => r.n >= minTogether)
    .sort((a, b) => b.avg - a.avg || b.n - a.n);

  if (!rows.length) return { myNights, best: null, best2: null, worst: null };

  return {
    myNights,
    best: rows[0],
    best2: rows[1] || null,
    worst: rows.length > 1 ? rows[rows.length - 1] : null,
  };
}

/**
 * @returns {null | object}
 */
export function computeExtraRecords(db, opts = {}) {
  const sessions = [...(db?.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  if (!sessions.length) return null;

  const A = AL(db);
  const nightsMap = opts.nightsMap === undefined ? CHAT_ENTRY_NIGHTS : opts.nightsMap;
  const spans = opts.spans === undefined ? CHAT_NIGHT_SPANS : opts.spans;
  const hostsMap = opts.hostsMap === undefined ? CHAT_NIGHT_HOSTS : opts.hostsMap;

  const byPlayer = {};
  const pots = [];
  const byDay = {};
  const hostAgg = {};

  for (const s of sessions) {
    const durationMs = sessionDurationMs(s, spans);
    const hours = durationMs != null && durationMs > 0 ? durationMs / 3600000 : null;
    const day = weekdayHe(s.iso);
    const host = hostForSession(s, A, hostsMap);
    const rows = [];
    let moved = 0;

    for (const e of s.entries || []) {
      const nm = canon(e.name, A);
      const net = r2(+e.amount || 0);
      const buyin = resolveEntryBuyin(e, { iso: s.iso, aliases: A, nightsMap }).buyin;
      const chatRow = chatRowFor(nightsMap, nm, s.iso);
      const firstTs = firstEntryTs(e.buyinEvents, chatRow);
      rows.push({ nm, net, buyin, firstTs });
      if (net > 0) moved = r2(moved + net);
    }
    if (!rows.length) continue;

    let pot = 0;
    let potN = 0;
    for (const p of rows) {
      const st = ensure(byPlayer, p.nm);
      st.nights += 1;
      st.net = r2(st.net + p.net);
      if (p.buyin != null && p.buyin > 0) {
        st.buyinSum = r2(st.buyinSum + p.buyin);
        st.buyinNights += 1;
        st.buyinNet = r2(st.buyinNet + p.net);
        pot = r2(pot + p.buyin);
        potN += 1;
      }
      if (hours) {
        st.hourlySum = r2(st.hourlySum + p.net / hours);
        st.hourlyNights += 1;
      }
      const mins = nightMinutes(p.firstTs);
      if (mins != null) st.firstMins.push(mins);
    }

    const maxNet = Math.max(...rows.map((p) => p.net));
    if (maxNet > 0) {
      for (const p of rows) {
        if (p.net === maxNet) ensure(byPlayer, p.nm).hero += 1;
      }
    }

    const cover = potN >= 3 && potN >= rows.length * 0.5;
    if (cover && pot > 0) {
      pots.push({ buyin: pot, players: potN, d: s.d, mo: s.mo, y: s.y, iso: s.iso });
    }

    if (day) {
      const cur = byDay[day] || { n: 0, moved: 0, durSum: 0, durN: 0 };
      cur.n += 1;
      cur.moved = r2(cur.moved + moved);
      if (durationMs) {
        cur.durSum += durationMs;
        cur.durN += 1;
      }
      byDay[day] = cur;
    }

    if (host) {
      const h = hostAgg[host] || { name: host, n: 0, net: 0 };
      h.n += 1;
      const hostRow = rows.find((p) => p.nm === host);
      if (hostRow) h.net = r2(h.net + hostRow.net);
      hostAgg[host] = h;
    }
  }

  const stats = Object.values(byPlayer).map((st) => {
    const avgBuyin = st.buyinNights ? r2(st.buyinSum / st.buyinNights) : null;
    const lifetimeRoi =
      st.buyinSum > 0 ? r2((st.buyinNet / st.buyinSum) * 100) : null;
    const avgHourly = st.hourlyNights ? r2(st.hourlySum / st.hourlyNights) : null;
    const avgFirst =
      st.firstMins.length ? st.firstMins.reduce((s, v) => s + v, 0) / st.firstMins.length : null;
    return {
      name: st.name,
      nights: st.nights,
      net: st.net,
      avgBuyin,
      buyinNights: st.buyinNights,
      lifetimeRoi,
      roiNights: st.buyinNights,
      avgHourly,
      hourlyNights: st.hourlyNights,
      avgFirstMins: avgFirst,
      arrivalNights: st.firstMins.length,
      hero: st.hero,
    };
  });

  const [hourly, hourly2, hourly3] = top3(
    stats,
    (s) => s.avgHourly,
    (s) => s.hourlyNights >= MIN_NIGHTS && s.avgHourly != null
  );
  const hourlyLow = stats
    .filter((s) => s.hourlyNights >= MIN_NIGHTS && s.avgHourly != null)
    .sort((a, b) => a.avgHourly - b.avgHourly)[0] || null;

  const [roi, roi2, roi3] = top3(
    stats,
    (s) => s.lifetimeRoi,
    (s) => s.roiNights >= MIN_NIGHTS && s.lifetimeRoi != null
  );
  const roiLow = stats
    .filter((s) => s.roiNights >= MIN_NIGHTS && s.lifetimeRoi != null)
    .sort((a, b) => a.lifetimeRoi - b.lifetimeRoi)[0] || null;

  const lateEligible = stats.filter((s) => s.arrivalNights >= MIN_NIGHTS && s.avgFirstMins != null);
  const [latest, latest2, latest3] = top3(lateEligible, (s) => s.avgFirstMins);
  const [earliest, earliest2] = top3(lateEligible, (s) => -s.avgFirstMins);

  pots.sort((a, b) => b.buyin - a.buyin);
  const pot = pots[0] || null;
  const pot2 = pots[1] || null;
  const pot3 = pots[2] || null;

  const hosts = Object.values(hostAgg).sort((a, b) => b.n - a.n || b.net - a.net);
  const hostTop = hosts[0] || null;
  const hostTop2 = hosts[1] || null;
  const hostTop3 = hosts[2] || null;

  const highBuyLoser = stats
    .filter((s) => s.buyinNights >= MIN_NIGHTS && s.avgBuyin != null && s.net < 0)
    .sort((a, b) => b.avgBuyin - a.avgBuyin)[0] || null;
  const lowBuyWinner = stats
    .filter((s) => s.buyinNights >= MIN_NIGHTS && s.avgBuyin != null && s.net > 0)
    .sort((a, b) => a.avgBuyin - b.avgBuyin)[0] || null;

  const dayRows = Object.entries(byDay)
    .map(([day, v]) => ({
      day,
      n: v.n,
      avgMoved: v.n ? r2(v.moved / v.n) : 0,
      avgMs: v.durN ? Math.round(v.durSum / v.durN) : null,
    }))
    .filter((r) => r.n >= MIN_WEEKDAY);

  const longestDay = [...dayRows]
    .filter((r) => r.avgMs != null)
    .sort((a, b) => b.avgMs - a.avgMs)[0] || null;
  const richestDay = [...dayRows].sort((a, b) => b.avgMoved - a.avgMoved)[0] || null;

  const [hero, hero2, hero3] = top3(stats, (s) => s.hero, (s) => s.hero >= 1);

  const hasAny =
    hourly || roi || pot || hostTop || highBuyLoser || lowBuyWinner ||
    latest || longestDay || richestDay || hero;

  if (!hasAny) return null;

  return {
    hourly,
    hourly2,
    hourly3,
    hourlyLow,
    roi,
    roi2,
    roi3,
    roiLow,
    latest,
    latest2,
    latest3,
    earliest,
    earliest2,
    pot,
    pot2,
    pot3,
    hostTop,
    hostTop2,
    hostTop3,
    hostsNights: hosts.reduce((s, h) => s + h.n, 0),
    highBuyLoser,
    lowBuyWinner,
    longestDay,
    richestDay,
    hero,
    hero2,
    hero3,
  };
}

export function extraStatDetail(row, kind) {
  if (!row) return "";
  if (kind === "hourly") return `${fmt(row.avgHourly)} לשעה`;
  if (kind === "roi") return fmtPct(row.lifetimeRoi);
  if (kind === "arrival") return formatNightClock(row.avgFirstMins);
  if (kind === "hero") return `${row.hero} פעמים`;
  if (kind === "host") return `${row.n} ערבים`;
  return "";
}
