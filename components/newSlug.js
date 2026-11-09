/** מזהה קצר, קריא ולא ניתן לניחוש, שמופיע בלינק לשיתוף.
   חולץ מ־OwnerApp (גל 8, 8.2) — בשימוש גם רצועת השיתוף (סיבוב לינק)
   וגם זרימת ה־boot (יצירת קבוצה חדשה דרך resolveRootLanding). */
export function newSlug() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}
