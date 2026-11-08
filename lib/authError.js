/* ============================================================================
   כשל התחברות בכתובת (‎?error=auth) — פריט 1.5.

   נתיב /auth/callback מחזיר לכאן כשהחלפת הקוד בסשן נכשלת: המשתמש נוחת
   על מסך ההתחברות עם ‎?error=auth בכתובת. עד התיקון אף אחד לא קרא את
   הפרמטר, והכשל היה שקט — המשתמש ראה שוב את אותו מסך בלי הסבר. שני
   משטחי ההתחברות (OwnerApp ו־PublicApp) קוראים אותו ומציגים את ההודעה.
   ============================================================================ */

export const AUTH_ERROR_MESSAGE = "ההתחברות נכשלה — נסו שוב.";

/** האם ב־search יש סימון כשל התחברות (‎?error=auth). מקבל מחרוזת search
    ("?error=auth") או URLSearchParams. */
export function hasAuthError(search) {
  if (!search) return false;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("error") === "auth";
}
