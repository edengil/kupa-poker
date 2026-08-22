/* זהות צופה + לאן לחזור אחרי התקנה למסך הבית.
   נשמר ב-localStorage של אותו מקור — גם כש-getSession בספארי/PWA נתקע. */

export const LAST_VIEW_KEY = "poker:last-view";

export const viewerAuthKey = (slug) => `poker:viewer-auth:${slug}`;

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return !!(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

export function readLastView() {
  try {
    return localStorage.getItem(LAST_VIEW_KEY) || "";
  } catch {
    return "";
  }
}

export function writeLastView(slug) {
  if (!slug) return;
  try {
    localStorage.setItem(LAST_VIEW_KEY, slug);
  } catch {}
}

/** אם עוד לא שמרנו last-view — מסיקים ממטמון הצפייה הציבורית. */
export function inferLastView() {
  const explicit = readLastView();
  if (explicit) return explicit;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && /^poker:cache:pub:(.+)$/.exec(k);
      if (m) return m[1];
    }
  } catch {}
  return "";
}

export function readViewerAuth(slug) {
  if (!slug) return null;
  try {
    const raw = localStorage.getItem(viewerAuthKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeViewerAuth(slug, auth) {
  if (!slug) return;
  try {
    if (!auth) localStorage.removeItem(viewerAuthKey(slug));
    else localStorage.setItem(viewerAuthKey(slug), JSON.stringify(auth));
  } catch {}
}

export function viewerAuthFromUser(user) {
  if (!user) return null;
  return {
    name: user.user_metadata?.name || null,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    email: user.email || null,
  };
}

/**
 * צופה (לינק /g) שפתח את `/` — לא לפתוח לו אפליקציית מנהל ריקה.
 * בעלים של אותה קבוצה (slug זהה ל-last-view) נשאר ב-`/`.
 */
export function shouldOpenAsViewer(lastView, ownedSlug) {
  if (!lastView) return false;
  return ownedSlug !== lastView;
}
