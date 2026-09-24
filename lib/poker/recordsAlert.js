/** לוגיקה טהורה להתראת שיא באפליקציה (בלי UI). */
export function normalizeRecordAlertLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const cleaned = lines.filter((l) => typeof l === "string" && l.trim());
  return cleaned.length ? cleaned : null;
}
