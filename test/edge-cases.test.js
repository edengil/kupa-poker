/* בדיקות קצה ללוגיקת החלוקה והקופה (תיקוני 2026-10-11):
   - העודף (כסף תלוי באוויר) עובר לנטו של עדן גיל לפני החלוקה
   - הוולידטור תופס כל חריגה: זוכה חייב לקבל מלא, חייב חייב לשלם מלא */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  saveManualPayments,
} from "../lib/paymentTracking.js";
import { playersWithPot, computedPot } from "../lib/nightShare.js";

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

describe("1. עדן מרוויח + יש עודף — העודף מגדיל את זכייתו", () => {
  const night = {
    id: "edge-eden-wins",
    entries: [
      { name: "עדן גיל", amount: 100 },
      { name: "אבי כהן", amount: -60 },
      { name: "משה לוי", amount: -70 },
    ],
  };
  it("העודף (30₪) מתווסף לזכיית עדן", () => {
    expect(computedPot(night)).toBe(30);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    const { got, gave } = sums(transfers);
    expect(got["עדן גיל"]).toBe(130); // 100 + 30, לא 100
    expect(gave["אבי כהן"]).toBe(60);
    expect(gave["משה לוי"]).toBe(70);
    expect(allWhole(transfers)).toBe(true);
  });
});

describe("2. עדן לא משתתף + יש עודף — הוולידטור מתריע", () => {
  const night = {
    id: "edge-no-eden",
    entries: [
      { name: "אבי כהן", amount: 150 },
      { name: "משה לוי", amount: -100 },
      { name: "דוד פרץ", amount: -80 },
    ],
  };
  it("הוולידטור לא שותק — חייב שמשלם פחות נתפס", () => {
    expect(computedPot(night)).toBe(30);
    const { transfers, problems } = paymentPlan(night);
    // הזוכה מקבל מלא, אבל החייבים משלמים פחות מחובם — חייבת להיות התרעה
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("אמור לשלם"))).toBe(true);
    // לא קורס: ההעברות עצמן מאוזנות ובשקלים שלמים
    expect(allWhole(transfers)).toBe(true);
    const { got } = sums(transfers);
    expect(got["אבי כהן"]).toBe(150);
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
    entries: [
      { name: "עדן גיל", amount: -100.4 },
      { name: "דן ינקלויץ", amount: 60.3 },
      { name: "אבי כהן", amount: 30.1 },
    ],
  };
  it("עודף 10₪ + אגורות — עדן משלם 90, הכל שלם", () => {
    expect(computedPot(night)).toBe(10);
    const { transfers, problems } = paymentPlan(night);
    expect(allWhole(transfers)).toBe(true);
    expect(problems).toEqual([]);
    const { got, gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(90); // 100.4 - 10 → 90 אחרי עיגול
    expect(got["דן ינקלויץ"]).toBe(60);
    expect(got["אבי כהן"]).toBe(30);
  });
});

describe("6. חלוקה ידנית — עובדת עם לוגיקת הקופה החדשה", () => {
  const night = {
    id: "edge-manual",
    entries: [
      { name: "עדן גיל", amount: -280 },
      { name: "דן ינקלויץ", amount: 100 },
      { name: "רוני לוי", amount: 100 },
    ],
  };
  it("תשלום ידני נשמר (לא נזרק בגלל basis), היתרה מחולקת אוטומטית", () => {
    // עודף 80₪ → עדן חייב 200 אחרי הקופה
    const players = playersWithPot(night);
    const eden = players.find((p) => p.name === "עדן גיל");
    expect(Number(eden.buyin)).toBe(200);
    const withManual = saveManualPayments(night, [
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 100 },
    ]);
    const { transfers, problems } = paymentPlan(withManual);
    const manual = transfers.filter((t) => t.manual);
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ from: "עדן גיל", to: "דן ינקלויץ", amount: 100 });
    const { got, gave } = sums(transfers);
    expect(gave["עדן גיל"]).toBe(200); // 100 ידני + 100 אוטומטי
    expect(got["דן ינקלויץ"]).toBe(100);
    expect(got["רוני לוי"]).toBe(100);
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

describe("8. זוג (עדן+אורן) עם עודף — עדן משלם פחות, אורן מלא", () => {
  const night = {
    id: "edge-couple-pot",
    entries: [
      { name: "עדן גיל", amount: -200 },
      { name: "אורן גיל", amount: -100 },
      { name: "דן ינקלויץ", amount: 250 },
    ],
  };
  it("העודף (50₪) יורד רק מעדן; אורן משלמת את מלוא חובה", () => {
    expect(computedPot(night)).toBe(50);
    const { transfers, problems } = paymentPlan(night);
    expect(problems).toEqual([]);
    const joint = transfers.find((t) => t.joint);
    expect(joint).toBeTruthy();
    expect(joint.amount).toBe(250);
    expect(joint.fromSplit).toEqual({ "עדן גיל": 150, "אורן גיל": 100 });
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(250);
    expect(gave["עדן גיל"]).toBe(150); // 200 - 50
    expect(gave["אורן גיל"]).toBe(100); // מלא
  });
});
