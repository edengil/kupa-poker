/* מטא־הלייב שהבוט כותב והאפליקציה רק שומרת: יומן הביטולים (applied),
   מצב הסגירה המודרכת, הממתינים והמאושרים, שקית מחמאות הטיפים — וחותמות
   התזכורות של הבוט (pendingRemindedAt / bitIdleRemindedAt) וחברותיהן
   חותמות־הניסיון מגל 3ב (pendingRemindAttemptAt / bitIdleRemindAttemptAt).

   האפליקציה לא בעלים של השדות האלה, אבל כל כתיבת לייב ממנה חייבת לשאת
   אותם הלאה: שמירת מסך שבונה את הלייב מרשימת שדות סגורה משלה מוחקת
   אותם מהמסד — חותמת תזכורת שנמחקה פירושה שהבוט מנדנד שוב על אותו
   ממתין/שקט (ממצא 5), ו־applied שנמחק שובר את ביטולי הבוט.

   זה הצד של האפליקציה ל"בעלים אחד לצורת הלייב": בצד הבוט, blank()
   ב־lib/wa/state.ts מתחיל מהאובייקט השמור ומנרמל רק שדות מוכרים.

   עוד באותו חוזה: savingsPot של הלייב (הבוט מתחזק אותו כאינווריאנט
   savingsPot == Σ ה־pot של אירועי הקנייה) ושקיות המחמאות המגדריות
   (tipComplimentBagM/LastM/BagF/LastF, שנכתבות דרך המפתחות המחושבים
   ב־lib/tipCompliments.js ומחליפות בפועל את הזוג הלא־מגדרי הישן). */

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
    // שקיות המחמאות המגדריות (ביקורת O2): הבוט כותב אותן על הלייב דרך
    // המפתחות המחושבים ב־tipCompliments.js; בלי נשיאה כאן כל שמירת
    // אפליקציה מחקה אותן והמחמאות התחילו שקית חדשה מאפס.
    tipComplimentBagM: d.tipComplimentBagM,
    tipComplimentLastM: d.tipComplimentLastM,
    tipComplimentBagF: d.tipComplimentBagF,
    tipComplimentLastF: d.tipComplimentLastF,
    // קופת הלייב המצטברת של הבוט (ביקורת O2) — נישאת כמו שהיא, רק אם
    // קיימת: האפליקציה לא מחשבת אותה, והמצאת 0 הייתה דורסת צבירה חיה.
    ...(d.savingsPot != null ? { savingsPot: d.savingsPot } : {}),
    // שומרים ts קיים — לא לכתוב Date.now() בכל שמירה (גורם להבדל מול השרת)
    ...(d.ts != null ? { ts: d.ts } : {}),
    // חותמות התזכורות של הבוט — רק אם קיימות, לא ממציאים
    ...(d.pendingRemindedAt != null ? { pendingRemindedAt: d.pendingRemindedAt } : {}),
    ...(d.bitIdleRemindedAt != null ? { bitIdleRemindedAt: d.bitIdleRemindedAt } : {}),
    // חותמות ניסיון־השליחה של הבוט (גל 3ב) — אותו חוזה בדיוק: שמירת
    // אפליקציה שמוחקת אותן הייתה גורמת לבוט לנסות תזכורת שוב על ערוץ
    // פג, כי מבחינתו הניסיון מעולם לא קרה.
    ...(d.pendingRemindAttemptAt != null ? { pendingRemindAttemptAt: d.pendingRemindAttemptAt } : {}),
    ...(d.bitIdleRemindAttemptAt != null ? { bitIdleRemindAttemptAt: d.bitIdleRemindAttemptAt } : {}),
    // חותמות רגל ה־DM של התזכורות (גל 5, פריט 5.6) — אותו חוזה נשיאה:
    // שמירת אפליקציה שמוחקת אותן הייתה שולחת לבעלים DM כפול אחרי
    // הצלחה חלקית, כי מבחינת הבוט הרגל מעולם לא עברה.
    ...(d.pendingDmRemindedAt != null ? { pendingDmRemindedAt: d.pendingDmRemindedAt } : {}),
    ...(d.bitIdleDmRemindedAt != null ? { bitIdleDmRemindedAt: d.bitIdleDmRemindedAt } : {}),
    ...(d.pendingDmRemindAttemptAt != null ? { pendingDmRemindAttemptAt: d.pendingDmRemindAttemptAt } : {}),
    ...(d.bitIdleDmRemindAttemptAt != null ? { bitIdleDmRemindAttemptAt: d.bitIdleDmRemindAttemptAt } : {}),
  };
}
