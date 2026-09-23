import { planShareLocationLines } from "../components/poker/hosts.js";

/** תווית תאריך/שעה להזמנה — אותו פורמט כמו במסך. */
export function planInviteLabel(plan) {
  if (!plan?.iso) return "";
  const d = new Date(plan.iso + "T12:00:00");
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${weekday} · ${date}${plan.time ? ` · ${plan.time}` : ""}`;
}

/**
 * טקסט הזמנת ערב לקבוצת הוואטסאפ (או לשיתוף ידני כש־Whapi מלא).
 */
export function buildPlanInviteText(plan, { isUpdate = false, baseUrl, slug } = {}) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const head = isUpdate ? "עדכון לערב הפוקר! ♠" : "ערב פוקר מתוכנן! ♠";
  const location = plan?.location || "";
  const note = plan?.note || "";
  const lines = [
    `🤖 ${head}`,
    planInviteLabel(plan),
    ...planShareLocationLines(location),
    ...(note ? [`📝 הערות: ${note}`] : []),
    "",
    "מגיעים? מאשרים הגעה כאן:",
    slug ? `${base}/g/${slug}` : base || "",
  ];
  return lines.filter((line, i) => !(line === "" && i === lines.length - 1)).join("\n").trim();
}
