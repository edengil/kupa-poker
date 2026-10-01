/* טקסטי מצב וסיכום לערב חי. הפונקציות רק בונות טקסט מהמצב הקיים. */

import { CPS, netOf, partitionByNet, settleLine } from "../report.js";
import { byGender } from "../gender.js";
import { nightSummaryText, sessionFromLive, tipSummaryForSession } from "../nightShare.js";
import { assignPodiumMedals } from "../podiumMedals.js";
import { settlementAppUrl, withSettlementLink } from "../settlementInvite.js";
import { r2 } from "./state.js";

function siteFromCmds(cmds) {
  const hit = (cmds || []).find((c) => c.siteUrl && c.slug);
  return hit ? { siteUrl: hit.siteUrl, slug: hit.slug } : {};
}

/** אותו סיכום כמו גיליון השיתוף באפליקציה (נטו + טיפים) + לינק לדף הקבוצה. */
export function finalSummary(state, cps, cmds, aliases, now) {
  const summary = nightSummaryText(sessionFromLive(state, { cps, now }), aliases);
  return withSettlementLink(summary, settlementAppUrl(siteFromCmds(cmds)));
}

/* כשהאחרון יצא — רק אישור קצר. הסיכום המלא ולינק הערב נשלחים פעם אחת,
   מהאפליקציה, אחרי שעדן שומר את הערב ומאשר את ההעברות. בלי המילים
   «חלוקה» / «חשבון סופי» — אחרת ההודעה הקצרה הזו הייתה ננעצת כסיכום ערב. */
export function allClosedNote(state) {
  const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
  return [
    `✅ כולם סגורים · קופה ${pot}₪`,
    "עדן — סגור את הערב באפליקציה ואשר את ההעברות.",
    "הסיכום המלא עם לינק לסימון «שולם» יישלח לקבוצה מיד אחרי זה.",
  ].join("\n");
}

/* --------------------------- תמונת מצב ---------------------------
   מה שאי אפשר לקרוא מרשימת הביט לבד: כמה עוד בשולחן, כמה מהמלאי יצא,
   וכמה זמן משחקים.
   ---------------------------------------------------------------- */
export function snapshot(state, cps = CPS) {
  const ps = state.players;
  const closed = ps.filter((p) => p.cashout !== "" && p.cashout != null);
  const pot = r2(ps.reduce((t, p) => t + (+p.buyin || 0), 0));
  const prepared =
    state.entriesCount === "" || state.entriesCount == null ? null : +state.entriesCount || 0;

  // רק מה שאין בדוח שמתחתיו — התאריך, השעון ומונה הכניסות כבר שם
  const rows = [
    `${ps.length} שחקנים · ${ps.length - closed.length} בשולחן · ${closed.length} סגרו`,
    `קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`,
  ];
  if (prepared !== null && prepared - pot / 50 <= 3)
    rows.push(`⚠️ נשארו ${r2(prepared - pot / 50)} כניסות בלבד`);
  if (state.pending) rows.push(`⏳ מחכה לג'יטונים של ${state.pending}`);
  return rows.join("\n");
}

/* ------------------------ מצב ביניים בסגירה ------------------------
   נשלח עם "סיום משחק" ואחרי כל שחקן שנסגר: כמה כל אחד נכנס, מי כבר סגור
   ועם מה, ומי עוד פתוח — כדי שאפשר יהיה להמשיך בלי לגלול אחורה. */
export function closingStatus(state, cps = CPS) {
  const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
  const netWord = (p) => {
    const net = netOf(p, cps);
    const g = (male, female) => byGender(p.name, male, female);
    if (net === 0) return `${g("סגר", "סגרה")} באפס`;
    return net > 0 ? `${g("מגיע", "מגיעה")} ${net}₪` : `${g("חייב", "חייבת")} ${-net}₪`;
  };
  const { winners, even, losers, open } = partitionByNet(state.players, cps);
  const closedLine = (x) =>
    `✅ ${x.p.name} · ${byGender(x.p.name, "נכנס", "נכנסה")} ${r2(+x.p.buyin || 0)}₪ · ${byGender(x.p.name, "יצא", "יצאה")} ${r2(+x.p.cashout || 0)} ג׳ · ${netWord(x.p)}`;
  const openLine = (p) =>
    `⏳ ${p.name} · ${byGender(p.name, "נכנס", "נכנסה")} ${r2(+p.buyin || 0)}₪`;
  const groups = [
    winners.map(closedLine),
    even.map(closedLine),
    losers.map(closedLine),
    open.map(openLine),
  ].filter((g) => g.length);
  const lines = groups.flatMap((g, i) => (i ? ["", ...g] : g));
  return [`קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`, ...lines].join("\n");
}

/* -------------------------- חשבון סופי --------------------------
   זוכים קודם (הגדול קודם + מדליות 1–3), אחריהם מי שסגר באפס, ובסוף
   החייבים (החוב הקטן קודם, הגדול אחרון) — עם שורת רווח בין הקבוצות.
   בסוף בלוק טיפים: שבח למי שנתן, צחוק על מי שלא. */
export function settleSummary(state, cps = CPS) {
  const withNet = state.players.map((p) => ({ p, net: netOf(p, cps) }));
  const winSorted = withNet.filter((x) => x.net > 0).sort((a, b) => b.net - a.net);
  const win = assignPodiumMedals(winSorted, (x) => x.net).map(({ item: x, medal }) => {
    const line = settleLine(x.p, cps);
    return medal ? `${medal} ${line}` : line;
  });
  const even = withNet.filter((x) => x.net === 0).map((x) => settleLine(x.p, cps));
  /* חייבים: חוב קטן קודם (−50 לפני −150) */
  const owe = withNet
    .filter((x) => x.net < 0)
    .sort((a, b) => b.net - a.net)
    .map((x) => settleLine(x.p, cps));
  const body = [win, even, owe]
    .filter((g) => g.length)
    .map((g) => g.join("\n"))
    .join("\n\n");

  const tipLines = tipSummaryForSession(state, withNet);
  if (!tipLines) return body;
  return `${body}\n\n${tipLines}`;
}
