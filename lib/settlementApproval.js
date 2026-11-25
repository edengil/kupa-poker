/* ============================================================================
   שער אישור החלוקה (כלל ברזל 3, הכרעת עדן 25.11.2026) — שני אישורים
   נפרדים לכל ערב, מנהל בלבד, נקבעים בכפתורים בדף הערבים:
   1. settlementApprovedAt — אישור צפייה: עד שהוא נקבע, שחקנים/צופים לא
      רואים את חלוקת הערב בכלל (לא באפליקציה, לא בטקסט/קישור וואטסאפ).
   2. settlementAmountsApprovedAt — אישור סכומים נפרד: עד שהוא נקבע,
      שחקנים לא רואים סכומי העברות (גם בהתראות שלהם).
   המנהל רואה תמיד הכול. ערבים בלי שדה האישור = לא מאושרים.
   ========================================================================== */

/** האם המנהל אישר צפייה בחלוקת הערב לשחקנים. */
export function isSettlementApproved(session) {
  return Boolean(session?.settlementApprovedAt);
}

/** האם המנהל אישר הצגת סכומים לשחקנים (דורש גם אישור צפייה). */
export function isAmountsApproved(session) {
  return Boolean(session?.settlementApprovedAt && session?.settlementAmountsApprovedAt);
}

/** קביעת/ביטול אישור — מחזיר session חדש (שדה נמחק בביטול). */
export function withSettlementApproval(session, field, approved, now = new Date()) {
  if (field !== "settlementApprovedAt" && field !== "settlementAmountsApprovedAt") {
    return session;
  }
  const next = { ...session };
  if (approved) next[field] = now.toISOString();
  else delete next[field];
  /* ביטול אישור הצפייה מבטל ממילא את תוקף אישור הסכומים. */
  if (field === "settlementApprovedAt" && !approved) delete next.settlementAmountsApprovedAt;
  return next;
}
