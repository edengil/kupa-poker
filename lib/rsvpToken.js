/* טוקני אישור הגעה ללינקים באימייל — צד שרת בלבד (node:crypto).
   הטוקן חתום ב־HMAC כדי שאי אפשר יהיה לנחש או לזייף לינק של שחקן אחר.
   המפתח: RSVP_TOKEN_SECRET אם הוגדר, אחרת מפתח הסופאבייס הסודי של השרת
   (שניהם לא מגיעים לדפדפן). בלי אף אחד מהם — אין טוקנים ואין זימונים. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { envValue } from "./env.js";

function signingKey() {
  const key = envValue("RSVP_TOKEN_SECRET") || envValue("SUPABASE_SECRET_KEY");
  return key ? `kupa-rsvp-v1:${key}` : "";
}

export function rsvpTokensConfigured() {
  return Boolean(signingKey());
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadPart, key) {
  return b64url(createHmac("sha256", key).update(payloadPart).digest());
}

/**
 * טוקן חתום לשחקן וערב ספציפיים. פג ב־exp (מילישניות מאז epoch).
 * @returns {string|null} null כשאין מפתח חתימה מוגדר.
 */
export function signRsvpToken({ groupId, name, planIso, exp }) {
  const key = signingKey();
  if (!key || !groupId || !name || !planIso) return null;
  const payload = { g: groupId, n: name, p: planIso, exp: Number(exp) || 0 };
  const part = b64url(JSON.stringify(payload));
  return `${part}.${sign(part, key)}`;
}

/**
 * אימות טוקן. מחזיר את התוכן כשהחתימה תקינה וטרם פגה, אחרת null.
 * now ניתן להזרקה לטסטים.
 */
export function verifyRsvpToken(token, now = Date.now()) {
  const key = signingKey();
  if (!key || typeof token !== "string") return null;
  const [part, sig] = token.split(".");
  if (!part || !sig) return null;
  const expected = sign(part, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(part).toString("utf8"));
    if (!payload?.g || !payload?.n || !payload?.p) return null;
    if (Number(payload.exp) && now > Number(payload.exp)) return null;
    return { groupId: payload.g, name: payload.n, planIso: payload.p, exp: Number(payload.exp) || 0 };
  } catch {
    return null;
  }
}

/** תפוגה ללינקי הזמנה: סוף היום של הערב + יומיים חסד בשעון ישראל. */
export function rsvpTokenExpiry(planIso) {
  const t = Date.parse(`${planIso}T23:59:59+03:00`);
  if (!Number.isFinite(t)) return Date.now() + 3 * 24 * 60 * 60 * 1000;
  return t + 2 * 24 * 60 * 60 * 1000;
}
