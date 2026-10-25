/* בדיקות קצה ללוגיקת החלוקה והקופה (עודכן למודל 25.10.2026):
   - העודף (כסף תלוי באוויר) נרשם במפורש בכיור "עודף ערב" — לא מנותב דרך עדן
   - הוולידטור תופס כל חריגה: זוכה חייב לקבל מלא, חייב חייב לשלם מלא */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  saveManualPayments,
} from "../lib/paymentTracking.js";
import { computedPot, nightGap } from "../lib/nightShare.js";

function sums(transfers) {
  const got = Object.create(null);
  const gave = Object.create(null);
  for (const t of transfers) {
    if (t.fromSplit && typeof t.fromSplit === "object") {
      for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    } else {
      gave[t.from] = (gave[t.from] || 0) + t.amount;
    }
    got[t.to] = (got[t.to] || 0) + t.amount;
  }
  return { got, gave };
}

function allWhole(transfers) {
  return transfers.every((t) => Number.isInteger(t.amount) && t.amount > 0);
}

describe("1. עדן מרוויח + יש עודף — הזכייה גולמית, העודף לכיור", () => {
  const night = {
    id: "edge-eden-wins",
  iso: "2026-10-10",
    entries: [
      { name: "עדן גיל", amount: 100 },
      { name: "אבי כהן", amount: -60 },
      { name: "משה לוי", amount: -70 },
    ],
  };
  it("העודף (30₪) הולך לכיור העודף — זכיית עדן נשארת 100", () => {
    expect(computedPot(night)).toBe(0); // אין קופה רשומה בפיקסטורה
    expect(nightGap(night)).toBe(-30);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    const { got, gave } = sums(transfers);
    expect(got["עדן גיל"]).toBe(100); // הגולמי בלבד (מודל 25.10)
    expect(got["עודף ערב"]).toBe(30);
    expect(gave["אבי כהן"]).toBe(60);
    expect(gave["משה לוי"]).toBe(70);
    expect(allWhole(transfers)).toBe(true);
  });
});

describe("2. עדן לא משתתף + יש עודף — העודף לכיור והוולידטור שקט", () => {
  const night = {
    id: "edge-no-eden",
  iso: "2026-10-10",
    entries: [
      { name: "אבי כהן", amount: 150 },
      { name: "משה לוי", amount: -100 },
      { name: "דוד פרץ", amount: -80 },
    ],
  };
  it("כל חייב משלם מלא והעודף רשום במפורש — אין תשלום חסר סמוי", () => {
    expect(computedPot(night)).toBe(0);
    expect(nightGap(night)).toBe(-30);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    expect(allWhole(transfers)).toBe(true);
    const { got, gave } = sums(transfers);
    expect(got["אבי כהן"]).toBe(150);
    expect(got["עודף ערב"]).toBe(30);
    expect(gave["משה לוי"]).toBe(100);
    expect(gave["דוד פרץ"]).toBe(80);
  });
});

describe("3. ערב מאוזן בדיוק — אין שינוי בהתנהגות", () => {
  const night = {
    id: "edge-balanced",
    entries: [
      { name: "עדן גיל", amount: -100 },
      { name: "דן ינקלויץ", amount: 60 },
      { name: "אבי כהן", amount: 40 },
    ],
  };
  it("עודף 0 — עדן משלם את מלוא חובו", () => {
    expect(computedPot(night)).toBe(0);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    const { got, gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(100); // לא פחות
    expect(got["דן ינקלויץ"]).toBe(60);
    expect(got["אבי כהן"]).toBe(40);
  });
});

describe("4. חוסר אמיתי — מתחלק בין הזוכים יחסית, לא נשבר", () => {
  const night = {
    id: "edge-shortfall",
    entries: [
      { name: "דן ינקלויץ", amount: 300 },
      { name: "אופיר סנה", amount: 200 },
      { name: "איציק תפילין", amount: -200 },
      { name: "נתנאל כהן", amount: -200 },
    ],
  };
  it("חוסר 100₪ נחתך יחסית מהזוכים; חייבים משלמים מלא", () => {
    const { transfers, problems } = paymentPlan(night);
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(240); // 300 - 60
    expect(got["אופיר סנה"]).toBe(160); // 200 - 40
    expect(gave["איציק תפילין"]).toBe(200);
    expect(gave["נתנאל כהן"]).toBe(200);
    expect(allWhole(transfers)).toBe(true);
    const totalIn = Object.values(got).reduce((s, v) => s + v, 0);
    const totalOut = Object.values(gave).reduce((s, v) => s + v, 0);
    expect(totalIn).toBe(totalOut);
    expect(totalIn).toBe(400);
    expect(problems).toEqual([]);
  });
});

describe("5. עיגול אגורות — כל ההעברות בשקלים שלמים", () => {
  const night = {
    id: "edge-rounding",
  iso: "2026-10-10",
    entries: [
      { name: "עדן גיל", amount: -100.4 },
      { name: "דן ינקלויץ", amount: 60.3 },
      { name: "אבי כהן", amount: 30.1 },
    ],
  };
  it("עודף 10₪ + אגורות — עדן משלם מלא (100 אחרי עיגול), העודף לכיור, הכל שלם", () => {
    expect(computedPot(night)).toBe(0);
    expect(nightGap(night)).toBe(-10);
    const { transfers, problems } = paymentPlan(night);
    expect(allWhole(transfers)).toBe(true);
    expect(problems).toEqual([]);
    const { got, gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(100); // מלוא החוב המעוגל — העודף לא יורד ממנו
    expect(got["דן ינקלויץ"]).toBe(60);
    expect(got["אבי כהן"]).toBe(30);
    expect(got["עודף ערב"]).toBe(10);
  });
});

describe("6. חלוקה ידנית — עובדת עם לוגיקת הקופה החדשה", () => {
  const night = {
    id: "edge-manual",
  iso: "2026-10-10",
    entries: [
      { name: "עדן גיל", amount: -280 },
      { name: "דן ינקלויץ", amount: 100 },
      { name: "רוני לוי", amount: 100 },
    ],
  };
  it("תשלום ידני נשמר (לא נזרק בגלל basis), היתרה מחולקת אוטומטית", () => {
    // עודף 80₪: עדן חייב 280 גולמי — 100 ידני + 100 אוטומטי + 80 לכיור העודף
    const withManual = saveManualPayments(night, [
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 100 },
    ]);
    const { transfers, problems } = paymentPlan(withManual);
    const manual = transfers.filter((t) => t.manual);
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ from: "עדן גיל", to: "דן ינקלויץ", amount: 100 });
    const { got, gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(280); // מלוא החוב הגולמי
    expect(got["דן ינקלויץ"]).toBe(100);
    expect(got["רוני לוי"]).toBe(100);
    expect(got["עודף ערב"]).toBe(80);
    expect(problems).toEqual([]);
  });
});

describe("7. העברה זוגית — הפיצול נשמר והוולידטור מבין אותו", () => {
  const night = {
    id: "edge-joint",
    entries: [
      { name: "עדן גיל", amount: -120 },
      { name: "אורן גיל", amount: -80 },
      { name: "דן ינקלויץ", amount: 200 },
    ],
  };
  it("העברה אחת משותפת עם fromSplit תקין", () => {
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    expect(transfers).toHaveLength(1);
    const t = transfers[0];
    expect(t.joint).toBe(true);
    expect(t.amount).toBe(200);
    expect(t.fromSplit).toEqual({ "עדן גיל": 120, "אורן גיל": 80 });
    const { gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(120);
    expect(gave["אורן גיל"]).toBe(80);
  });
});

describe("8. זוג (עדן+אורן) עם עודף — שניהם משלמים מלא, העודף לכיור", () => {
  const night = {
    id: "edge-couple-pot",
  iso: "2026-10-10",
    entries: [
      { name: "עדן גיל", amount: -200 },
      { name: "אורן גיל", amount: -100 },
      { name: "דן ינקלויץ", amount: 250 },
    ],
  };
  it("העודף (50₪) הולך לכיור; הזוג משלם את מלוא החוב המשותף", () => {
    expect(computedPot(night)).toBe(0);
    expect(nightGap(night)).toBe(-50);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    const joint = transfers.find((t) => t.joint);
    expect(joint).toBeTruthy();
    expect(joint.amount).toBe(250);
    expect(joint.fromSplit["עדן גיל"] + joint.fromSplit["אורן גיל"]).toBe(250);
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(250);
    expect(gave["עדן גיל"]).toBe(200); // מלא — העודף לא יורד ממנו (25.10)
    expect(gave["אורן גיל"]).toBe(100); // מלא
    expect(got["עודף ערב"]).toBe(50);
  });
});
