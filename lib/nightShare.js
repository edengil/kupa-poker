/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf } from "./report";
import { settle, isCashOnly, transferVerb, isFemaleName } from "./settlement";
import { toWhatsApp } from "../components/poker/helpers.js";

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

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? CPS : 1);
  const result = settle(players, cps);
  return buildSettlement(result, {
    now: opts.now ?? session?.endedAt ?? Date.now(),
    isCashOnly,
    transferVerb,
  });
}

/**
 * סך טיפים לשחקן — מ־tips[] (יומן אירועים) וגם מ־tipsGiven על
 * entries/players. ערבים שמורים מלייב לפעמים נשארים עם tipsGiven בלבד
 * (בלי מערך tips) — חייבים לתפוס את שני המקורות.
 */
function tipTotalsByName(session, players) {
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
 * @param {object} session
 * @param {{ p: { name: string }, net: number }[]} [withNet]
 */
export function tipSummaryForSession(session, withNet) {
  const entries = session?.entries || [];
  const players = session?.players?.length
    ? session.players
    : entries.map((e) => ({
        name: e.name,
        tipsGiven: +e.tipsGiven || 0,
      }));
  if (!players.length) return "";

  const nets =
    withNet ||
    (entries.length
      ? entries.map((e) => ({ p: { name: e.name }, net: +e.amount || 0 }))
      : players.map((p) => ({
          p,
          net: netOf(p, session?.cps || CPS),
        })));

  const totals = tipTotalsByName(session, players);
  const tippers = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  const tipped = new Set(tippers.map((t) => t.name));
  const noTip = players.filter((p) => !tipped.has(p.name));

  const lines = ["💸 טיפים הערב"];

  if (tippers.length) {
    const top = tippers[0];
    const topWord = isFemaleName(top.name) ? "תותחית" : "תותח";
    lines.push(`🥇 מקום ראשון בטיפים: ${top.name} עם ${top.amount} — ${topWord}! 👏`);
    if (tippers[1]) {
      lines.push(`🥈 מקום שני: ${tippers[1].name} עם ${tippers[1].amount}`);
    }
    if (tippers.length > 2) {
      lines.push(
        `👏 גם נתנו: ${tippers
          .slice(2)
          .map((t) => `${t.name} (${t.amount})`)
          .join(", ")}`
      );
    }
  } else {
    lines.push("אף אחד לא שם טיפ הערב… 🙈");
  }

  if (noTip.length) {
    const roast = [
      `🙊 בלי טיפ הערב: ${noTip.map((p) => p.name).join(", ")} — היד קפוצה קצת? 😄`,
      `🙊 נעלמו בלי טיפ: ${noTip.map((p) => p.name).join(", ")} — שכחו את הארנק בבית?`,
    ];
    lines.push(roast[Math.floor(Date.now() / 60000) % roast.length]);
    const wonNoTip = noTip.filter((p) => {
      const row = nets.find((x) => x.p.name === p.name);
      return row && row.net > 0;
    });
    if (wonNoTip.length) {
      lines.push(
        `😏 ${wonNoTip.map((p) => p.name).join(", ")} — הרווחתם ולא השארתם טיפ? קצת בושה…`
      );
    }
  }

  return lines.join("\n");
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
  const tips = tipSummaryForSession(session);
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0 */
  return tips ? `${base}\n\n${tips}` : base;
}
