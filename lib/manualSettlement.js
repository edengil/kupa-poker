import { settle, isCashOnly, transferVerb } from "./settlement.js";
import { buildSettlement } from "./report.js";
import { CPS } from "./report.js";

const r0 = (v) => Math.round(+v || 0);

/** יתרות פתיחה אחרי עיגול ופיזור חוסר — כמו בחלוקה הרגילה. */
export function openingBalances(players, cps = CPS) {
  const { nets, shortfall, surplus } = settle(players, cps);
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
export function applyManualPayment(balances, { from, to, amount }) {
  if (!Number.isFinite(+amount) || +amount <= 0 || !Number.isInteger(+amount)) throw new Error("הסכום חייב להיות מספר שלם וחיובי.");
  if (!from || !to || from === to) throw new Error("בחר משלם ומקבל שונים.");
  const amt = r0(amount);
  if (amt <= 0) throw new Error("סכום חייב להיות חיובי.");
  const next = { ...balances };
  const fromNet = r0(next[from]);
  const toNet = r0(next[to]);
  const owe = fromNet < 0 ? -fromNet : 0;
  const due = toNet > 0 ? toNet : 0;
  if (owe <= 0) throw new Error(`${from} לא חייב יותר.`);
  if (due <= 0) throw new Error(`${to} לא אמור לקבל יותר.`);
  if (amt > owe) throw new Error(`הסכום גדול מהחוב של ${from} (${owe}₪).`);
  if (amt > due) throw new Error(`הסכום גדול ממה שמגיע ל${to} (${due}₪).`);
  next[from] = fromNet + amt;
  next[to] = toNet - amt;
  return next;
}

/** הופך יתרות לשחקנים סינתטיים ומריץ שוב את אלגוריתם החלוקה. */
export function settleFromBalances(balances, cps = CPS) {
  const players = Object.entries(balances || {}).map(([name, net]) => {
    const n = r0(net);
    if (n >= 0) return { name, buyin: 0, cashout: String(n * cps) };
    return { name, buyin: -n, cashout: "0" };
  });
  return settle(players, cps);
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
