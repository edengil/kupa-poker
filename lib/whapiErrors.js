/* מיפוי שגיאות שליחה מ־Whapi להודעות בעברית + קוד ל־UI. */

export function classifyWhapiSendFailure(raw) {
  const text = String(raw || "");
  if (/\(401\)/.test(text)) {
    return {
      code: "whapi_auth",
      hint: "טוקן הוואטסאפ לא תקף — צריך לחדש ב־Whapi",
    };
  }
  if (/\(402\)/.test(text) || /trial version limit/i.test(text)) {
    return {
      code: "whapi_quota",
      hint:
        "נגמרה מכסת הניסיון ב־Whapi (Trial). אפשר לשתף את ההזמנה מהמכשיר לקבוצה, או לחכות לאיפוס המכסה / שדרוג ל־Live",
    };
  }
  if (/\(403\)/.test(text)) {
    return { code: "whapi_forbidden", hint: "אין הרשאה לשלוח לקבוצה בוואטסאפ" };
  }
  if (/\(404\)/.test(text)) {
    return { code: "whapi_not_found", hint: "מזהה הקבוצה בוואטסאפ לא נמצא" };
  }
  if (/\(429\)/.test(text)) {
    return { code: "whapi_rate", hint: "יותר מדי שליחות — נסה שוב בעוד דקה" };
  }
  return { code: "whapi_send", hint: "השליחה לקבוצה נכשלה" };
}
