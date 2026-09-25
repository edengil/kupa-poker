/* מתי לבקש אישור להתראות מחוץ לאפליקציה.
   מי שעוד לא נשאל רואה את «אפשר התראות» כבר בפתיחה הזו.
   בספארי רגיל באייפון הכפתור נשאר, כי חלון הטלפון נפתח רק מהאייקון.
   אחרי אישור או סירוב לא שואלים שוב. */

export const PUSH_PROMPT_KEY = "kupa:push-prompt";

function blank() {
  return { visits: 0, asked: false, installHint: false, choice: null, lastVisitId: null };
}

/**
 * @param {object | null} prev
 * @param {{ permission?: string, support?: string, visitId: string }} opts
 * permission: default | granted | denied
 * support: supported | needs-install | unsupported
 */
export function nextPushPrompt(prev, { permission = "default", support = "supported", visitId }) {
  const state = { ...blank(), ...(prev || {}) };
  const sameVisit = Boolean(visitId) && state.lastVisitId === visitId;
  const visits = sameVisit ? state.visits || 0 : (state.visits || 0) + 1;
  const base = { ...state, visits, lastVisitId: visitId || state.lastVisitId };

  if (permission === "denied" || state.choice === "denied" || state.choice === "later") {
    return { ...base, asked: true, choice: state.choice === "later" ? "later" : "denied", show: false, mode: null };
  }
  if (permission === "granted" || state.choice === "granted") {
    return { ...base, asked: true, choice: "granted", show: false, mode: null };
  }
  if (support === "unsupported") {
    return { ...base, show: false, mode: null };
  }
  if (support === "needs-install") {
    return { ...base, show: true, mode: "install" };
  }
  if (state.asked) return { ...base, show: false, mode: null };
  return { ...base, asked: true, show: true, mode: "allow" };
}
