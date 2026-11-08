/* ============================================================================
   סניטציית אבחון (גל 3, פריט 3.4 — F10).

   עד הגל, כל שורת לקוח ב־diag_events נשאה את ה־URL המלא — כולל ה־slug
   של הקבוצה (/g/<slug>, שהוא מפתח הגישה לצפייה) — והשורה גם שוכפלה
   ללוגי Vercel דרך console.error("DIAG::…"). ומשפך ה־console לא עבר
   שום סניטציה מעבר לחיתוך אורך.

   הכללים מעכשיו:
   1. ‏stripGroupSlugFromUrl — הנתיב /g/<slug> מוחלף ב־/g/…; שאילתה
      ושבר (query/hash) נושרים לגמרי (טוקנים אוהבים להתחבא שם).
   2. ‏sanitizeDiagText — תבניות טוקן ידועות מוסרות מהטקסט החופשי
      (Bearer, מפתחות sb_secret_/sb_publishable_, JWT, ‏apikey=) ואז
      חיתוך אורך. מוחל על message/stack/detail/componentStack בסניטייזר
      של הנתיב, כך שגם העותק ל־diag_events וגם השכפול ללוגים נקיים.
   ============================================================================ */

const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /sb_(?:secret|publishable)_[A-Za-z0-9._-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /((?:api[_-]?key|apikey|access[_-]?token|token|secret)\s*[:=]\s*)[^\s"']+/gi,
];

export function sanitizeDiagText(text, max = 1000) {
  let s = String(text ?? "");
  for (const re of TOKEN_PATTERNS) {
    s = s.replace(re, (m, prefix) =>
      typeof prefix === "string" && prefix ? `${prefix}[נמחק]` : "[נמחק]"
    );
  }
  return s.slice(0, max);
}

/** מסיר את ה־slug מנתיב קבוצה ומוריד query/hash. קלט לא־URL עובר regex. */
export function stripGroupSlugFromUrl(rawUrl) {
  const s = String(rawUrl ?? "");
  if (!s) return "";
  try {
    const u = new URL(s);
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/g\/[^/]+/g, "/g/…");
    return u.toString();
  } catch {
    return s
      .replace(/\/g\/[^/?#\s]+/g, "/g/…")
      .split(/[?#]/)[0];
  }
}
