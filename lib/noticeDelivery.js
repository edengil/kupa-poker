/* האם ההתראות מוצגות בתוך המסך — החלטה טהורה לפי יכולת, לא לפי תפקיד.
   מי שיכול לקבל פוש מחוץ לאפליקציה לא צריך את חלונות הכניסה;
   מי שלא — מקבל אותם בתוך המסך כדי שלא יפספס.

   שלושת התנאים לפוש אמיתי:
   - installed: האפליקציה פתוחה ממסך הבית (standalone)
   - permission: "granted"
   - hasSubscription: יש מנוי פוש פעיל בדפדפן

   ההחלטה משאירה את מצב הקריאה כמות שהוא — רק הצגת הפופאפים בכניסה משתנה. */

/**
 * @param {{ installed?: boolean, permission?: string, hasSubscription?: boolean }} state
 * @returns {{ canPush: boolean, suppressEntryPopups: boolean, showInScreen: boolean }}
 */
export function noticeDeliveryDecision({ installed = false, permission = "default", hasSubscription = false } = {}) {
  const canPush = Boolean(installed) && permission === "granted" && Boolean(hasSubscription);
  return {
    canPush,
    suppressEntryPopups: canPush,
    showInScreen: !canPush,
  };
}
