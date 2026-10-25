import { paymentPlan } from "./paymentTracking";
import { savedSettlement } from "./savedSettlement";
import {
  settlementPlayersFor,
  isLegacySettlement,
  edenNameIn,
  potPlanFor,
  POT_SINK_NAME,
  sessionHasBuyinChips,
} from "./nightShare";

/**
 * נוסח האזהרה בראש עורך חלוקה שמור.
 * העורך נפתח גם כשיש סימוני תשלום — האזהרה רק מסבירה מה יישמר ומה יאופס.
 */
export function settlementEditNotice(session) {
  if (!session) {
    return {
      show: false,
      markedCount: 0,
      manualPaymentCount: 0,
      droppedManualPayments: false,
      lines: [],
      text: "",
    };
  }

  // חובה באותם שחקנים כמו saveManualPayments/paymentPlan (גולמיים, או
  // הישנים כשה־basis ישן), אחרת ה-basis לא תואם ומתקבלת התרעת־שווא.
  const players = settlementPlayersFor(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || 2 : 1;
  const potOpts = isLegacySettlement(session)
    ? {}
    : {
        potAmount: potPlanFor(session),
        potSinkName: POT_SINK_NAME,
        edenName: edenNameIn(session),
      };
  const saved = savedSettlement(players, cps, session.manualSettlement, potOpts);
  const plan = paymentPlan(session);
  const markedCount = plan.transfers.filter(
    (transfer, index) => !transfer.manual && (plan.paid[index] || plan.received[index])
  ).length;
  const manualPayments = Array.isArray(session.manualSettlement?.manualPayments)
    ? session.manualSettlement.manualPayments
    : [];
  const droppedManualPayments = Boolean(
    session.manualSettlement && manualPayments.length > 0 && session.manualSettlement.basis !== saved.basis
  );

  const lines = [];
  if (markedCount > 0) {
    lines.push(
      `יש ${markedCount} העברות שכבר סומנו כשולמו או התקבלו. אפשר לערוך את החלוקה: סימון יישמר רק אם אותה העברה נשארת בדיוק בין אותם שחקנים ובאותו סכום; סימון של העברה שהשתנתה או הוסרה יאופס.`
    );
  }
  if (manualPayments.length > 0) {
    lines.push(
      "יש העברות ידניות בחלוקה. שינוי העדפת הזוכים או בסיס החישוב עלול לאפס אותן — בדקו את החלוקה לפני השמירה ושליחת עדכון לקבוצה."
    );
  }
  if (droppedManualPayments) {
    lines.push(
      "נתוני הערב השתנו מאז החלוקה השמורה, ולכן ההעברות הידניות הקודמות כבר אינן תואמות ולא יישמרו בשמירה הבאה."
    );
  }

  return {
    show: lines.length > 0,
    markedCount,
    manualPaymentCount: manualPayments.length,
    droppedManualPayments,
    lines,
    text: lines.join("\n"),
  };
}
