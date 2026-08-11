/* ============================================================================
   דוחות תקופתיים לוואטסאפ — חודשי, רבעוני, חצי-שנתי ושנתי.

   רץ בצד השרת (ה-cron של Vercel), ולכן מחשב הכל מ-jsonb של הקבוצה ולא דרך
   הרכיבים של האפליקציה. הפורמט מיושר עם השפה של הקבוצה: מגיע/חייב, מדליות
   לשלושת הראשונים, וכמה שיאים בסוף.
   ============================================================================ */

import { BOT_MARK } from "./whatsapp";

const r2 = (v) => Math.round(v * 100) / 100;
const canon = (n, a) => (a && a[n]) || n;

export const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/* אילו דוחות מגיע לשלוח בתקופה הזו.
   ה-cron רץ עכשיו כל יום, לא רק ב-1 בחודש. הדוח "פתוח לשליחה" לאורך כל חודש
   הטריגר שלו (חודשי — כל חודש; רבעוני — 1/4/7/10; חצי — 7 ו-1; שנתי — 1),
   וה-route מדלג על מה שכבר נשלח לפי config.sentReports. כך אם הערוץ היה למטה
   ב-1 בחודש, ההרצה של יום 2, 3, 10... עדיין תשלים את הדוח — ובלי כפילות.
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

/** בונה את טקסט הדוח. מחזיר null כשאין ערבים בתקופה — עדיף שקט מדוח ריק. */
export function buildPeriodReport(data, rep) {
  const sessions = data?.sessions || [];
  const aliases = data?.aliases || {};
  const [from, to] = range(rep);

  const inRange = sessions.filter((s) => {
    const ym = s.y * 100 + s.mo;
    return ym >= from && ym <= to;
  });
  if (!inRange.length) return null;

  const totals = {};
  const nightsPer = {};
  let bestNight = null;

  for (const s of inRange) {
    const seen = new Set();
    const perNight = {};
    for (const e of s.entries || []) {
      const nm = canon(e.name, aliases);
      totals[nm] = r2((totals[nm] || 0) + e.amount);
      perNight[nm] = r2((perNight[nm] || 0) + e.amount);
      if (!seen.has(nm)) {
        nightsPer[nm] = (nightsPer[nm] || 0) + 1;
        seen.add(nm);
      }
    }
    for (const [nm, amount] of Object.entries(perNight)) {
      if (!bestNight || amount > bestNight.amount) bestNight = { name: nm, amount, d: s.d, mo: s.mo };
    }
  }

  const sorted = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  if (!sorted.length) return null;

  const medals = ["🥇", "🥈", "🥉"];
  const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
  const lines = sorted.map((t, i) => `${i < 3 && t.amount > 0 ? medals[i] : "•"} ${t.name} ${fmt(t.amount)}`);

  const most = Object.entries(nightsPer).sort((a, b) => b[1] - a[1])[0];

  const out = [
    `${BOT_MARK} ${reportTitle(rep)} · ${inRange.length} ערבים`,
    "",
    ...lines,
  ];

  const foot = [];
  if (bestNight && bestNight.amount > 0)
    foot.push(`🔥 ערב השיא: ${bestNight.name} +${bestNight.amount} (${bestNight.d}.${bestNight.mo})`);
  if (most) foot.push(`🎯 המתמיד: ${most[0]} · ${most[1]} ערבים`);
  if (foot.length) out.push("", ...foot);

  return out.join("\n");
}
