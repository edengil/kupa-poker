import { withBotMark } from "./botMark";
import { tipSummaryForSession } from "./nightShare";
import { netOf, CPS } from "./report";

/** כתובת האפליקציה לערב / חלוקה. עם sessionId — לינק לערב עצמו. */
export function settlementAppUrl({ siteUrl, slug, sessionId } = {}) {
  const base = String(siteUrl || "").replace(/\/$/, "");
  if (!base || !slug) return null;
  const group = `${base}/g/${encodeURIComponent(slug)}`;
  if (!sessionId) return group;
  return `${group}/n/${encodeURIComponent(sessionId)}`;
}

/**
 * הודעת סיום לקבוצה — בלי פירוט מי מעביר למי.
 * דוחפת כניסה לאפליקציה לסימון תשלומים.
 */
export function buildSettlementInviteText({
  pot,
  dateLabel,
  tipText,
  siteUrl,
  slug,
  sessionId,
  headline = "חשבון סופי",
} = {}) {
  const url = settlementAppUrl({ siteUrl, slug, sessionId });
  const lines = [
    dateLabel ? `${headline} · ערב ${dateLabel}` : headline,
    pot != null && pot !== "" ? `קופה ${pot}₪` : null,
    "",
  ];
  if (tipText) {
    lines.push(tipText, "");
  }
  lines.push(
    "📱 החלוקה אושרה — מי מעביר למי + סימון «שולם»:",
    url || "(לינק לא מוגדר)",
    "",
    "כולם רואים שם מי כבר העביר ומי עדיין ממתין."
  );
  return withBotMark(lines.filter((x) => x != null).join("\n"));
}

/** מזמין סיום ממצב לייב (שחקנים + טיפים). */
export function buildLiveClosingInvite(state, cps = CPS, { siteUrl, slug, sessionId, headline } = {}) {
  const pot = Math.round(
    (state?.players || []).reduce((t, p) => t + (+p.buyin || 0), 0) * 100
  ) / 100;
  const withNet = (state?.players || []).map((p) => ({ p, net: netOf(p, cps) }));
  const tipText = tipSummaryForSession(state, withNet) || "";
  return buildSettlementInviteText({
    pot,
    tipText: tipText || undefined,
    siteUrl,
    slug,
    sessionId,
    headline,
  });
}

/** כתובת הזמנה מהדפדפן (מנהל). */
export function resolveBrowserInviteUrl(explicitSlug, sessionId) {
  if (typeof window === "undefined") return null;
  const base = (
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) ||
    window.location.origin ||
    ""
  ).replace(/\/$/, "");
  let slug = explicitSlug || "";
  if (!slug) {
    const m = String(window.location.pathname || "").match(/\/g\/([^/]+)/);
    if (m) slug = decodeURIComponent(m[1]);
  }
  if (!slug) {
    try {
      const row = JSON.parse(localStorage.getItem("poker:cache:group") || "null");
      if (row?.slug) slug = row.slug;
    } catch {}
  }
  return settlementAppUrl({ siteUrl: base, slug, sessionId });
}
