/* ============================================================================
   דוחות תקופתיים לוואטסאפ — חודשי, רבעוני, חצי-שנתי ושנתי.

   רץ בצד השרת (ה-cron של Vercel), ולכן מחשב הכל מ-jsonb של הקבוצה ולא דרך
   הרכיבים של האפליקציה. פורמט: רשימת נטו עם +/− ומדליות לשלושת הראשונים
   ברווח, ושיאים עשירים בסוף (בלי מגיע/חייב).
   ============================================================================ */

import { BOT_MARK } from "./botMark";
import { DEFAULT_ALIASES } from "../components/poker/helpers.js";

const r2 = (v) => Math.round(v * 100) / 100;
const canon = (n, a) => (a && a[n]) || n;

/** אותה מפת כינויים כמו באפליקציה — בלי זה «קובי» ו«קובי סעדה» נשארים נפרדים בדוח. */
export function reportAliases(dataAliases) {
  const o = { ...DEFAULT_ALIASES };
  for (const [k, v] of Object.entries(dataAliases || {})) {
    if (!(k in DEFAULT_ALIASES)) o[k] = v;
  }
  return o;
}

export const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/* אילו דוחות מגיע לשלוח בתקופה הזו.
   ה-cron רץ כל יום. הדוח "פתוח לשליחה" לאורך כל חודש הטריגר שלו,
   וה-route מדלג על מה שכבר נשלח לפי config.sentReports — כך אם הערוץ
   היה למטה ב-1 בחודש, ההרצה של יום 2+ עדיין תשלים בלי כפילות.
   force משמש לבדיקה ידנית ומתעלם גם מהתאריך וגם מה-dedup. */
export function dueReports(now, force = null) {
  const y = now.getFullYear();
  const mo = now.getMonth() + 1; // 1..12

  if (force) {
    const prevMo = mo === 1 ? 12 : mo - 1;
    const prevY = mo === 1 ? y - 1 : y;
    const map = {
      m: { kind: "m", y: prevY, mo: prevMo },
      q: { kind: "q", y: mo <= 3 ? y - 1 : y, q: mo <= 3 ? 4 : Math.floor((mo - 1) / 3) },
      h: { kind: "h", y: mo <= 6 ? y - 1 : y, h: mo <= 6 ? 2 : 1 },
      y: { kind: "y", y: y - 1 },
    };
    return map[force] ? [withKey(map[force])] : [];
  }

  const due = [];
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevY = mo === 1 ? y - 1 : y;
  due.push({ kind: "m", y: prevY, mo: prevMo });

  if ([1, 4, 7, 10].includes(mo)) {
    const q = mo === 1 ? 4 : (mo - 1) / 3;
    due.push({ kind: "q", y: mo === 1 ? y - 1 : y, q });
  }
  if (mo === 7) due.push({ kind: "h", y, h: 1 });
  if (mo === 1) due.push({ kind: "h", y: y - 1, h: 2 });
  if (mo === 1) due.push({ kind: "y", y: y - 1 });

  return due.map(withKey);
}

function withKey(rep) {
  const key =
    rep.kind === "m" ? `m:${rep.y}-${String(rep.mo).padStart(2, "0")}`
    : rep.kind === "q" ? `q:${rep.y}-Q${rep.q}`
    : rep.kind === "h" ? `h:${rep.y}-H${rep.h}`
    : `y:${rep.y}`;
  return { ...rep, key };
}

/* טווח החודשים של דוח: [fromYm, toYm] בפורמט y*100+mo, כולל. */
function range(rep) {
  if (rep.kind === "m") return [rep.y * 100 + rep.mo, rep.y * 100 + rep.mo];
  if (rep.kind === "q") return [rep.y * 100 + (rep.q - 1) * 3 + 1, rep.y * 100 + rep.q * 3];
  if (rep.kind === "h") return rep.h === 1 ? [rep.y * 100 + 1, rep.y * 100 + 6] : [rep.y * 100 + 7, rep.y * 100 + 12];
  return [rep.y * 100 + 1, rep.y * 100 + 12];
}

export function reportTitle(rep) {
  if (rep.kind === "m") return `סיכום ${MONTHS[rep.mo - 1]} ${rep.y}`;
  if (rep.kind === "q") return `סיכום רבעון ${rep.q} · ${rep.y}`;
  if (rep.kind === "h")
    return rep.h === 1 ? `סיכום חצי שנה · ינואר–יוני ${rep.y}` : `סיכום חצי שנה · יולי–דצמבר ${rep.y}`;
  return `סיכום שנת ${rep.y}`;
}

function sessionYm(s) {
  const y = Number(s?.y);
  const mo = Number(s?.mo);
  if (Number.isFinite(y) && Number.isFinite(mo) && mo >= 1 && mo <= 12) return y * 100 + mo;
  const m = String(s?.iso || "").match(/^(\d{4})-(\d{2})/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  return null;
}

function sessionTipChips(s) {
  if (Array.isArray(s?.tips) && s.tips.length) {
    return s.tips.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }
  return (s?.entries || []).reduce((sum, e) => sum + (Number(e.tipsGiven) || 0), 0);
}

function fmtSigned(v) {
  const n = r2(Number(v) || 0);
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

function kindEmoji(kind) {
  if (kind === "m") return "📅";
  if (kind === "q") return "🗓️";
  if (kind === "h") return "🌓";
  return "🎊";
}

function sessionDurationMs(s) {
  const a = Number(s?.startedAt);
  const b = Number(s?.endedAt);
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) return b - a;
  return null;
}

function fmtDurationHe(ms) {
  if (!ms || ms < 60_000) return null;
  const m = Math.round(ms / 60_000);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h > 0 && mins > 0) return `${h} שעות ו-${mins} דק'`;
  if (h > 0) return `${h} שעות`;
  return `${mins} דק'`;
}

/** בונה את טקסט הדוח. מחזיר null כשאין ערבים בתקופה — עדיף שקט מדוח ריק. */
export function buildPeriodReport(data, rep) {
  const sessions = data?.sessions || [];
  const aliases = reportAliases(data?.aliases);
  const [from, to] = range(rep);

  const inRange = sessions.filter((s) => {
    const ym = sessionYm(s);
    return ym != null && ym >= from && ym <= to;
  });
  if (!inRange.length) return null;

  const totals = {};
  const nightsPer = {};
  const tipChipsPer = {};
  let bestNight = null;
  let worstNight = null;
  let stormiest = null;
  let quietest = null;
  let tippiestNight = null;
  let fullestNight = null;
  let longestNight = null;
  let peakChips = null;
  let uniquePlayers = new Set();

  for (const s of inRange) {
    const seen = new Set();
    const perNight = {};
    let moved = 0;
    const tableSize = (s.entries || []).length;
    if (tableSize > 0 && (!fullestNight || tableSize > fullestNight.size)) {
      fullestNight = { size: tableSize, d: s.d, mo: s.mo };
    }
    const dur = sessionDurationMs(s);
    if (dur != null && (!longestNight || dur > longestNight.ms)) {
      longestNight = { ms: dur, d: s.d, mo: s.mo };
    }

    for (const e of s.entries || []) {
      const nm = canon(e.name, aliases);
      const amt = r2(Number(e.amount) || 0);
      /* כל מי ששיחק נכנס לטבלה — גם אם סגר באפס */
      if (!(nm in totals)) totals[nm] = 0;
      totals[nm] = r2(totals[nm] + amt);
      perNight[nm] = r2((perNight[nm] || 0) + amt);
      uniquePlayers.add(nm);
      if (amt > 0) moved += amt;
      if (!seen.has(nm)) {
        nightsPer[nm] = (nightsPer[nm] || 0) + 1;
        seen.add(nm);
      }
      const chips = Number(e.chips);
      if (Number.isFinite(chips) && chips > 0) {
        if (!peakChips || chips > peakChips.chips) {
          peakChips = { name: nm, chips, d: s.d, mo: s.mo };
        }
      }
    }
    moved = r2(moved);
    if (moved > 0 && (!stormiest || moved > stormiest.amount)) {
      stormiest = { amount: moved, d: s.d, mo: s.mo };
    }
    if (moved > 0 && (!quietest || moved < quietest.amount)) {
      quietest = { amount: moved, d: s.d, mo: s.mo };
    }

    const tipChips = sessionTipChips(s);
    if (tipChips > 0) {
      if (!tippiestNight || tipChips > tippiestNight.chips) {
        tippiestNight = { chips: tipChips, d: s.d, mo: s.mo };
      }
      if (Array.isArray(s.tips) && s.tips.length) {
        for (const t of s.tips) {
          const tip = Number(t.amount) || 0;
          if (tip <= 0) continue;
          const nm = canon(t.name, aliases);
          tipChipsPer[nm] = (tipChipsPer[nm] || 0) + tip;
        }
      } else {
        for (const e of s.entries || []) {
          const tip = Number(e.tipsGiven) || 0;
          if (tip <= 0) continue;
          const nm = canon(e.name, aliases);
          tipChipsPer[nm] = (tipChipsPer[nm] || 0) + tip;
        }
      }
    }

    for (const [nm, amount] of Object.entries(perNight)) {
      if (!bestNight || amount > bestNight.amount) bestNight = { name: nm, amount, d: s.d, mo: s.mo };
      if (!worstNight || amount < worstNight.amount) worstNight = { name: nm, amount, d: s.d, mo: s.mo };
    }
  }

  /* יורד: הכי חיובי → אפס → הכי שלילי (מינוסים בסוף, מהקטן לגדול בחוב) */
  const sorted = Object.entries(totals)
    .map(([name, amount]) => ({
      name,
      amount: r2(amount),
      nights: nightsPer[name] || 0,
    }))
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.name.localeCompare(b.name, "he");
    });
  if (!sorted.length) return null;

  const medals = ["🥇", "🥈", "🥉"];
  let winRank = 0;
  const lines = sorted.map((t, i) => {
    const place = `${i + 1}.`;
    const nightsBit = t.nights > 0 ? ` · ${t.nights}ע'` : "";
    if (t.amount > 0) {
      const medal = winRank < 3 ? `${medals[winRank]} ` : "";
      winRank += 1;
      return `${place} ${medal}${t.name} ${fmtSigned(t.amount)}₪${nightsBit}`;
    }
    return `${place} ${t.name} ${fmtSigned(t.amount)}₪${nightsBit}`;
  });

  const most = Object.entries(nightsPer).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"))[0];
  const topTipper = Object.entries(tipChipsPer).sort((a, b) => b[1] - a[1])[0];
  const winner = sorted.find((t) => t.amount > 0);
  const loser = [...sorted].filter((t) => t.amount < 0).sort((a, b) => a.amount - b.amount)[0];

  const avgRows = sorted
    .filter((t) => t.nights >= 2)
    .map((t) => ({ name: t.name, avg: r2(t.amount / t.nights), nights: t.nights }));
  const bestAvg = [...avgRows].sort((a, b) => b.avg - a.avg)[0];
  const worstAvg = [...avgRows].filter((t) => t.avg < 0).sort((a, b) => a.avg - b.avg)[0];

  const playersWithNights = Object.keys(nightsPer);
  const noTippers = playersWithNights
    .filter((nm) => !(tipChipsPer[nm] > 0))
    .sort((a, b) => (nightsPer[b] || 0) - (nightsPer[a] || 0) || a.localeCompare(b, "he"));

  const headerEmoji = kindEmoji(rep.kind);
  const out = [
    `${BOT_MARK} ${headerEmoji} ${reportTitle(rep)}`,
    `♠️ ${inRange.length} ערבים · 👥 ${uniquePlayers.size} שחקנים`,
    "",
    "📊 דירוג נטו (גבוה → נמוך)",
    ...lines,
  ];

  const foot = ["", "✨ שיאים מהתקופה"];
  if (bestNight && bestNight.amount > 0) {
    foot.push(`🔥 ערב השיא: ${bestNight.name} ${fmtSigned(bestNight.amount)}₪ (${bestNight.d}.${bestNight.mo})`);
  }
  if (worstNight && worstNight.amount < 0) {
    foot.push(`🧊 הקריסה של הערב: ${worstNight.name} ${fmtSigned(worstNight.amount)}₪ (${worstNight.d}.${worstNight.mo})`);
  }
  if (stormiest && stormiest.amount > 0) {
    foot.push(`🌪️ הערב הסוער: ${stormiest.amount}₪ החליפו ידיים (${stormiest.d}.${stormiest.mo})`);
  }
  if (quietest && quietest.amount > 0 && (!stormiest || quietest.amount < stormiest.amount)) {
    foot.push(`🌙 הערב השקט: ${quietest.amount}₪ בלבד (${quietest.d}.${quietest.mo})`);
  }
  if (fullestNight) {
    foot.push(`🪑 השולחן העמוס: ${fullestNight.size} שחקנים (${fullestNight.d}.${fullestNight.mo})`);
  }
  if (longestNight) {
    const label = fmtDurationHe(longestNight.ms);
    if (label) foot.push(`⏱️ הערב הארוך: ${label} (${longestNight.d}.${longestNight.mo})`);
  }
  if (peakChips) {
    foot.push(`🪙 שיא ג'יטונים ביציאה: ${peakChips.name} · ${peakChips.chips} ג' (${peakChips.d}.${peakChips.mo})`);
  }
  if (most) {
    foot.push(`🎯 המתמיד: ${most[0]} · ${most[1]} ערבים`);
  }
  if (bestAvg && bestAvg.avg > 0) {
    foot.push(`📈 הממוצע הכי טוב: ${bestAvg.name} ${fmtSigned(bestAvg.avg)}₪ לערב (${bestAvg.nights}ע')`);
  }
  if (worstAvg) {
    foot.push(`📉 הממוצע הכי חלש: ${worstAvg.name} ${fmtSigned(worstAvg.avg)}₪ לערב (${worstAvg.nights}ע')`);
  }
  if (winner) {
    foot.push(`👑 מלך/מלכת התקופה: ${winner.name} ${fmtSigned(winner.amount)}₪`);
  }
  if (loser && loser.name !== winner?.name) {
    foot.push(`🩹 בתחתית: ${loser.name} ${fmtSigned(loser.amount)}₪`);
  }
  if (topTipper && topTipper[1] > 0) {
    foot.push(`💸 טיפר התקופה: ${topTipper[0]} · ${topTipper[1]} ג'יטונים`);
  }
  if (tippiestNight) {
    foot.push(`🎁 ערב הטיפים: ${tippiestNight.chips} ג' (${tippiestNight.d}.${tippiestNight.mo})`);
  }
  if (noTippers.length) {
    const sample = noTippers.slice(0, 3).join(", ");
    const more = noTippers.length > 3 ? ` ועוד ${noTippers.length - 3}` : "";
    foot.push(`🙈 בלי טיפ בתקופה: ${sample}${more}`);
  }
  if (foot.length > 2) out.push(...foot);
  out.push("", "♠️ בהצלחה בחודש הבא 🍀");

  return out.join("\n");
}
