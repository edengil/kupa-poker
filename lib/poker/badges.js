/* תגי הישגים — חישוב טהור מאבני דרך שכבר קיימות בנתונים:
   מספר ערבים, כתרים חודשיים, רצפי ניצחונות, טיפים, ו"גיבור הערב". */

import { AL, canon, r2 } from "./helpers.js";
import { monthTotals } from "./totals.js";
import { sessionTips } from "./tipRecords.js";

export const BADGE_DEFS = [
  { id: "nights50", icon: "🎖️", label: "חמישים ערבים", desc: "השתתפות ב־50 ערבים" },
  { id: "nights100", icon: "💯", label: "מאה ערבים", desc: "השתתפות ב־100 ערבים" },
  { id: "crown1", icon: "👑", label: "כתר חודשי ראשון", desc: "מקום ראשון בחודש שלם" },
  { id: "streak5", icon: "🔥", label: "רצף של חמישה", desc: "חמישה ערבים חיוביים ברצף" },
  { id: "tip1", icon: "💸", label: "טיפ ראשון", desc: "נתינת טיפ ראשון" },
  { id: "hero10", icon: "🌟", label: "גיבור הערב ×10", desc: "התוצאה הגבוהה של הערב עשר פעמים" },
];

const DEF_BY_ID = Object.fromEntries(BADGE_DEFS.map((d) => [d.id, d]));

function withDef(id, extra = {}) {
  return { id, ...DEF_BY_ID[id], ...extra };
}

/**
 * @returns {null | { perPlayer: Object<string, Array<object>>, earnedCount: number }}
 * כל תג: { id, icon, label, desc, at?: iso של הערב שבו הושג }.
 */
export function computeBadges(db) {
  if (!db?.sessions?.length) return null;
  const A = AL(db);
  const sessions = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));

  const agg = {};
  const get = (nm) => (agg[nm] = agg[nm] || {
    nights: 0,
    amounts: [], // לפי סדר כרונולוגי, לרצף
    nightHero: 0,
    nightHeroAt: null,
    tipped: false,
    tipAt: null,
    firstNightAt: null,
    nights50At: null,
    nights100At: null,
  });

  for (const s of sessions) {
    const totals = {};
    for (const e of s.entries || []) {
      const nm = canon(e.name, A);
      totals[nm] = r2((totals[nm] || 0) + (+e.amount || 0));
    }
    let topName = null;
    let topAmt = 0;
    for (const [nm, amt] of Object.entries(totals)) {
      const p = get(nm);
      p.nights += 1;
      p.amounts.push(amt);
      if (!p.firstNightAt) p.firstNightAt = s.iso;
      if (p.nights === 50) p.nights50At = s.iso;
      if (p.nights === 100) p.nights100At = s.iso;
      if (amt > topAmt) {
        topAmt = amt;
        topName = nm;
      }
    }
    if (topName) {
      const p = get(topName);
      p.nightHero += 1;
      if (p.nightHero === 10) p.nightHeroAt = s.iso;
    }
    for (const t of sessionTips(s)) {
      const amt = +t.amount || 0;
      if (amt <= 0) continue;
      const p = get(canon(t.name, A));
      if (!p.tipped) {
        p.tipped = true;
        p.tipAt = s.iso;
      }
    }
  }

  /* כתרים חודשיים: מקום ראשון ב־monthTotals של כל חודש שיש בו ערבים */
  const monthsSeen = new Map();
  for (const s of sessions) {
    const key = `${Number(s.y)}-${Number(s.mo)}`;
    if (!monthsSeen.has(key)) monthsSeen.set(key, { y: Number(s.y), mo: Number(s.mo) });
  }
  const crownAt = {};
  for (const { y, mo } of monthsSeen.values()) {
    const top = monthTotals(db, y, mo)[0];
    if (top && top.amount > 0 && !(top.name in crownAt)) {
      /* התאריך המדויק של סוף החודש לא נשמר — מסמנים בערב האחרון של אותו חודש */
      const lastIso = sessions
        .filter((s) => Number(s.y) === y && Number(s.mo) === mo)
        .map((s) => s.iso)
        .sort()
        .pop();
      crownAt[top.name] = lastIso || null;
    }
  }

  const perPlayer = {};
  let earnedCount = 0;
  for (const [nm, p] of Object.entries(agg)) {
    const badges = [];
    if (p.nights >= 50) badges.push(withDef("nights50", { at: p.nights50At }));
    if (p.nights >= 100) badges.push(withDef("nights100", { at: p.nights100At }));
    if (nm in crownAt) badges.push(withDef("crown1", { at: crownAt[nm] }));
    let streak = 0;
    let run = 0;
    for (const amt of p.amounts) {
      run = amt > 0 ? run + 1 : 0;
      if (run > streak) streak = run;
    }
    if (streak >= 5) badges.push(withDef("streak5"));
    if (p.tipped) badges.push(withDef("tip1", { at: p.tipAt }));
    if (p.nightHero >= 10) badges.push(withDef("hero10", { at: p.nightHeroAt }));
    if (badges.length) {
      perPlayer[nm] = badges;
      earnedCount += badges.length;
    }
  }

  return { perPlayer, earnedCount };
}

/** תגים של שחקן אחד (מערך ריק אם אין). */
export function badgesForPlayer(db, playerName) {
  if (!db || !playerName) return [];
  const name = canon(playerName, AL(db));
  const all = computeBadges(db);
  return all?.perPlayer[name] || [];
}
