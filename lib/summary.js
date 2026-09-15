/* ============================================================================
   דוחות תקופתיים לוואטסאפ — חודשי, רבעוני, חצי-שנתי ושנתי.

   רץ בצד השרת (ה-cron של Vercel), ולכן מחשב הכל מ-jsonb של הקבוצה ולא דרך
   הרכיבים של האפליקציה. הפורמט מיושר עם השפה של הקבוצה: מגיע/חייב, מדליות
   לשלושת הראשונים, ושיאים מעניינים בסוף.
   ============================================================================ */

import { BOT_MARK } from "./botMark";

const r2 = (v) => Math.round(v * 100) / 100;
const canon = (n, a) => (a && a[n]) || n;

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
  if (v > 0) return `+${v}`;
  return `${v}`;
}

function kindEmoji(kind) {
  if (kind === "m") return "📅";
  if (kind === "q") return "🗓️";
  if (kind === "h") return "🌓";
  return "🎊";
}

/** בונה את טקסט הדוח. מחזיר null כשאין ערבים בתקופה — עדיף שקט מדוח ריק. */
export function buildPeriodReport(data, rep) {
  const sessions = data?.sessions || [];
  const aliases = data?.aliases || {};
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
  let tippiestNight = null;
  let uniquePlayers = new Set();

  for (const s of inRange) {
    const seen = new Set();
    const perNight = {};
    let moved = 0;
    for (const e of s.entries || []) {
      const nm = canon(e.name, aliases);
      const amt = Number(e.amount) || 0;
      totals[nm] = r2((totals[nm] || 0) + amt);
      perNight[nm] = r2((perNight[nm] || 0) + amt);
      uniquePlayers.add(nm);
      if (amt > 0) moved += amt;
      if (!seen.has(nm)) {
        nightsPer[nm] = (nightsPer[nm] || 0) + 1;
        seen.add(nm);
      }
    }
    moved = r2(moved);
    if (!stormiest || moved > stormiest.amount) {
      stormiest = { amount: moved, d: s.d, mo: s.mo };
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

  const sorted = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  if (!sorted.length) return null;

  const medals = ["🥇", "🥈", "🥉"];
  const lines = sorted.map((t, i) => {
    const verb = t.amount > 0 ? "מגיע" : t.amount < 0 ? "חייב" : "סגור";
    const medal = i < 3 && t.amount > 0 ? medals[i] : t.amount < 0 ? "💸" : "•";
    return `${medal} ${t.name} ${verb} ${fmtSigned(t.amount)}₪`;
  });

  const most = Object.entries(nightsPer).sort((a, b) => b[1] - a[1])[0];
  const topTipper = Object.entries(tipChipsPer).sort((a, b) => b[1] - a[1])[0];
  const winner = sorted[0];
  const loser = [...sorted].sort((a, b) => a.amount - b.amount)[0];

  const headerEmoji = kindEmoji(rep.kind);
  const out = [
    `${BOT_MARK} ${headerEmoji} ${reportTitle(rep)}`,
    `♠️ ${inRange.length} ערבים · 👥 ${uniquePlayers.size} שחקנים`,
    "",
    "🏆 טבלת הנטו",
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
  if (most) {
    foot.push(`🎯 המתמיד: ${most[0]} · ${most[1]} ערבים`);
  }
  if (winner && winner.amount > 0) {
    foot.push(`👑 מלך/מלכת התקופה: ${winner.name} ${fmtSigned(winner.amount)}₪`);
  }
  if (loser && loser.amount < 0 && loser.name !== winner?.name) {
    foot.push(`📉 בתחתית: ${loser.name} ${fmtSigned(loser.amount)}₪`);
  }
  if (topTipper && topTipper[1] > 0) {
    foot.push(`🪙 טיפר התקופה: ${topTipper[0]} · ${topTipper[1]} ג'יטונים`);
  }
  if (tippiestNight) {
    foot.push(`🎁 ערב הטיפים: ${tippiestNight.chips} ג' (${tippiestNight.d}.${tippiestNight.mo})`);
  }
  if (foot.length > 2) out.push(...foot);
  out.push("", "♠️ בהצלחה בחודש הבא 🍀");

  return out.join("\n");
}
