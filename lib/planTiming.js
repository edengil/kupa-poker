import { jerusalemYmd } from "./paymentReminder";

/**
 * הזמנה פגה רק אם התאריך כבר עבר (שעון ישראל).
 * ערב שמור באותו יום לא מבטל הזמנה — אפשר לפתוח ולשלוח שוב להיום.
 */
export function isPlanStale(plan, todayYmd = jerusalemYmd()) {
  if (!plan?.iso) return false;
  return String(plan.iso) < String(todayYmd);
}

export { jerusalemYmd as planTodayIso };
