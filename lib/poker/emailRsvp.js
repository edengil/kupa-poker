/* זימוני אימייל לערב מתוכנן — חישוב טהור.
   האימיילים חיים ב־db.emails (שם קנוני → כתובת), נערכים בפרופיל השחקן.
   ההזמנות והאישורים מהאימייל נשמרים על ה־plan עצמו (emailInvites /
   emailRsvps), כדי שיזרמו עם ה־snapshot לכל הצופים בלי טבלה נוספת. */

import { AL, canon } from "./helpers.js";
import { MONTHS } from "./format.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** כתובת תקינה מנורמלת (אותיות קטנות, בלי רווחים) — או null. */
export function normalizePlayerEmail(value) {
  const v = String(value || "").trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

/** כל שמות השחקנים המוכרים: סגל + מי שהופיע בערבים. קנוני, ממוין א"ב. */
export function knownPlayerNames(db) {
  const A = AL(db || {});
  const names = new Set();
  for (const raw of db?.roster || []) {
    const nm = canon(String(raw || "").trim(), A);
    if (nm) names.add(nm);
  }
  for (const s of db?.sessions || []) {
    for (const e of s?.entries || []) {
      const nm = canon(String(e?.name || "").trim(), A);
      if (nm) names.add(nm);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "he"));
}

/** אימייל שמור לשחקן (לפי שם קנוני) — או null. */
export function playerEmail(db, name) {
  const A = AL(db || {});
  const nm = canon(String(name || "").trim(), A);
  return normalizePlayerEmail(db?.emails?.[nm]);
}

/** db חדש עם אימייל מעודכן לשחקן; מחרוזת ריקה מוחקת את הכתובת. */
export function setPlayerEmail(db, name, email) {
  const A = AL(db || {});
  const nm = canon(String(name || "").trim(), A);
  const emails = { ...(db?.emails || {}) };
  const v = normalizePlayerEmail(email);
  if (v) emails[nm] = v;
  else delete emails[nm];
  return { ...(db || {}), emails };
}

/**
 * פענוח טקסט ייבוא אימיילים — שורה לכל שחקן בפורמט "שם: email".
 * @returns {{ matched: Array<{name, email}>, unmatched: string[], invalid: string[] }}
 */
export function parseEmailImport(db, text) {
  const A = AL(db || {});
  const byCanon = new Map(knownPlayerNames(db).map((k) => [canon(k, A), k]));
  const matched = [];
  const unmatched = [];
  const invalid = [];
  const seen = new Set();
  for (const rawLine of String(text || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*[:<,;]\s*<?([^\s<>,;]+)>?$/);
    if (!m) {
      unmatched.push(line);
      continue;
    }
    const email = normalizePlayerEmail(m[2]);
    if (!email) {
      invalid.push(line);
      continue;
    }
    const hit = byCanon.get(canon(m[1].trim(), A));
    if (!hit || seen.has(hit)) {
      unmatched.push(line);
      continue;
    }
    seen.add(hit);
    matched.push({ name: hit, email });
  }
  return { matched, unmatched, invalid };
}

/** db חדש עם כל האימיילים המפוענחים מהייבוא. */
export function applyEmailImport(db, matched) {
  let next = db;
  for (const { name, email } of matched || []) next = setPlayerEmail(next, name, email);
  return next;
}

/** חלוקת השחקנים המוכרים: עם אימייל (מוכנים לזימון) ובלי. */
export function inviteRecipientLists(db) {
  const withEmail = [];
  const withoutEmail = [];
  for (const name of knownPlayerNames(db)) {
    const email = playerEmail(db, name);
    if (email) withEmail.push({ name, email });
    else withoutEmail.push({ name });
  }
  return { withEmail, withoutEmail };
}

/** plan חדש עם סימון "זימון נשלח" לכל שם ברשימה. ממזג עם סימונים קיימים. */
export function markEmailInvites(plan, sent, at = Date.now()) {
  if (!plan || !Array.isArray(sent)) return plan;
  const invites = { ...(plan.emailInvites || {}) };
  for (const item of sent) {
    const name = typeof item === "string" ? item : item?.name;
    if (!name) continue;
    const email = typeof item === "string" ? undefined : item?.email;
    invites[name] = { at, ...(email ? { email } : {}) };
  }
  return { ...plan, emailInvites: invites };
}

export const EMAIL_RSVP_STATUSES = ["yes", "no"];

/**
 * plan חדש עם אישור הגעה מהאימייל לשחקן אחד.
 * null כשהתשובה או השם לא תקינים, כדי שהנתיב יוכל לדחות בלי לכתוב כלום.
 */
export function applyEmailRsvp(plan, name, status, at = Date.now()) {
  if (!plan?.iso) return null;
  const nm = String(name || "").trim();
  if (!nm || !EMAIL_RSVP_STATUSES.includes(status)) return null;
  const rsvps = { ...(plan.emailRsvps || {}) };
  rsvps[nm] = { status, at };
  return { ...plan, emailRsvps: rsvps };
}

/**
 * שורות סטטוס לכרטיס התוכנית: לכל שחקן מוכר — אימייל, נשלח זימון, תשובה.
 * @returns {Array<{ name, email: string|null, invited: boolean, answer: "yes"|"no"|null }>}
 */
export function emailRsvpStatus(db) {
  const plan = db?.plan || null;
  const invites = plan?.emailInvites || {};
  const rsvps = plan?.emailRsvps || {};
  return knownPlayerNames(db).map((name) => ({
    name,
    email: playerEmail(db, name),
    invited: Boolean(invites[name]),
    answer: rsvps[name]?.status === "yes" || rsvps[name]?.status === "no"
      ? rsvps[name].status
      : null,
  }));
}

/** שורת סיכום קצרה של פרטי הערב למייל (בלי תלות ברכיבי UI). */
export function planSummaryText(plan) {
  if (!plan?.iso) return "";
  const d = new Date(`${plan.iso}T12:00:00`);
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = `${d.getDate()} ב${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const parts = [`${weekday} · ${date}`];
  if (plan.time) parts.push(`בשעה ${plan.time}`);
  if (plan.location) parts.push(`📍 ${plan.location}`);
  if (plan.note) parts.push(plan.note);
  return parts.join("\n");
}
