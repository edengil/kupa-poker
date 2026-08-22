import { C } from "./colors";

/* ============================================================================
   מילון קטן לסגנון החגיגי — אותו מראה כמו כרטיס ה-RSVP:
   גרדיאנט לבד, מסגרת פליז, CTA חם, כותרות סעיף.
   בלי אנימציות כבדות — מתאים גם ללייב.
   ============================================================================ */

/** כרטיס חגיגי מלא (הזמנה / תכנון ערב). */
export const festiveCard = {
  position: "relative",
  overflow: "hidden",
  background: `linear-gradient(165deg, ${C.cardHi} 0%, ${C.card} 55%, ${C.feltDeep} 100%)`,
  border: `1px solid ${C.brass}88`,
  borderRadius: 16,
  boxShadow: `0 0 0 1px ${C.brass}22, 0 10px 28px ${C.feltDeep}66`,
};

/** כרטיס רך יותר — באנר, שיאים, שיתוף. */
export const festiveCardSoft = {
  background: `linear-gradient(165deg, ${C.cardHi} 0%, ${C.card} 65%, ${C.felt} 100%)`,
  border: `1px solid ${C.brass}55`,
  borderRadius: 14,
  boxShadow: `0 4px 18px ${C.feltDeep}40`,
};

/** זוהר פליז עדין ברקע (סטטי — בלי אנימציה). */
export const festiveGlow = {
  position: "absolute",
  inset: 0,
  background: `radial-gradient(ellipse at 85% 0%, ${C.brass}22 0%, transparent 55%)`,
  pointerEvents: "none",
};

/** כפתור CTA ראשי בפליז. */
export const brassCta = {
  background: `linear-gradient(180deg, ${C.brass} 0%, #c4922e 100%)`,
  color: C.feltDeep,
  border: "none",
  boxShadow: `0 5px 16px ${C.brass}36`,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

/** כפתור CTA משני / מושבת. */
export const brassCtaMuted = {
  background: C.card,
  color: C.dim,
  border: `1px solid ${C.line}`,
  boxShadow: "none",
  fontWeight: 700,
  cursor: "not-allowed",
  fontFamily: "inherit",
};

/** שורת כותרת קטנה עם ♠. */
export const sectionEyebrow = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: C.brass,
};

/** כותרת מקטע בטאבים (שיאים / לייב). */
export function sectionTitle(extra = {}) {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    color: C.brass,
    margin: "2px 2px 0",
    ...extra,
  };
}

/** רקע מסך התחברות / ספלאש — לבד עם זוהר פליז עדין. */
export const authShell = {
  minHeight: "100vh",
  background: `radial-gradient(ellipse at 50% 18%, ${C.brass}18 0%, transparent 42%), ${C.feltDeep}`,
  color: C.cream,
  display: "grid",
  placeItems: "center",
  padding: 24,
  textAlign: "center",
};
