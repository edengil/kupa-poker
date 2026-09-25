import { withBotMark } from "./botMark";
import { paymentPlan } from "./paymentTracking";
import { settlementAppUrl } from "./settlementInvite";

/** כל העברה נסגרה מצד אחד לפחות. אין מה להכריז אם אין העברות. */
export function allTransfersPaid(session) {
  const { transfers, paid, received } = paymentPlan(session);
  if (!transfers.length) return false;
  return transfers.every((_, i) => !!paid[i] || !!received[i]);
}

/** הודעה לקבוצה כשהחלוקה נסגרה. */
export function buildSettlementClosedText(session, { siteUrl, slug } = {}) {
  const dateLabel =
    session?.d != null && session?.mo != null
      ? `${session.d}.${session.mo}`
      : String(session?.iso || "");
  const url = settlementAppUrl({ siteUrl, slug, sessionId: session?.id });
  return withBotMark(
    [
      dateLabel ? `החלוקה סגורה — ערב ${dateLabel}` : "החלוקה סגורה",
      "",
      "כולם סימנו שהעבירו.",
      url || null,
    ]
      .filter((line) => line != null)
      .join("\n")
  );
}
