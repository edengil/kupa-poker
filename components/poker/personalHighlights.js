/* זיהוי צופה מול רוסטר + רשימת שיאים אישיים (מקומות 1–3). */

import { AL, canon, FEMALE } from "./helpers.js";
import { fmt } from "./format.js";
import { computeRecords } from "./computeRecords.js";
import { fmtPct } from "./extraRecords.js";

/** שמות פרטיים לטיניים נפוצים בקבוצה → עברית (רק להתאמה זהירה). */
const LATIN_FIRST = {
  eden: "עדן",
  oren: "אורן",
  dan: "דן",
  david: "דוד",
  beni: "בני",
  benny: "בני",
  mike: "מייק",
  mikey: "מייקי",
  roy: "רוי",
  roei: "רועי",
  eitan: "איתן",
  ethan: "איתן",
  ofir: "אופיר",
  netanel: "נתנאל",
  itzik: "איציק",
  yarden: "ירדן",
  avraham: "אברהם",
  abraham: "אברהם",
  ben: "בן",
  kobi: "קובי",
  dor: "דור",
  shai: "שי",
  shmuel: "שמואל",
  nitzan: "ניצן",
  yuval: "יובל",
  amit: "עמית",
  danny: "דני",
  dani: "דני",
  yarin: "ירין",
  sagi: "שגיא",
};

const LATIN_LAST = {
  gil: "גיל",
  yanklovitz: "ינקלויץ",
  yankelowitz: "ינקלויץ",
  weisman: "ויסמן",
  wiseman: "ויסמן",
  liraz: "לירז",
  sana: "סנה",
  cohen: "כהן",
  tfilin: "תפילין",
  tefillin: "תפילין",
  hababo: "חבבו",
  aplalo: "אפללו",
  saada: "סעדה",
  shapak: "שפאק",
  yaakobi: "יעקובי",
  nisim: "ניסים",
  shalom: "שלום",
  gotnik: "גוטניק",
  malach: "מלאך",
  sandrovitz: "סנדרוביץ",
  elroi: "אלרועי",
  lampach: "למפך",
};

const PLACE_WORD = { 1: "ראשון", 2: "שני", 3: "שלישי" };
const LIMIT = 10;

function norm(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function hasHebrew(s) {
  return /[\u0590-\u05FF]/.test(s);
}

function firstToken(s) {
  return norm(s).split(/\s+/)[0] || "";
}

function lastToken(s) {
  const parts = norm(s).split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/** כל שמות הקנוניים שמופיעים בטבלה / רוסטר / מאזנים שנתיים. */
export function knownPlayerNames(db) {
  const A = AL(db);
  const names = new Set();
  for (const n of db.roster || []) names.add(canon(n, A));
  for (const s of db.sessions || []) {
    for (const e of s.entries || []) names.add(canon(e.name, A));
  }
  for (const y of db.yearly || []) {
    for (const e of y.entries || []) names.add(canon(e.name, A));
  }
  return [...names];
}

/** מנסה לתרגם שם גוגל לטיני למועמד עברי (פרטי + משפחה). */
function latinHint(display) {
  const parts = display.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const heFirst = LATIN_FIRST[parts[0]];
  if (!heFirst) return null;
  const heLast = parts.length > 1 ? LATIN_LAST[parts[parts.length - 1]] : null;
  if (heFirst && heLast) return `${heFirst} ${heLast}`;
  return heFirst;
}

/**
 * התאמה זהירה של צופה מחובר לגוגל מול שחקן בטבלה.
 * @returns {string | null} שם קנוני, או null אם אין התאמה בטוחה
 */
export function matchViewerToPlayer(db, viewer) {
  if (!db || !viewer) return null;
  const display = norm(viewer.full_name || viewer.name || "");
  if (!display) return null;

  const A = AL(db);
  const players = knownPlayerNames(db);
  if (!players.length) return null;
  const playerSet = new Set(players);

  const accept = (candidate) => {
    if (!candidate) return null;
    const c = canon(candidate, A);
    return playerSet.has(c) ? c : null;
  };

  /** כינוי קצר (טוקן אחד) — רק אם אין עוד שחקנים עם אותו פרטי. */
  const acceptShort = (token) => {
    if (!token || token.includes(" ")) return null;
    const aliased = A[token] ? canon(A[token], A) : accept(token);
    if (!aliased) return null;
    const first = firstToken(aliased);
    const rivals = players.filter((p) => firstToken(p) === first && p !== aliased);
    if (rivals.length > 0) return null;
    return playerSet.has(aliased) ? aliased : null;
  };

  if (hasHebrew(display)) {
    if (playerSet.has(display)) return display;
    if (display.includes(" ")) {
      const hit = accept(display) || accept(A[display]);
      if (hit) return hit;
    } else {
      const hit = acceptShort(display);
      if (hit) return hit;
    }
  }

  const hint = !hasHebrew(display) ? latinHint(display) : null;
  if (hint) {
    if (hint.includes(" ")) {
      const hit = accept(hint);
      if (hit) return hit;
    } else {
      const hit = acceptShort(hint);
      if (hit) return hit;
    }
  }

  const first = hasHebrew(display) ? firstToken(display) : hint && !hint.includes(" ") ? hint : null;
  if (first) {
    const withFirst = players.filter((p) => firstToken(p) === first || p === first);
    if (withFirst.length === 1) return withFirst[0];
  }

  const last = hasHebrew(display)
    ? lastToken(display)
    : hint && hint.includes(" ")
      ? lastToken(hint)
      : null;
  const firstHe = hasHebrew(display) ? firstToken(display) : hint ? firstToken(hint) : null;
  if (firstHe && last) {
    const both = players.filter((p) => firstToken(p) === firstHe && lastToken(p) === last);
    if (both.length === 1) return both[0];
  }

  return null;
}

function placeOf(playerName, ...holders) {
  for (let i = 0; i < holders.length; i++) {
    if (holders[i]?.name === playerName) return i + 1;
  }
  return 0;
}

function placeOfCouple(playerName, ...rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r.from === playerName || r.to === playerName) return i + 1;
  }
  return 0;
}

function dt(r) {
  if (!r?.d) return "";
  return `${r.d}.${r.mo}.${String(r.y).slice(2)}`;
}

function addPodium(items, playerName, holders, titleOf, detailOf, icon, weight) {
  const place = placeOf(playerName, ...holders);
  if (!place) return;
  const holder = holders[place - 1];
  items.push({
    place,
    title: titleOf(place, PLACE_WORD[place]),
    detail: detailOf(holder) || "",
    icon,
    weight,
  });
}

/**
 * @returns {{ place: 1|2|3, title: string, detail: string, icon: string }[]}
 */
export function computePersonalHighlights(db, playerName) {
  if (!db || !playerName) return [];
  const recs = computeRecords(db);
  if (!recs) return [];

  const items = [];

  addPodium(
    items,
    playerName,
    [recs.monthKing, recs.monthKing2, recs.monthKing3],
    (p, w) => `מקום ${w} בנטו · ${recs.monthLabel}`,
    (h) => fmt(h.amount),
    "👑",
    100
  );
  addPodium(
    items,
    playerName,
    [recs.yearKing, recs.yearKing2, recs.yearKing3],
    (p, w) => `מקום ${w} בנטו · ${recs.yearLabel}`,
    (h) => fmt(h.amount),
    "🏆",
    95
  );
  addPodium(
    items,
    playerName,
    [recs.allKing, recs.allKing2, recs.allKing3],
    (p, w) => `מקום ${w} בכל הזמנים`,
    (h) => fmt(h.amount),
    "🐐",
    90
  );
  addPodium(
    items,
    playerName,
    [recs.crownKing, recs.crownKing2, recs.crownKing3],
    (p, w) => `מקום ${w} במלך המלכים`,
    (h) => `${h.count} כתרים`,
    "🥇",
    85
  );
  addPodium(
    items,
    playerName,
    [recs.bestNight, recs.bestNight2, recs.bestNight3],
    (p, w) => `מקום ${w} בערב השיא`,
    (h) => `${fmt(h.amount)} · ${dt(h)}`,
    "🔥",
    88
  );

  if (recs.worstNight?.amount < 0) {
    const place = placeOf(playerName, recs.worstNight, recs.worstNight2, recs.worstNight3);
    const h = place ? [recs.worstNight, recs.worstNight2, recs.worstNight3][place - 1] : null;
    if (place && h?.amount < 0) {
      items.push({
        place,
        title: `מקום ${PLACE_WORD[place]} בערב הקשה`,
        detail: `${fmt(h.amount)} · ${dt(h)}`,
        icon: "🥶",
        weight: 40,
      });
    }
  }

  if (recs.bestMonth?.name === playerName) {
    items.push({
      place: 1,
      title: "החודש הטוב אי פעם",
      detail: `${fmt(recs.bestMonth.amount)} · ${recs.bestMonth.mo}/${recs.bestMonth.y}`,
      icon: "📅",
      weight: 80,
    });
  }
  if (recs.bestYear?.name === playerName) {
    items.push({
      place: 1,
      title: "השנה הטובה אי פעם",
      detail: `${fmt(recs.bestYear.amount)} · ${recs.bestYear.y}`,
      icon: "🗓️",
      weight: 78,
    });
  }

  addPodium(
    items,
    playerName,
    [recs.bestStreak, recs.bestStreak2, recs.bestStreak3],
    (p, w) => `מקום ${w} ברצף ניצחונות`,
    (h) => `${h.maxStreak} ערבים`,
    "🎖️",
    75
  );

  if (recs.liveStreak?.name === playerName) {
    items.push({
      place: 1,
      title: "רצף ניצחונות פעיל",
      detail: `${recs.liveStreak.tail} ערבים`,
      icon: "⚡",
      weight: 82,
    });
  }

  addPodium(
    items,
    playerName,
    [recs.winRate, recs.winRate2, recs.winRate3],
    (p, w) => `מקום ${w} באחוז ניצחונות`,
    (h) => `${h.rate}%`,
    "🎲",
    70
  );
  addPodium(
    items,
    playerName,
    [recs.bestAvg, recs.bestAvg2, recs.bestAvg3],
    (p, w) => `מקום ${w} בממוצע לערב`,
    (h) => fmt(h.avg),
    "📈",
    68
  );
  addPodium(
    items,
    playerName,
    [recs.mostWins, recs.mostWins2, recs.mostWins3],
    (p, w) => `מקום ${w} בערבים חיוביים`,
    (h) => `${h.wins} ערבים`,
    "✅",
    65
  );
  addPodium(
    items,
    playerName,
    [recs.attendTop, recs.attendTop2, recs.attendTop3],
    (p, w) => `מקום ${w} בנוכחות רצופה`,
    (h) => `${h.attendMax} ערבים`,
    "🪑",
    55
  );
  addPodium(
    items,
    playerName,
    [recs.most, recs.most2, recs.most3],
    (p, w) => `מקום ${w} במתמיד`,
    (h) => `${h.nights} ערבים`,
    "🎯",
    50
  );

  const extra = recs.extra;
  if (extra) {
    addPodium(
      items,
      playerName,
      [extra.hourly, extra.hourly2, extra.hourly3],
      (p, w) => `מקום ${w} בממוצע לשעה`,
      (h) => `${fmt(h.avgHourly)} לשעה`,
      "⏳",
      69
    );
    addPodium(
      items,
      playerName,
      [extra.roi, extra.roi2, extra.roi3],
      (p, w) => `מקום ${w} ברווח ביחס לקנייה`,
      (h) => fmtPct(h.lifetimeRoi),
      "📊",
      67
    );
    addPodium(
      items,
      playerName,
      [extra.hero, extra.hero2, extra.hero3],
      (p, w) => `מקום ${w} בגיבורי ערב`,
      (h) => `${h.hero} פעמים`,
      "🌟",
      66
    );
    addPodium(
      items,
      playerName,
      [extra.latest, extra.latest2, extra.latest3],
      (p, w) => `מקום ${w} בהגעה מאוחרת`,
      (h) => `כניסה ראשונה ממוצעת`,
      "🌙",
      48
    );
    addPodium(
      items,
      playerName,
      [extra.hostTop, extra.hostTop2, extra.hostTop3],
      (p, w) => `מקום ${w} באירוח`,
      (h) => `${h.n} ערבים`,
      "🏠",
      47
    );
  }

  if (recs.comeback?.name === playerName) {
    items.push({
      place: 1,
      title: "הקאמבק הגדול",
      detail: fmt(recs.comeback.jump),
      icon: "🎢",
      weight: 72,
    });
  }

  const chips = recs.chips;
  if (chips) {
    addPodium(
      items,
      playerName,
      [chips.bestMonth, chips.bestMonth2, chips.bestMonth3],
      (p, w) => `מקום ${w} בשיא ג'יטונים · ${chips.monthLabel}`,
      (h) => `${h.chips} ג'`,
      "🪙",
      77
    );
    addPodium(
      items,
      playerName,
      [chips.bestCashout, chips.bestCashout2, chips.bestCashout3],
      (p, w) => `מקום ${w} בשיא ג'יטונים · כל הזמנים`,
      (h) => `${h.chips} ג' · ${dt(h)}`,
      "🪙",
      76
    );
  }

  const tips = recs.tips;
  if (tips) {
    addPodium(
      items,
      playerName,
      [tips.biggestTip, tips.biggestTip2, tips.biggestTip3],
      (p, w) => `מקום ${w} בטיפ הגדול ביותר`,
      (h) => `${h.amount} ג' · ${dt(h)}`,
      "💎",
      74
    );
    addPodium(
      items,
      playerName,
      [tips.mostTipsNight, tips.mostTipsNight2],
      (p, w) => `מקום ${w} בהכי הרבה טיפים בערב`,
      (h) => `${h.count} טיפים · ${dt(h)}`,
      "🔁",
      73.5
    );
    addPodium(
      items,
      playerName,
      [tips.mostTipChipsNight, tips.mostTipChipsNight2, tips.mostTipChipsNight3],
      (p, w) => `מקום ${w} בג'יטוני טיפ בערב`,
      (h) => `${h.chips} ג' · ${dt(h)}`,
      "🪙",
      73.2
    );
    addPodium(
      items,
      playerName,
      [tips.monthKing, tips.monthKing2, tips.monthKing3],
      (p, w) => `מקום ${w} במלך הטיפים · ${tips.monthLabel}`,
      (h) => `${h.chips} ג'`,
      "🏅",
      73
    );
    addPodium(
      items,
      playerName,
      [tips.allKing, tips.allKing2, tips.allKing3],
      (p, w) => `מקום ${w} במלך הטיפים · כל הזמנים`,
      (h) => `${h.chips} ג'`,
      "🐐",
      71
    );
  }

  const cf = recs.coupleFills;
  if (cf) {
    for (const [rows, label, icon, weight] of [
      [[cf.monthTop, cf.monthTop2, cf.monthTop3], `מילוי זוגי · ${cf.monthLabel}`, "🤝", 45],
      [[cf.allTop, cf.allTop2, cf.allTop3], "מילוי זוגי · כל הזמנים", "🔗", 44],
    ]) {
      const place = placeOfCouple(playerName, ...rows);
      if (!place) continue;
      const h = rows[place - 1];
      items.push({
        place,
        title: `מקום ${PLACE_WORD[place]} ב${label}`,
        detail: h ? `${h.label} · ${h.chips} ג'` : "",
        icon,
        weight,
      });
    }
  }

  items.sort((a, b) => a.place - b.place || b.weight - a.weight);
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    if (seen.has(it.title)) continue;
    seen.add(it.title);
    uniq.push({ place: it.place, title: it.title, detail: it.detail, icon: it.icon });
    if (uniq.length >= LIMIT) break;
  }
  return uniq;
}

export function isFemalePlayer(name) {
  return FEMALE.has(name) || FEMALE.has(firstToken(name));
}
