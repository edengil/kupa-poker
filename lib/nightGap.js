/* ============================================================================
   פער הערב של ערב שמור — מוצו מ־lib/nightShare.js (גל B, מנה 5.4,
   מיצוי־בלבד, אפס שינוי התנהגות). nightGap הוא מושג נפרד מהקופה מאז
   25.10 (computedPot כבר אינו הוא — ראו lib/potReaders.js), והפרדתו
   למודול משלו מונעת את הבלבול ההיסטורי בין השניים. nightShare מייצא
   אותו הלאה (re-export), כך שאף יבואן לא השתנה.
   כל התלויות מגיעות מהמודולים שכבר פוצלו (nightPlayers, potReaders)
   ומהמנועים המשותפים (report, settlement, poker/helpers) — אין כאן שום
   ייבוא מ־nightShare ואין ייבוא מעגלי.
   ============================================================================ */

import { CPS } from "./report";
import { roundedNets } from "./settlement";
import { r2 } from "./poker/helpers.js";
import { sessionHasBuyinChips } from "./potReaders";
import { playersFromSession } from "./nightPlayers";

/**
 * פער הערב החתום (בשקלים) — ההגדרה הקנונית של עדן (11.11), כמו
 * checkNightBalance ב־lib/poker/nightBalance.js: הפער הוא יציאות + טיפים
 * מול הג'יטונים שהונפקו. ג'יטוני הטיפ חוזרים לספירה כי טיפ הוא רישום
 * בלבד והג'יטונים עברו בין השחקנים בשולחן; רק מה שחסר מתחת לטיפים הוא
 * חוסר אמיתי (שלילי = חוסר, חיובי = עודף מזומן בקופה).
 * לערב בלי נתוני ג'יטונים (רשומות סכום־בלבד) אין תיקון טיפים — סכום
 * הנטו כמות שהוא, כמו תמיד.
 */
export function nightGap(session) {
  const players = playersFromSession(session);
  if (!players.length) return 0;
  const hasChips = sessionHasBuyinChips(session);
  const cps = hasChips ? session.cps || CPS : 1;
  const netSum = roundedNets(players, cps).reduce((s, r) => s + r.net, 0);
  if (!hasChips) return netSum;
  const tipsChips = (session?.entries || []).reduce(
    (s, e) => s + (+e.tipsGiven || 0),
    0
  );
  return r2(netSum + tipsChips / cps);
}
