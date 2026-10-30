import { settle, roundedNets, isCashOnly, transferVerb, canonName } from "./settlement";

/** שמות הכיורים הפנימיים בהעברות (לא מוצגים בקבוצה — פרטי למנהל). */
export const POT_SINK_NAME = "קופת חיסכון";
export const RESIDUAL_SINK_NAME = "עודף ערב";
import { buildSettlement } from "./report.js";
import { CPS } from "./report.js";

const r0 = (v) => Math.round(+v || 0);

/** יתרות פתיחה אחרי עיגול ופיזור חוסר — כמו בחלוקה הרגילה. */
export function openingBalances(players, cps = CPS, opts = {}) {
  const { nets, shortfall, surplus } = settle(players, cps, opts);
  const balances = {};
  for (const row of nets) balances[row.name] = r0(row.net);
  return { balances, shortfall, surplus };
}

export function debtorsOf(balances) {
  return Object.entries(balances || {})
    .filter(([, net]) => net < 0)
    .map(([name, net]) => ({ name, owe: -net }))
    .sort((a, b) => b.owe - a.owe || a.name.localeCompare(b.name, "he"));
}

export function creditorsOf(balances) {
  return Object.entries(balances || {})
    .filter(([, net]) => net > 0)
    .map(([name, net]) => ({ name, due: net }))
    .sort((a, b) => b.due - a.due || a.name.localeCompare(b.name, "he"));
}

/**
 * רושם העברה ידנית: חייב → זוכה.
 * מחזיר יתרות חדשות או זורק אם הסכום לא חוקי.
 */
export function applyManualPayment(balances, { from, to, amount, fromSplit }) {
  if (!Number.isFinite(+amount) || +amount <= 0 || !Number.isInteger(+amount)) throw new Error("הסכום חייב להיות מספר שלם וחיובי.");
  if (!from || !to || from === to) throw new Error("בחר משלם ומקבל שונים.");
  const amt = r0(amount);
  if (amt <= 0) throw new Error("סכום חייב להיות חיובי.");
  const next = { ...balances };
  const toNet = r0(next[to]);
  const due = toNet > 0 ? toNet : 0;
  if (due <= 0) throw new Error(`${to} לא אמור לקבל יותר.`);
  if (fromSplit && typeof fromSplit === "object") {
    // תשלום זוגי ידני: הפיצול מפורש (שם → סכום) ומסוכם לסכום ההעברה.
    let total = 0;
    for (const [name, part] of Object.entries(fromSplit)) {
      if (!Number.isInteger(+part) || +part < 0) throw new Error("פיצול לא תקין.");
      if (!(name in next)) throw new Error(`שחקן לא מוכר בפיצול: ${name}.`);
      const p = r0(part);
      const owe = r0(next[name]) < 0 ? -r0(next[name]) : 0;
      if (owe <= 0) throw new Error(`${name} לא חייב יותר.`);
      if (p > owe) throw new Error(`הסכום גדול מהחוב של ${name} (${owe}₪).`);
      total += p;
    }
    if (total !== amt) throw new Error("סכום הפיצול לא תואם לסכום ההעברה.");
    if (amt > due) throw new Error(`הסכום גדול ממה שמגיע ל${to} (${due}₪).`);
    for (const [name, part] of Object.entries(fromSplit)) next[name] = r0(next[name]) + r0(part);
    next[to] = toNet - amt;
    return next;
  }
  const fromNet = r0(next[from]);
  const owe = fromNet < 0 ? -fromNet : 0;
  if (owe <= 0) throw new Error(`${from} לא חייב יותר.`);
  if (amt > owe) throw new Error(`הסכום גדול מהחוב של ${from} (${owe}₪).`);
  if (amt > due) throw new Error(`הסכום גדול ממה שמגיע ל${to} (${due}₪).`);
  next[from] = fromNet + amt;
  next[to] = toNet - amt;
  return next;
}

/** הופך יתרות לשחקנים סינתטיים ומריץ שוב את אלגוריתם החלוקה. */
export function settleFromBalances(balances, cps = CPS, opts = {}) {
  const players = Object.entries(balances || {}).map(([name, net]) => {
    const n = r0(net);
    if (n >= 0) return { name, buyin: 0, cashout: String(n * cps) };
    return { name, buyin: -n, cashout: "0" };
  });
  return settle(players, cps, opts);
}

/**
 * ניתוב הקופה דרך עדן (הכרעת עדן, 25.10): הקופה היא חובת הפקדה של עדן —
 * כשהוא חייב, תשלומיו יוצאים קודם לקופה ורק השאר לזוכים (למשל הפסד
 * 530 = 437 לזוכים + 93 לקופה). הפעולה מחליפה מקורות בין העברות בלי
 * לשנות שום סכום כולל: לכל שחקן אותו סך יוצא/נכנס, וכל זוכה מקבל אותו
 * סכום — רק ה"מי שילם לקופה" משתנה. כשעדן זוכה אין ניתוב: חלקו בקופה
 * הוא חלקו היחסי בקיצוץ המימון, כמו כל זוכה.
 * העברות ידניות/זוגיות לא מנותבות מחדש. גם העברת זוג (pair) מוגנת: זוגות
 * נסגרים קודם (כלל עדן) — הניתוב מחליף רק העברות רגילות של עדן, כדי
 * שהכיסוי מול בת הזוג לא ייפצל (ערב 24.10: בלי ההגנה עדן→אורן ירד מ־307
 * ל־237 וקובי שילם לאורן 70 במקומו).
 */
export function routePotThroughEden(transfers, edenName, sinkName) {
  const isEden = (n) => canonName(String(n || "")) === canonName(edenName);
  // נרמול: כל העברה לכיור מסומנת pot כבר בכניסה (אחידות למיזוג השורות)
  const out = (transfers || []).map((t) =>
    t.to === sinkName && !t.manual && !t.pot ? { ...t, pot: true } : { ...t }
  );
  let edenPotBurden = 0;
  const sinkIn = () =>
    out.filter((t) => t.to === sinkName && !t.manual).reduce((s, t) => s + t.amount, 0);
  let need = sinkIn();
  if (need <= 0) return { transfers: out, edenPotBurden };

  const addOrMerge = (from, to, amount, flags = {}) => {
    if (amount <= 0) return;
    const ex = out.find(
      (t) => t.from === from && t.to === to && !t.manual && !t.joint && !!t.pot === !!flags.pot && !!t.residual === !!flags.residual
    );
    if (ex) ex.amount += amount;
    else out.push({ from, to, amount, ...flags });
  };

  // מקרה א: עדן חייב — תשלומיו לקופה קודם
  for (const st of out.filter((t) => t.to === sinkName && !t.manual && !isEden(t.from))) {
    if (need <= 0) break;
    let a = Math.min(st.amount, need);
    while (a > 0) {
      const et = out.find(
        (t) => isEden(t.from) && t.to !== sinkName && !t.manual && !t.joint && !t.pair && t.amount > 0
      );
      if (!et) break;
      const swap = Math.min(a, et.amount);
      et.amount -= swap;
      st.amount -= swap;
      a -= swap;
      need -= swap;
      edenPotBurden += swap;
      addOrMerge(edenName, sinkName, swap, { pot: true });
      addOrMerge(st.from, et.to, swap, {});
    }
  }
  // מיזוג שורות זהות (אותו משלם/מקבל/דגלים) שההתאמה פיצלה לכמה צעדים
  const merged = [];
  for (const t of out) {
    if (t.amount <= 0) continue;
    if (!t.manual && !t.joint && !t.fromSplit) {
      const key = `${t.from}\0${t.to}\0${t.pot ? 1 : 0}\0${t.residual ? 1 : 0}\0${t.pair ? 1 : 0}`;
      const ex = merged.find((m) => m._key === key);
      if (ex) {
        ex.amount += t.amount;
        continue;
      }
      merged.push({ ...t, _key: key });
    } else {
      merged.push({ ...t });
    }
  }
  for (const m of merged) delete m._key;
  return { transfers: merged, edenPotBurden };
}

/**
 * יתרות פתיחה לערב קופה (מודל 25.10): נטו גולמי של השחקנים + כיור הקופה
 * כזוכה נוסף. בלי חלוקת חוסר אוטומטית — החלוקה נעשית בשכבת החלוקה עצמה.
 * shortfall כאן = חוסר המימון הכולל (תביעות זוכים + קופה − חובות).
 */
export function openingBalancesWithPot(players, cps = CPS, potAmount = 0, potSinkName = "") {
  const nets = roundedNets(players, cps);
  const balances = Object.fromEntries(nets.map((r) => [r.name, r.net]));
  const rawTotal = nets.reduce((s, r) => s + r.net, 0);
  if (potSinkName && potAmount > 0) balances[potSinkName] = potAmount;
  return {
    balances,
    shortfall: Math.max(0, rawTotal + (potAmount || 0)),
    surplus: Math.max(0, -(rawTotal + (potAmount || 0))),
  };
}

/**
 * מחיל מפת חוסר ידנית על יתרות פתיחה: זוכה מקבל פחות (עד 0). שם מוגן
 * (כיור הקופה) לא נחתך לעולם; שמות לא מוכרים מדולגים. מחזיר אובייקט חדש.
 */
export function applyShortfallMap(balances, shortfallMap, protectName = "") {
  const out = { ...(balances || {}) };
  for (const [name, amtRaw] of Object.entries(shortfallMap || {})) {
    if (name === protectName) continue;
    if (!(name in out)) continue;
    const amt = Math.round(+amtRaw || 0);
    if (amt > 0 && out[name] > 0) out[name] = Math.max(0, out[name] - amt);
  }
  return out;
}

/**
 * מפת חוסר ידנית במסלול בלי־קופה (אין כיור): דו־צדדית — זוכה מקבל פחות
 * וחייב משלם פחות, כל אחד עד אפס. מימוש אחד ל־resolver ולעורך החלוקה,
 * כדי שתקרות העורך יחושבו מול אותן יתרות שה־resolver מחיל בפועל —
 * אחרת העורך מאשר תשלום שה־resolver זורק אחר כך (ממצא ביקורת 3).
 */
export function applyManualShortfall(balances, shortfallMap) {
  const out = { ...(balances || {}) };
  for (const [name, amtRaw] of Object.entries(shortfallMap || {})) {
    if (!(name in out)) continue;
    const amt = Math.round(+amtRaw || 0);
    if (amt <= 0) continue;
    if (out[name] > 0) out[name] = Math.max(0, out[name] - amt);
    else if (out[name] < 0) out[name] = Math.min(0, out[name] + amt);
  }
  return out;
}

/**
 * יתרות פתיחה לעורך החלוקה בערב קופה — הזכאויות נטו, אחרי חלוקת החוסר:
 * מפת חוסר ידנית אם ניתנה (ערב שמור), אחרת החלוקה האוטומטית של settle לפי
 * העדפת הזוכים (הכיור מוגן אחרון, כמו ב־resolver). בלי זה העורך אוכף את
 * תקרות ההעברה (maxPayable/applyManualPayment) מול הברוטו, ומאפשר לרשום
 * העברה מעבר לזכאות נטו — שה־resolver אחר כך זורק בשקט (ערב 24.10).
 */
export function editorBalancesWithPot(players, cps, potAmount, potSinkName, opts = {}) {
  const gross = openingBalancesWithPot(players, cps, potAmount, potSinkName);
  const shortfallMap = opts.shortfallMap;
  let balances;
  if (shortfallMap && Object.keys(shortfallMap).length) {
    balances = applyShortfallMap(gross.balances, shortfallMap, potSinkName);
  } else {
    const dist = settleFromBalances(gross.balances, cps, {
      preferCreditors: [potSinkName, ...(opts.preferCreditors || [])],
    });
    balances = Object.fromEntries((dist.nets || []).map((n) => [n.name, n.net]));
  }
  return { balances, shortfall: gross.shortfall, surplus: gross.surplus };
}

/**
 * בונה טקסט חלוקה: קודם העברות שסומנו ידנית, אחר כך מה שנשאר מהאלגוריתם.
 */
export function buildManualSettlementText({
  manualPayments = [],
  remaining,
  now = Date.now(),
} = {}) {
  const manualTransfers = manualPayments.map((p) => ({
    from: p.from,
    to: p.to,
    amount: r0(p.amount),
    manual: true,
  }));
  const auto = remaining?.transfers || [];
  const transfers = [...manualTransfers, ...auto];
  return buildSettlement(
    { transfers, shortfall: remaining?.shortfall || 0 },
    { now, isCashOnly, transferVerb }
  );
}

export function maxPayable(balances, from, to) {
  const owe = Math.max(0, -r0(balances?.[from]));
  const due = Math.max(0, r0(balances?.[to]));
  return Math.min(owe, due);
}
