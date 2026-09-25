/* התראות בתוך האפליקציה — מחושבות מהנתונים שכבר קיימים.
   מייל הוא רק גיבוי, אחרי שהפריט נשאר פתוח ונכנסו אליו כמה פעמים. */

import { couplePartner } from "./paymentAccess.js";
import { latestNightConfirmations } from "./nightConfirmations.js";
import { jerusalemYmd } from "./paymentReminder.js";
import { isPlanStale } from "./planTiming.js";
import { planInviteLabel } from "./planInvite.js";
import { brokenRecords } from "./poker/brokenRecords.js";
import { fmt } from "./poker/format.js";
import { AL, canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import { knownPlayerNames, matchViewerToPlayer } from "./poker/personalHighlights.js";
import { playerRecentForm } from "./poker/recentForm.js";
import { latestSession } from "./lastSession.js";
import { dueReports, reportTitle } from "./summary.js";

/** כמה כניסות בלי טיפול לפני מייל אחד. */
export const NOTICE_EMAIL_AFTER = 3;

const KIND_ORDER = { transfer: 0, record: 1, summary: 2, streak: 3, plan: 4 };

function israelDate(now = new Date()) {
  const [y, m, d] = jerusalemYmd(now).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function sessionYm(session) {
  const y = Number(session?.y);
  const mo = Number(session?.mo);
  if (Number.isFinite(y) && Number.isFinite(mo) && mo >= 1 && mo <= 12) return y * 100 + mo;
  const match = String(session?.iso || "").match(/^(\d{4})-(\d{2})/);
  if (match) return Number(match[1]) * 100 + Number(match[2]);
  return null;
}

function periodBounds(rep) {
  if (rep.kind === "m") return [rep.y * 100 + rep.mo, rep.y * 100 + rep.mo];
  if (rep.kind === "q") return [rep.y * 100 + (rep.q - 1) * 3 + 1, rep.y * 100 + rep.q * 3];
  if (rep.kind === "h") return rep.h === 1 ? [rep.y * 100 + 1, rep.y * 100 + 6] : [rep.y * 100 + 7, rep.y * 100 + 12];
  return [rep.y * 100 + 1, rep.y * 100 + 12];
}

function periodNets(db, rep) {
  const aliases = AL(db);
  const [from, to] = periodBounds(rep);
  const nets = {};
  let nights = 0;
  for (const session of db.sessions || []) {
    const ym = sessionYm(session);
    if (ym == null || ym < from || ym > to) continue;
    nights += 1;
    for (const entry of session.entries || []) {
      const name = canon(entry.name, aliases);
      nets[name] = Math.round(((nets[name] || 0) + (Number(entry.amount) || 0)) * 100) / 100;
    }
  }
  if (!nights) return null;
  return nets;
}

function withPartner(name, aliases) {
  const names = [name];
  const partner = couplePartner(name, aliases);
  if (partner) names.push(partner);
  return names;
}

function transferNotices(db) {
  const view = latestNightConfirmations(db.sessions);
  if (!view) return [];
  const aliases = AL(db);
  const dateLabel = `${view.session.d}.${view.session.mo}.${view.session.y}`;
  const items = [];
  for (const row of view.rows) {
    if (row.closed) continue;
    const from = canon(row.from, aliases);
    const to = canon(row.to, aliases);
    const body = `${row.from} אל ${row.to} · ${row.amount}₪ · ערב ${dateLabel}`;
    items.push({
      id: `transfer:${view.session.id}:${row.index}:paid`,
      kind: "transfer",
      title: "העברה ממתינה",
      body,
      actorRole: "מעביר",
      actorName: from,
      action: "paid",
      actionLabel: "שולם",
      sessionId: view.session.id,
      index: row.index,
      audience: withPartner(from, aliases),
    });
    items.push({
      id: `transfer:${view.session.id}:${row.index}:received`,
      kind: "transfer",
      title: "העברה ממתינה",
      body,
      actorRole: "מקבל",
      actorName: to,
      action: "received",
      actionLabel: "התקבל",
      sessionId: view.session.id,
      index: row.index,
      audience: withPartner(to, aliases),
    });
  }
  return items;
}

function recordNotices(db) {
  const latest = latestSession(db.sessions);
  if (!latest) return [];
  const prior = (db.sessions || []).filter((session) => session.id !== latest.id);
  const lines = brokenRecords({ ...db, sessions: prior }, latest);
  if (!lines.length) return [];
  const aliases = AL(db);
  const audience = [...new Set((latest.entries || []).map((entry) => canon(entry.name, aliases)))];
  return [{
    id: `record:${latest.id}`,
    kind: "record",
    title: lines.length > 1 ? "שיאים חדשים" : "שיא חדש",
    body: lines.join("\n"),
    action: null,
    audience,
  }];
}

function summaryNotices(db, now) {
  const reports = dueReports(israelDate(now));
  const items = [];
  for (const rep of reports) {
    const nets = periodNets(db, rep);
    if (!nets) continue;
    const title = reportTitle(rep);
    for (const [name, amount] of Object.entries(nets)) {
      items.push({
        id: `summary:${rep.key}:${name}`,
        kind: "summary",
        title,
        body: `הנטו שלך: ${fmt(amount)}₪`,
        action: null,
        audience: [name],
      });
    }
  }
  return items;
}

function streakNotices(db) {
  const items = [];
  for (const name of knownPlayerNames(db)) {
    const form = playerRecentForm(db, name);
    if (!form || !form.streakType || form.streak < 3) continue;
    const last = form.nights[form.nights.length - 1];
    const win = form.streakType === "win";
    items.push({
      id: `streak:${name}:${form.streakType}:${last?.iso || ""}`,
      kind: "streak",
      title: win ? "רצף נצחונות" : "רצף הפסדים",
      body: `${form.streak} ערבים ברצף`,
      action: null,
      audience: [name],
    });
  }
  return items;
}

function planNotices(db, now) {
  const plan = db.plan;
  if (!plan?.iso || isPlanStale(plan, jerusalemYmd(now))) return [];
  const place = plan.location ? `\n${plan.location}` : "";
  return [{
    id: `plan:${plan.iso}`,
    kind: "plan",
    title: "ערב מתוכנן",
    body: `${planInviteLabel(plan)}${place}`,
    action: null,
    audience: knownPlayerNames(db),
  }];
}

/** כל ההתראות הפתוחות עכשיו, לפני סינון לפי צופה. */
export function collectNotices(db, now = new Date()) {
  if (!db) return [];
  const items = [
    ...transferNotices(db),
    ...recordNotices(db),
    ...summaryNotices(db, now),
    ...streakNotices(db),
    ...planNotices(db, now),
  ];
  return items.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
}

/** הרשימה של מי שפתח: שלו, ובמסך הניהול גם העברות, שיאים וערב מתוכנן. */
export function noticesForViewer(items, viewerName, { isAdmin = false, aliases = DEFAULT_ALIASES } = {}) {
  const me = viewerName ? canon(viewerName, aliases) : null;
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const personal = me != null && (item.audience || []).some((name) => canon(name, aliases) === me);
    const adminExtra = isAdmin && (item.kind === "transfer" || item.kind === "record" || item.kind === "plan");
    if (!personal && !adminExtra) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      ...item,
      canMark: Boolean(item.action) && (personal || isAdmin),
    });
  }
  return out;
}

function matchedPlayer(db, view) {
  return matchViewerToPlayer(db, { full_name: view?.name, name: view?.name });
}

/** כתובת גוגל אחרונה שכבר נקשרה לשחקן דרך יומן הצפיות. */
export function linkedEmail(db, player, views) {
  let best = null;
  for (const view of views || []) {
    if (matchedPlayer(db, view) !== player) continue;
    const email = String(view.email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const at = Date.parse(view.at) || 0;
    if (!best || at >= best.at) best = { email, at };
  }
  return best?.email || null;
}

function visitsSince(db, player, views, sinceIso) {
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since)) return 0;
  let count = 0;
  for (const view of views || []) {
    if (matchedPlayer(db, view) !== player) continue;
    const at = Date.parse(view.at);
    if (Number.isFinite(at) && at >= since) count += 1;
  }
  return count;
}

/**
 * אחרי שהפריט כבר הוצג, שלוש כניסות בלי שהוא נסגר מזכות מייל אחד.
 * כניסות מלפני שהפריט נרשם לא נספרות. בלי כתובת מקושרת אין מייל.
 */
export function planNoticeEmails({
  db,
  items,
  views,
  sent = {},
  firstSeen = {},
  now = new Date(),
}) {
  const nextFirst = { ...firstSeen };
  const due = [];
  const live = new Set();
  const stampedAt = now.toISOString();
  for (const item of items || []) {
    for (const player of item.audience || []) {
      const key = `${item.id}|${player}`;
      live.add(key);
      if (sent[key]) continue;
      if (!nextFirst[key]) {
        nextFirst[key] = stampedAt;
        continue;
      }
      const email = linkedEmail(db, player, views);
      const visits = visitsSince(db, player, views, nextFirst[key]);
      if (!email || visits < NOTICE_EMAIL_AFTER) continue;
      due.push({
        key,
        player,
        email,
        title: item.title,
        body: item.body,
        actorRole: item.actorRole || null,
        actorName: item.actorName || null,
      });
    }
  }
  for (const key of Object.keys(nextFirst)) {
    if (!live.has(key)) delete nextFirst[key];
  }
  return { due, firstSeen: nextFirst };
}

const PUSH_KINDS = new Set(["record", "summary", "transfer", "streak", "plan"]);

/** שחקן שמקושר למנוי: קודם שם הגוגל, ואז השם שנשמר בהרשמה. */
export function subscriptionPlayer(db, sub) {
  const fromAccount = matchViewerToPlayer(db, { full_name: sub?.name, name: sub?.name });
  if (fromAccount) return fromAccount;
  const stored = typeof sub?.player_name === "string" ? sub.player_name.trim() : "";
  if (!stored || !db) return null;
  const players = new Set(knownPlayerNames(db));
  return players.has(stored) ? stored : null;
}

function pushText(item) {
  const who = item.actorRole ? `מי שצריך לפעול: ${item.actorRole}` : "";
  const text = [item.body, who].filter(Boolean).join("\n");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

/**
 * פוש אחד לכל פריט ולכל שחקן שיש לו מנוי.
 * בלי מנוי אין שליחה, והפריט נשאר ברשימה שבתוך האפליקציה.
 */
export function planNoticePushes({ db, items, subscriptions, sent = {} }) {
  const due = [];
  for (const item of items || []) {
    if (!PUSH_KINDS.has(item.kind)) continue;
    for (const player of item.audience || []) {
      const key = `${item.id}|${player}`;
      if (sent[key]) continue;
      const targets = (subscriptions || []).filter((sub) => subscriptionPlayer(db, sub) === player);
      if (!targets.length) continue;
      due.push({
        key,
        kind: item.kind,
        player,
        title: item.title,
        body: pushText(item),
        tag: item.id,
        targets,
      });
    }
  }
  return { due };
}
