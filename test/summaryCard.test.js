import { describe, expect, it } from "vitest";
import { summaryCardData } from "../lib/poker/summaryCard.js";
import { buildSummaryCardSvg } from "../components/poker/SummaryCardButton.jsx";

const S = (iso, entries) => ({
  iso,
  y: Number(iso.slice(0, 4)),
  mo: Number(iso.slice(5, 7)),
  d: Number(iso.slice(8, 10)),
  entries: entries.map(([name, amount]) => ({ name, amount })),
});

const db = () => ({
  aliases: {},
  roster: [],
  sessions: [
    S("2026-09-05", [["אבי", 500], ["משה", -300], ["דנה", -200]]),
    S("2026-09-19", [["משה", 700], ["אבי", -400], ["דנה", -300]]),
    S("2026-08-29", [["אבי", 999], ["משה", -999]]),
    S("2025-09-13", [["דנה", 123], ["אבי", -123]]),
  ],
});

describe("summaryCardData — חודשי", () => {
  const data = () => summaryCardData(db(), { kind: "month", y: 2026, mo: 9 });

  it("כותרת, ערבים ושחקנים של החודש בלבד", () => {
    const d = data();
    expect(d.title).toBe("סיכום חודש ספטמבר 2026");
    expect(d.nights).toBe(2);
    expect(d.players).toBe(3);
    // רק ספטמבר 2026: ערבי אוגוסט 2026 וספטמבר 2025 בחוץ
    expect(d.totalMoved).toBe(1200);
  });

  it("מלך ופודיום לפי נטו התקופה", () => {
    const d = data();
    expect(d.king).toEqual({ name: "משה", amount: 400 });
    expect(d.podium.map((p) => p.name)).toEqual(["משה", "אבי", "דנה"]);
    expect(d.podium[1]).toEqual({ name: "אבי", amount: 100 });
  });

  it("ערב השיא, הערב הסוער והנוכחות — בתוך החודש", () => {
    const d = data();
    expect(d.bestNight).toEqual({ name: "משה", amount: 700, date: "19.9.26" });
    expect(d.stormyNight.moved).toBe(700);
    expect(d.stormyNight.date).toBe("19.9.26");
    expect(d.mostNights).toEqual({ name: "אבי", nights: 2 });
  });
});

describe("summaryCardData — שנתי", () => {
  it("כולל את כל ערבי השנה, בלי שנים אחרות", () => {
    const d = summaryCardData(db(), { kind: "year", y: 2026 });
    expect(d.title).toBe("סיכום שנת 2026");
    expect(d.nights).toBe(3);
    expect(d.king).toEqual({ name: "אבי", amount: 1099 });
    expect(d.bestNight.amount).toBe(999);
  });
});

describe("summaryCardData — קצוות", () => {
  it("null כשאין ערבים בתקופה או ביקוש לא תקין", () => {
    expect(summaryCardData(db(), { kind: "month", y: 2024, mo: 1 })).toBeNull();
    expect(summaryCardData(db(), { kind: "week", y: 2026 })).toBeNull();
    expect(summaryCardData(null, { kind: "year", y: 2026 })).toBeNull();
  });
});

describe("buildSummaryCardSvg — כותרת ולוגו", () => {
  const svg = () =>
    buildSummaryCardSvg(summaryCardData(db(), { kind: "month", y: 2026, mo: 9 }));
  // חודש עם 5 שחקנים — לבדיקת הדירוג המלא
  const db5 = () => ({
    aliases: {},
    roster: [],
    sessions: [
      S("2026-09-05", [["אבי", 500], ["משה", -300], ["דנה", -200], ["רון", 150], ["גל", -150]]),
      S("2026-09-19", [["משה", 700], ["אבי", -400], ["דנה", -300], ["רון", -100], ["גל", 100]]),
    ],
  });
  const svg5 = () =>
    buildSummaryCardSvg(summaryCardData(db5(), { kind: "month", y: 2026, mo: 9 }));

  it("אין letter-spacing ב־brand ויש direction:rtl (תיקון ההיפוך)", () => {
    const s = svg();
    const brandRule = s.match(/\.brand\s*\{[^}]*\}/)?.[0] || "";
    expect(brandRule).not.toContain("letter-spacing");
    expect(brandRule).toContain("direction: rtl");
    // שאר הקלאסים לא קיבלו כיוון גלובלי
    expect(s).not.toContain("letter-spacing");
  });

  it("הלוגו EG מוטמע בתחתית עם הגרדיאנט שלו", () => {
    const s = svg();
    expect(s).toContain('id="egCard"');
    expect(s).toContain('<g transform="translate(512,940) scale(0.875)">');
    // שני העיגולים, שלושת ה־path-ים של האותיות והנקודה
    expect(s).toContain('r="30" fill="url(#egCard)"');
    expect(s).toContain('cx="50.5" cy="47.5" r="2.2" fill="#D9A441"');
    expect(s).toContain("M15.5 20h14.2");
    expect(s).toContain("M47.8 22.1");
    expect(s).toContain("M48.2 31.2");
  });

  it("דירוג מלא: כל השחקנים מופיעים בשתי עמודות, ממוין יורד", () => {
    const s = svg5();
    const data = summaryCardData(db5(), { kind: "month", y: 2026, mo: 9 });
    expect(data.standings.map((p) => p.name)).toEqual(["משה", "אבי", "רון", "גל", "דנה"]);
    for (const p of data.standings) expect(s).toContain(p.name);
    // מדליות לשלושת הראשונים, מספרים לשאר
    expect(s).toContain("🥇");
    expect(s).toContain("🥈");
    expect(s).toContain("🥉");
    expect(s).toContain("#4");
    expect(s).toContain("#5");
    // סכומים עם סימן: חיובי בזהב, שלילי באדום רך
    expect(s).toContain("#D9A441");
    expect(s).toContain("#E08080");
    // שתי העמודות קיימות
    expect(s).toContain('x="800"');
    expect(s).toContain('x="280"');
  });

  it("פריסה אנכית: טבלה, שיאים, לוגו, קרדיט — בלי חפיפות ובתוך המסגרת", () => {
    const s = svg5();
    const ys = [...s.matchAll(/<text x="(\d+)" y="([\d.]+)" class="srow"/g)].map(
      (m) => Number(m[2])
    );
    expect(ys.length).toBeGreaterThan(0);
    const tableBottom = Math.max(...ys);
    expect(tableBottom).toBeLessThan(730); // בתוך אזור הטבלה
    // שורת הסטטיסטיקה מתחת לטבלה
    expect(s).toContain('y="778" class="stats"');
    // שורות השיאים מתחתיה
    expect(s).toContain('y="836" class="extra"');
    // הלוגו (56 פיקסלים, 940–996) — מרווח מעל ומתחת
    expect(940).toBeGreaterThan(836 + 2 * 34 + 20);
    expect(940 + 56).toBeLessThan(1030 - 16);
    // הקרדיט בתוך המסגרת (1054)
    expect(s).toContain('y="1030" class="foot"');
  });

  it("עם המון שחקנים הטבלה מתכווצת ולא גולשת", () => {
    const many = Array.from({ length: 18 }, (_, i) => ({
      name: `שחקן${i + 1}`,
      amount: (18 - i) * 10,
    }));
    const s = buildSummaryCardSvg({
      title: "סיכום חודש",
      nights: 6,
      players: 18,
      totalMoved: 1000,
      standings: many,
      bestNight: null,
      stormyNight: null,
      mostNights: null,
    });
    const ys = [...s.matchAll(/<text x="\d+" y="([\d.]+)" class="srow"/g)].map((m) =>
      Number(m[1])
    );
    expect(ys).toHaveLength(18);
    expect(Math.max(...ys)).toBeLessThan(730);
    expect(Math.min(...ys)).toBeGreaterThan(330);
    for (const p of many) expect(s).toContain(p.name);
  });
});
