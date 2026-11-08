/* ============================================================================
   getSession עם מבוי־זמן — מקור־אמת אחד לשני משטחי הכניסה (OwnerApp ו־
   PublicApp, פריט 1.5).

   בספארי/PWA קריאת getSession נתקעת לפעמים עד שנוגעים במסך. אחרי
   SESSION_TIMEOUT_MS מוותרים על ההמתנה — אבל timeout הוא לא "אין סשן":
   התוצאה מסומנת ב־timedOut, והקורא נשאר במצב המתנה; הסשן האמיתי מגיע
   דרך onAuthStateChange. (הגרסה המוקדמת, ניסוי D, החזירה סשן־null מזויף —
   והיפוך הפאזה ל־signedOut הריץ את כל אפקט ה־boot מחדש כשהסשן האמיתי
   נחת, מגבר remount־ים בפתיחה.)
   ============================================================================ */

export const SESSION_TIMEOUT_MS = 4000;

export function getSessionWithTimeout(supabase, timeoutMs = SESSION_TIMEOUT_MS) {
  return Promise.race([
    supabase.auth
      .getSession()
      .then(({ data }) => ({ data, timedOut: false }))
      .catch(() => ({ data: { session: null }, timedOut: false })),
    new Promise((resolve) =>
      setTimeout(() => resolve({ data: { session: null }, timedOut: true }), timeoutMs)
    ),
  ]);
}
