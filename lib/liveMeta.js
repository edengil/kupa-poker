/* מטא־הלייב שהבוט כותב והאפליקציה רק שומרת: יומן הביטולים (applied),
   מצב הסגירה המודרכת, הממתינים והמאושרים, שקית מחמאות הטיפים — וחותמות
   התזכורות של הבוט (pendingRemindedAt / bitIdleRemindedAt).

   האפליקציה לא בעלים של השדות האלה, אבל כל כתיבת לייב ממנה חייבת לשאת
   אותם הלאה: שמירת מסך שבונה את הלייב מרשימת שדות סגורה משלה מוחקת
   אותם מהמסד — חותמת תזכורת שנמחקה פירושה שהבוט מנדנד שוב על אותו
   ממתין/שקט (ממצא 5), ו־applied שנמחק שובר את ביטולי הבוט.

   זה הצד של האפליקציה ל"בעלים אחד לצורת הלייב": בצד הבוט, blank()
   ב־lib/wa/state.ts מתחיל מהאובייקט השמור ומנרמל רק שדות מוכרים. */

export function pickLiveMeta(d) {
  if (!d || typeof d !== "object") return {};
  return {
    applied: d.applied,
    pending: d.pending,
    closing: d.closing,
    pendingApprovals: d.pendingApprovals,
    approvedNames: d.approvedNames,
    tipComplimentBag: d.tipComplimentBag,
    tipComplimentLast: d.tipComplimentLast,
    // שומרים ts קיים — לא לכתוב Date.now() בכל שמירה (גורם להבדל מול השרת)
    ...(d.ts != null ? { ts: d.ts } : {}),
    // חותמות התזכורות של הבוט — רק אם קיימות, לא ממציאים
    ...(d.pendingRemindedAt != null ? { pendingRemindedAt: d.pendingRemindedAt } : {}),
    ...(d.bitIdleRemindedAt != null ? { bitIdleRemindedAt: d.bitIdleRemindedAt } : {}),
  };
}
