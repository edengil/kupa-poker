/* סיכום שנה חגיגי (Wrapped) — חישוב טהור + טקסט לשיתוף בוואטסאפ.
   לכל שחקן: ערב השיא, הנמסיס, הרצף הארוך, שעות משחק; ובקבוצה: מלך השנה. */

import { AL, canon, r2, durWords } from "./helpers.js";
import { fmt } from "./format.js";
import { yearTotals, monthTotals, yearNum } from "./totals.js";
import { sessionDurationMs } from "./durationRecords.js";
import { computeHeadToHead } from "./headToHead.js";
import { withBotMark } from "../botMark.js";

function yearSessions(db, yy) {
  return (db?.sessions || [])
    .filter((s) => yearNum(s.y) === yy)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * @returns {null | {
 *   year: number,
 *   nights: number,
 *   king: { name: string, amount: number } | null,
 *   players: Array<{
 *     name: string, nights: number, net: number,
 *     bestNight: { amount: number, iso: string, d: *, mo: * } | null,
 *     worstNight: { amount: number, iso: string, d: *, mo: * } | null,
 *     maxStreak: number, hoursMs: number, hoursKnown: number,
 *     crowns: number,
 *     bestPartner: object | null, nemesis: object | null,
 *   }>,
 * }}
 */
export function computeSeasonWrap(db, year) {
  if (!db) return null;
  const yy = yearNum(year);
  if (yy == null) return null;
  const A = AL(db);
  const sessions = yearSessions(db, yy);
  if (!sessions.length) return null;

  const byName = {};
  const get = (nm) => (byName[nm] = byName[nm] || {
    name: nm,
    nights: 0,
    net: 0,
    amounts: [],
    bestNight: null,
    worstNight: null,
    hoursMs: 0,
    hoursKnown: 0,
  });

  for (const s of sessions) {
    const totals = {};
    for (const e of s.entries || []) {
      const nm = canon(e.name, A);
      totals[nm] = r2((totals[nm] || 0) + (+e.amount || 0));
    }
    const ms = sessionDurationMs(s);
    for (const [nm, amt] of Object.entries(totals)) {
      const p = get(nm);
      p.nights += 1;
      p.net = r2(p.net + amt);
      p.amounts.push(amt);
      if (!p.bestNight || amt > p.bestNight.amount) {
        p.bestNight = { amount: amt, iso: s.iso, d: s.d, mo: s.mo };
      }
      if (!p.worstNight || amt < p.worstNight.amount) {
        p.worstNight = { amount: amt, iso: s.iso, d: s.d, mo: s.mo };
      }
      if (ms != null) {
        p.hoursMs += ms;
        p.hoursKnown += 1;
      }
    }
  }

  /* כתרים חודשיים בתוך השנה */
  const months = new Set(sessions.map((s) => Number(s.mo)));
  const crowns = {};
  for (const mo of months) {
    const top = monthTotals(db, yy, mo)[0];
    if (top && top.amount > 0) crowns[top.name] = (crowns[top.name] || 0) + 1;
  }

  /* ראש־בראש בתוך השנה בלבד (סף נמוך יותר — שנה אחת) */
  const h2h = computeHeadToHead({ ...db, sessions }, { minTogether: 2 });

  const players = Object.values(byName)
    .map((p) => {
      let run = 0;
      let maxStreak = 0;
      for (const amt of p.amounts) {
        run = amt > 0 ? run + 1 : 0;
        if (run > maxStreak) maxStreak = run;
      }
      const rivals = h2h?.forPlayer[p.name] || null;
      return {
        name: p.name,
        nights: p.nights,
        net: p.net,
        bestNight: p.bestNight,
        worstNight: p.worstNight,
        maxStreak,
        hoursMs: p.hoursMs,
        hoursKnown: p.hoursKnown,
        crowns: crowns[p.name] || 0,
        bestPartner: rivals?.bestPartner || null,
        nemesis: rivals?.nemesis || null,
      };
    })
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, "he"));

  const top = yearTotals(db, yy).totals[0] || null;
  return {
    year: yy,
    nights: sessions.length,
    king: top && top.amount > 0 ? { name: top.name, amount: top.amount } : null,
    players,
  };
}

function playerLines(p) {
  const lines = [];
  if (p.bestNight) {
    lines.push(`🌟 ערב השיא: ${fmt(p.bestNight.amount)} (${p.bestNight.d}.${p.bestNight.mo})`);
  }
  if (p.maxStreak >= 2) lines.push(`🔥 הרצף הארוך: ${p.maxStreak} ערבים`);
  if (p.nemesis) {
    lines.push(
      `⚔️ הנמסיס: ${p.nemesis.name} (ממוצע ${fmt(p.nemesis.avg)} לערב כשהוא בשולחן)`
    );
  }
  if (p.bestPartner) {
    lines.push(
      `🤝 השותף הכי רווחי: ${p.bestPartner.name} (ממוצע ${fmt(p.bestPartner.avg)} לערב)`
    );
  }
  if (p.hoursKnown > 0) lines.push(`⏱️ שעות על השולחן: ${durWords(p.hoursMs)}`);
  if (p.crowns > 0) lines.push(`👑 כתרים חודשיים: ${p.crowns}`);
  return lines;
}

/**
 * טקסט ה־Wrapped לוואטסאפ. עם playerName — כרטיס אישי + מלך השנה;
 * בלעדיו — סיכום קבוצתי עם הכרטיסים של המובילים.
 */
export function seasonWrapText(db, year, playerName = null) {
  const wrap = computeSeasonWrap(db, year);
  if (!wrap) return "";
  const yy = wrap.year;
  const out = [`🎁 סיכום השנה ${yy} — קופה פוקר`, `מ־${wrap.nights} ערבים מתועדים`];

  if (wrap.king) {
    out.push("", `👑 מלך השנה: ${wrap.king.name} · ${fmt(wrap.king.amount)}`);
  }

  if (playerName) {
    const name = canon(playerName, AL(db));
    const p = wrap.players.find((x) => x.name === name);
    if (p) {
      out.push("", `הכרטיס של ${p.name}:`, `נטו שנתי ${fmt(p.net)} · ${p.nights} ערבים`, ...playerLines(p));
    }
  } else {
    for (const p of wrap.players.slice(0, 5)) {
      out.push("", `${p.name} · נטו ${fmt(p.net)} · ${p.nights} ערבים`, ...playerLines(p));
    }
  }

  return withBotMark(out.join("\n").trim());
}
