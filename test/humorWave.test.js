import { describe, it, expect } from "vitest";
import {
  FIRST_PLACE_PRAISE_M,
  FIRST_PLACE_PRAISE_F,
  NON_TIPPER_ROASTS,
  WINNER_TITLES_M,
  WINNER_TITLES_F,
  LOSER_TITLES_M,
  LOSER_TITLES_F,
  REBUY_JOKES,
  TECHNICAL_WIN_LINES,
  TECHNICAL_WIN_LINES_M,
  TECHNICAL_WIN_LINES_F,
  TOURIST_LINES,
  TOURIST_LINES_M,
  TOURIST_LINES_F,
  POT_MILESTONE_LINES,
  OPENING_PROPHECIES,
  formatFirstPlaceLine,
  formatNonTipperLine,
  formatWinnerTitleLine,
  formatLoserTitleLine,
  formatRebuyJoke,
  formatTechnicalWinLine,
  formatTouristLine,
  formatPotMilestoneLine,
  formatOpeningProphecy,
} from "../lib/tipSummaryCopy.js";
import { isFemaleName } from "../lib/gender.js";
import { nightSummaryText, nightAwardsText } from "../lib/nightShare.js";
import { parseEntries } from "../lib/poker/parse.js";
import { parseSettlementNets } from "../scripts/parse-whatsapp-entries.mjs";
import {
  buildPaymentReminderText,
  unpaidTransfers,
  PAYMENT_REMINDER_JOKE_TIERS,
  paymentReminderJokeFor,
  paymentReminderTierFor,
  daysSinceNight,
} from "../lib/paymentReminder.js";
import { applyCommands } from "../lib/whatsapp.js";

/* אותו now קבוע כמו בבדיקות הטיפים הקיימות */
const FIXED_NOW = Date.parse("2026-08-23T12:00:00+03:00");

describe("שקיות מורחבות — טיפים", () => {
  it("8 מחמאות חדשות לכל מגדר, כולן עם {name} ובאורך שווה", () => {
    expect(FIRST_PLACE_PRAISE_M.length).toBe(24);
    expect(FIRST_PLACE_PRAISE_F.length).toBe(24);
    expect(FIRST_PLACE_PRAISE_M.every((s) => s.includes("{name}"))).toBe(true);
    expect(FIRST_PLACE_PRAISE_F.every((s) => s.includes("{name}"))).toBe(true);
    expect(FIRST_PLACE_PRAISE_M.some((s) => s.includes("ועדת קבלה בהצטיינות"))).toBe(true);
    expect(FIRST_PLACE_PRAISE_F.some((s) => s.includes("ועדת קבלה בהצטיינות"))).toBe(true);
  });

  it("8 צחוקי אי־טיפ חדשים", () => {
    expect(NON_TIPPER_ROASTS.length).toBe(26);
    const flat = NON_TIPPER_ROASTS.map((e) =>
      typeof e === "string" ? e : [e.m, e.f, e.multi].filter(Boolean).join(" | ")
    ).join("\n");
    expect(flat).toContain("הכיס שלו נפתח בטביעת אצבע — והאצבע בחופשה");
    /* אותן מגבלות טון כמו בשקית המקורית */
    expect(flat).not.toMatch(/all-in/i);
    expect(flat).not.toContain("סלע");
  });

  it("הסיבוב ב־now הקבוע: מחמאה נשארת אינדקס 12, צחוק עובר לאינדקס 18 (החדש הראשון)", () => {
    /* 29791260 דקות: ‏%24 = 12 (אותה מחמאה כמו לפני ההרחבה), ‏%26 = 18 */
    expect(formatFirstPlaceLine(["איציק"], isFemaleName, FIXED_NOW)).toContain("אני מזמין, אתם יושבים");
    expect(formatFirstPlaceLine(["אורן"], isFemaleName, FIXED_NOW)).toContain("אני מזמינה, אתם יושבים");
    expect(formatNonTipperLine(["דן"], isFemaleName, FIXED_NOW)).toContain(
      "הכיס שלו נפתח בטביעת אצבע — והאצבע בחופשה"
    );
  });

  it("אותו צחוק בנקבה לשחקנית שלא שמה טיפ לבדה", () => {
    expect(formatNonTipperLine(["אורן"], isFemaleName, FIXED_NOW)).toContain(
      "הכיס שלה נפתח בטביעת אצבע — והאצבע בחופשה"
    );
    expect(formatNonTipperLine(["אורן"], isFemaleName, FIXED_NOW)).not.toContain("הכיס שלו");
  });

  it("הסיבוב מחזורי באורך השקית", () => {
    const a = formatFirstPlaceLine(["איציק"], isFemaleName, FIXED_NOW);
    const b = formatFirstPlaceLine(["איציק"], isFemaleName, FIXED_NOW + 24 * 60_000);
    expect(b).toBe(a);
    const r1 = formatNonTipperLine(["דן"], isFemaleName, FIXED_NOW);
    const r2 = formatNonTipperLine(["דן"], isFemaleName, FIXED_NOW + 26 * 60_000);
    expect(r2).toBe(r1);
  });
});

describe("כתרי סיכום ערב — פורמט ומגדר", () => {
  it("שקיות של 6 לכל סוג ומגדר, בלי מילות נטו ובלי מספרים (בטיחות פארסר)", () => {
    for (const bag of [WINNER_TITLES_M, WINNER_TITLES_F, LOSER_TITLES_M, LOSER_TITLES_F]) {
      expect(bag.length).toBe(6);
      for (const t of bag) {
        expect(t).not.toMatch(/מגיע|מגיעה|חייב|חייבת/);
        expect(t).not.toMatch(/\d/);
      }
    }
  });

  it("כל אינדקסי הסיבוב נגישים, במגדר הנכון", () => {
    for (let i = 0; i < 6; i++) {
      const now = i * 60_000;
      expect(formatWinnerTitleLine("דן", isFemaleName, now)).toBe(`👑 ${WINNER_TITLES_M[i]}: דן`);
      expect(formatWinnerTitleLine("אורן גיל", isFemaleName, now)).toBe(
        `👑 ${WINNER_TITLES_F[i]}: אורן גיל`
      );
      expect(formatLoserTitleLine("דן", isFemaleName, now)).toBe(`🏧 ${LOSER_TITLES_M[i]}: דן`);
      expect(formatLoserTitleLine("אורן גיל", isFemaleName, now)).toBe(
        `🏧 ${LOSER_TITLES_F[i]}: אורן גיל`
      );
    }
  });
});

describe("כתרי סיכום ערב — בתוך nightSummaryText", () => {
  const endedAt = Date.parse("2026-08-20T23:30:00+03:00");
  const session = {
    d: 20,
    mo: 8,
    endedAt,
    entries: [
      { name: "אופיר", amount: 200, tipsGiven: 10 },
      { name: "דן", amount: 50 },
      { name: "קובי", amount: -100 },
      { name: "נתנאל", amount: -150 },
    ],
  };

  it("כתר לזוכה הגדול וכתר למפסיד הגדול, אחרי בלוק הטיפים", () => {
    const text = nightSummaryText(session);
    const win = text.split("\n").find((l) => l.startsWith("👑"));
    const lose = text.split("\n").find((l) => l.startsWith("🏧"));
    expect(win).toBe(formatWinnerTitleLine("אופיר", isFemaleName, endedAt));
    expect(lose).toBe(formatLoserTitleLine("נתנאל", isFemaleName, endedAt));
    expect(text.indexOf("💸 טיפים הערב")).toBeLessThan(text.indexOf("👑"));
    expect(text.indexOf("👑")).toBeLessThan(text.indexOf("🏧"));
  });

  it("מעוגן ל־endedAt — לא זז כש־Date.now זז", () => {
    const realNow = Date.now;
    try {
      Date.now = () => endedAt + 60_000;
      const first = nightSummaryText(session);
      Date.now = () => endedAt + 9 * 60_000;
      expect(nightSummaryText(session)).toBe(first);
    } finally {
      Date.now = realNow;
    }
  });

  it("תיקו בזוכים — הראשון לפי סדר הרשומות (מיון יציב)", () => {
    const tied = {
      d: 20,
      mo: 8,
      endedAt,
      entries: [
        { name: "ראשון", amount: 100 },
        { name: "שני", amount: 100 },
        { name: "מפסיד", amount: -200 },
      ],
    };
    expect(nightAwardsText(tied.entries, endedAt)).toContain(": ראשון");
  });

  it("כשכולם באפס — אין 👑/🏧, רק תייר לראשון; רק 👑 כשאין מפסיד; רק 🏧 כשאין זוכה", () => {
    const zeros = {
      d: 20,
      mo: 8,
      endedAt,
      entries: [
        { name: "א", amount: 0 },
        { name: "ב", amount: 0 },
      ],
    };
    expect(nightSummaryText(zeros)).not.toMatch(/👑|🏧/);
    expect(nightAwardsText(zeros.entries, endedAt)).toBe(
      formatTouristLine("א", isFemaleName, endedAt)
    );

    const winOnly = nightAwardsText(
      [
        { name: "א", amount: 50 },
        { name: "ב", amount: 0 },
      ],
      endedAt
    );
    expect(winOnly).toContain("👑");
    expect(winOnly).not.toContain("🏧");

    const loseOnly = nightAwardsText(
      [
        { name: "א", amount: -50 },
        { name: "ב", amount: 0 },
      ],
      endedAt
    );
    expect(loseOnly).toContain("🏧");
    expect(loseOnly).not.toContain("👑");
  });
});

describe("בלוק הפרסים לא שובר פענוח סיכום מודבק", () => {
  const session = {
    d: 20,
    mo: 8,
    endedAt: Date.parse("2026-08-20T23:30:00+03:00"),
    entries: [
      { name: "אופיר סנה", amount: 200, tipsGiven: 10 },
      { name: "דן ינקלויץ", amount: 50 },
      { name: "קובי סעדה", amount: -100 },
      { name: "נתנאל כהן", amount: -150 },
    ],
  };
  const full = nightSummaryText(session);
  const stripped = full
    .split("\n")
    .filter((l) => !l.startsWith("👑") && !l.startsWith("🏧"))
    .join("\n");

  it("הסיכום המלא באמת מכיל את בלוק הפרסים", () => {
    expect(full).toContain("👑");
    expect(full).toContain("🏧");
    expect(stripped).not.toContain("👑");
  });

  it("parseEntries: פענוח זהה עם ובלי הבלוק, וזהה לנטו האמיתי", () => {
    const withAwards = parseEntries(full);
    const without = parseEntries(stripped);
    expect(withAwards).toEqual(without);
    const nets = Object.fromEntries(withAwards.map((e) => [e.name, e.amount]));
    expect(nets).toEqual({
      "אופיר סנה": 200,
      "דן ינקלויץ": 50,
      "קובי סעדה": -100,
      "נתנאל כהן": -150,
    });
  });

  it("parseSettlementNets: פענוח זהה עם ובלי הבלוק", () => {
    expect(parseSettlementNets(full)).toEqual(parseSettlementNets(stripped));
    /* שורות זוכים עם מדליה (🥇/🥈) לא נפרסות בפרסר הסקריפט — stripMarks
       מסיר רק 🤖, והרגקס מעוגן לאות עברית. התנהגות קיימת, זהה עם ובלי
       בלוק הפרסים; החייבים (בלי מדליות) נפרסים במלואם. */
    expect(parseSettlementNets(full)).toEqual({
      "קובי סעדה": -100,
      "נתנאל כהן": -150,
    });
  });
});

describe("תזכורת תשלום — שורת הומור מדורגת לפי גיל החוב", () => {
  const ALL_JOKES = Object.values(PAYMENT_REMINDER_JOKE_TIERS).flat();
  const sessionOn = (iso) => ({
    id: "s1",
    iso,
    cps: 1,
    entries: [
      { name: "א", amount: -100 },
      { name: "ב", amount: 100 },
    ],
  });
  /* «היום» קבוע: 22.9.2026, 08:00 ישראל */
  const TODAY = Date.parse("2026-09-22T08:00:00+03:00");
  const TODAY_LATE = Date.parse("2026-09-22T21:40:00+03:00");
  const textFor = (iso, now = TODAY) =>
    buildPaymentReminderText(sessionOn(iso), unpaidTransfers(sessionOn(iso)), {
      siteUrl: "https://example.com",
      slug: "kupa",
      now,
    });

  it("ארבע שקיות של 3; שורת הווייז המאושרת בדרגה הבינונית", () => {
    for (const bag of Object.values(PAYMENT_REMINDER_JOKE_TIERS)) expect(bag.length).toBe(3);
    expect(PAYMENT_REMINDER_JOKE_TIERS.medium).toContain(
      "הביט שלכם עוד בדרך? הוא יצא לפני יומיים — תנו לו ווייז 🧭"
    );
    expect(PAYMENT_REMINDER_JOKE_TIERS.missing.some((j) => j.includes("הוכרז כנעדר"))).toBe(true);
  });

  it("מיפוי דרגות לפי ימים", () => {
    expect(paymentReminderTierFor(0)).toBe("gentle");
    expect(paymentReminderTierFor(1)).toBe("gentle");
    expect(paymentReminderTierFor(2)).toBe("medium");
    expect(paymentReminderTierFor(3)).toBe("medium");
    expect(paymentReminderTierFor(4)).toBe("sharp");
    expect(paymentReminderTierFor(6)).toBe("sharp");
    expect(paymentReminderTierFor(7)).toBe("missing");
    expect(paymentReminderTierFor(30)).toBe("missing");
    expect(daysSinceNight(sessionOn("2026-09-21"), TODAY)).toBe(1);
    expect(daysSinceNight(sessionOn("2026-09-15"), TODAY)).toBe(7);
  });

  it("כל דרגה מחזירה שורה מהשקית שלה, כשורה אחרונה ויחידה", () => {
    const cases = [
      ["2026-09-21", "gentle"], // יום 1
      ["2026-09-20", "medium"], // יום 2
      ["2026-09-19", "medium"], // יום 3
      ["2026-09-18", "sharp"], // יום 4
      ["2026-09-16", "sharp"], // יום 6
      ["2026-09-15", "missing"], // יום 7
      ["2026-09-01", "missing"], // יום 21
    ];
    for (const [iso, tier] of cases) {
      const text = textFor(iso);
      const lines = text.split("\n");
      const last = lines[lines.length - 1];
      expect(PAYMENT_REMINDER_JOKE_TIERS[tier]).toContain(last);
      expect(paymentReminderJokeFor(sessionOn(iso), TODAY)).toBe(last);
      /* בדיוק שורת הומור אחת בכל הטקסט */
      expect(lines.filter((l) => ALL_JOKES.includes(l)).length).toBe(1);
      /* התוכן הפונקציונלי לא נפגע */
      expect(text).toContain("לא כולם עדיין העבירו (1 פתוחות)");
      expect(text).toContain("https://example.com/g/kupa/n/s1");
      expect(text).toContain("בלינק רואים מי כבר העביר ומי עדיין ממתין.");
    }
  });

  it("נעדרת כשאין העברות פתוחות, בכל דרגה", () => {
    for (const iso of ["2026-09-21", "2026-09-19", "2026-09-17", "2026-09-10"]) {
      const text = buildPaymentReminderText(sessionOn(iso), [], {
        siteUrl: "https://example.com",
        slug: "kupa",
        now: TODAY,
      });
      for (const j of ALL_JOKES) expect(text).not.toContain(j);
      expect(text).toContain("בלינק רואים מי כבר העביר ומי עדיין ממתין.");
    }
  });

  it("יציבה בתוך אותו יום", () => {
    const s = sessionOn("2026-09-20");
    expect(paymentReminderJokeFor(s, TODAY)).toBe(paymentReminderJokeFor(s, TODAY_LATE));
  });
});

describe("כניסה חוזרת — שורת הומור מהכניסה השלישית", () => {
  it("שקית של 5; formatter מחזיר null לפני הכניסה השלישית", () => {
    expect(REBUY_JOKES.length).toBe(5);
    expect(formatRebuyJoke("דן", 1, isFemaleName, FIXED_NOW)).toBeNull();
    expect(formatRebuyJoke("דן", 2, isFemaleName, FIXED_NOW)).toBeNull();
    expect(typeof formatRebuyJoke("דן", 3, isFemaleName, FIXED_NOW)).toBe("string");
    expect(typeof formatRebuyJoke("דן", 5, isFemaleName, FIXED_NOW)).toBe("string");
  });

  it("אין שורה בכניסות 1–2, יש שורה בכניסה 3", () => {
    const flat = REBUY_JOKES.map((e) => (typeof e === "string" ? e : `${e.m}|${e.f}`));
    const hasJoke = (reply) => flat.some((j) => j.split("|").some((v) => reply.includes(v)));
    let live = { players: [], applied: {}, approvedNames: ["דן ינקלויץ"] };
    const add = (id) =>
      applyCommands(live, [{ kind: "add", name: "דן ינקלויץ", amount: 50 }], id, 2, { now: FIXED_NOW });

    let r = add("rj-1");
    live = r.live;
    expect(r.reply).toContain("דן ינקלויץ נכנס ב-50₪");
    expect(hasJoke(r.reply)).toBe(false);
    expect(live.players[0].buyinEvents.length).toBe(1);

    r = add("rj-2");
    live = r.live;
    expect(hasJoke(r.reply)).toBe(false);
    expect(live.players[0].buyinEvents.length).toBe(2);

    r = add("rj-3");
    live = r.live;
    expect(live.players[0].buyinEvents.length).toBe(3);
    expect(hasJoke(r.reply)).toBe(true);
  });
});

describe("פרסים מורחבים — ניצחון טכני ותייר הערב", () => {
  const endedAt = Date.parse("2026-08-20T23:30:00+03:00");

  it("שקיות של 3 לכל מגדר; הפורמט מחליף שם וסכום", () => {
    expect(TECHNICAL_WIN_LINES_M.length).toBe(3);
    expect(TECHNICAL_WIN_LINES_F.length).toBe(3);
    expect(TOURIST_LINES_M.length).toBe(3);
    expect(TOURIST_LINES_F.length).toBe(3);
    expect(TECHNICAL_WIN_LINES).toBe(TECHNICAL_WIN_LINES_M);
    expect(TOURIST_LINES).toBe(TOURIST_LINES_M);
    expect(TECHNICAL_WIN_LINES[0]).toBe(
      "🏅 ניצחון טכני: {name} — זכה ב־{amount} ₪ ומתנהג כאילו לקח טורניר"
    );
    expect(formatTechnicalWinLine("דן", 7, isFemaleName, 0)).toBe(
      "🏅 ניצחון טכני: דן — זכה ב־7 ₪ ומתנהג כאילו לקח טורניר"
    );
    expect(formatTouristLine("דן", isFemaleName, 0)).toBe(
      TOURIST_LINES[0].replace("{name}", "דן")
    );
  });

  it("מגדר נקבה לאורן בכל אינדקסי הסיבוב של שתי השקיות", () => {
    const expectedTechnicalF = [
      "🏅 ניצחון טכני: אורן — זכתה ב־7 ₪ ומתנהגת כאילו לקחה טורניר",
      "🏅 ניצחון טכני: אורן — 7 ₪ בלבד, אבל החגיגה כמו באליפות",
      "🏅 ניצחון טכני: אורן — יצאה עם 7 ₪ ועם סיפור ניצחון לכל השבוע",
    ];
    const expectedTouristF = [
      "🧳 תיירת הערב: אורן — באה, ראתה, לא הרוויחה, לא הפסידה",
      "🧳 תיירת הערב: אורן — טיול מאורגן: נכנסה, שיחקה, יצאה כמו שנכנסה",
      "🧳 תיירת הערב: אורן — אפס הפסד, אפס רווח, מאה אחוז נוכחות",
    ];
    expect(TECHNICAL_WIN_LINES_F).toEqual([
      "🏅 ניצחון טכני: {name} — זכתה ב־{amount} ₪ ומתנהגת כאילו לקחה טורניר",
      "🏅 ניצחון טכני: {name} — {amount} ₪ בלבד, אבל החגיגה כמו באליפות",
      "🏅 ניצחון טכני: {name} — יצאה עם {amount} ₪ ועם סיפור ניצחון לכל השבוע",
    ]);
    expect(TOURIST_LINES_F).toEqual([
      "🧳 תיירת הערב: {name} — באה, ראתה, לא הרוויחה, לא הפסידה",
      "🧳 תיירת הערב: {name} — טיול מאורגן: נכנסה, שיחקה, יצאה כמו שנכנסה",
      "🧳 תיירת הערב: {name} — אפס הפסד, אפס רווח, מאה אחוז נוכחות",
    ]);
    for (let i = 0; i < 3; i++) {
      const now = i * 60_000;
      expect(formatTechnicalWinLine("אורן", 7, isFemaleName, now)).toBe(expectedTechnicalF[i]);
      expect(formatTouristLine("אורן", isFemaleName, now)).toBe(expectedTouristF[i]);
    }
  });

  it("רגרסיית זכר: הפלט זהה לקודם בכל אינדקסי הסיבוב", () => {
    const expectedTechnicalM = [
      "🏅 ניצחון טכני: דן — זכה ב־7 ₪ ומתנהג כאילו לקח טורניר",
      "🏅 ניצחון טכני: דן — 7 ₪ בלבד, אבל החגיגה כמו באליפות",
      "🏅 ניצחון טכני: דן — יצא עם 7 ₪ ועם סיפור ניצחון לכל השבוע",
    ];
    const expectedTouristM = [
      "🧳 תייר הערב: דן — בא, ראה, לא הרוויח, לא הפסיד",
      "🧳 תייר הערב: דן — טיול מאורגן: נכנס, שיחק, יצא כמו שנכנס",
      "🧳 תייר הערב: דן — אפס הפסד, אפס רווח, מאה אחוז נוכחות",
    ];
    for (let i = 0; i < 3; i++) {
      const now = i * 60_000;
      expect(formatTechnicalWinLine("דן", 7, isFemaleName, now)).toBe(expectedTechnicalM[i]);
      expect(formatTouristLine("דן", isFemaleName, now)).toBe(expectedTouristM[i]);
    }
  });

  it("ניצחון טכני כשהזוכה הגדול זכה ב־10 או פחות — ולא ב־11", () => {
    const small = nightAwardsText(
      [
        { name: "א", amount: 10 },
        { name: "ב", amount: -10 },
      ],
      endedAt
    );
    expect(small).toContain("🏅 ניצחון טכני: א");
    expect(small).toContain("10");
    const bigger = nightAwardsText(
      [
        { name: "א", amount: 11 },
        { name: "ב", amount: -11 },
      ],
      endedAt
    );
    expect(bigger).not.toContain("🏅");
  });

  it("תייר לראשון שסגר באפס לפי סדר הרשומות", () => {
    const text = nightAwardsText(
      [
        { name: "זוכה", amount: 100 },
        { name: "תייר ראשון", amount: 0 },
        { name: "תייר שני", amount: 0 },
        { name: "מפסיד", amount: -100 },
      ],
      endedAt
    );
    expect(text).toContain("🧳 תייר הערב: תייר ראשון");
    expect(text).not.toContain("תייר שני");
  });

  it("תקרה של 3 שורות וסדר עדיפות: מלך > מממן > ניצחון טכני > תייר", () => {
    /* זוכה קטן + מפסיד + אפס: התייר נושר */
    const withSmallWin = nightAwardsText(
      [
        { name: "זוכה", amount: 5 },
        { name: "אפס", amount: 0 },
        { name: "מפסיד", amount: -5 },
      ],
      endedAt
    ).split("\n");
    expect(withSmallWin.length).toBe(3);
    expect(withSmallWin[0]).toContain("👑");
    expect(withSmallWin[1]).toContain("🏧");
    expect(withSmallWin[2]).toContain("🏅");
    /* זוכה גדול + מפסיד + אפס: התייר בפנים */
    const withBigWin = nightAwardsText(
      [
        { name: "זוכה", amount: 200 },
        { name: "אפס", amount: 0 },
        { name: "מפסיד", amount: -200 },
      ],
      endedAt
    ).split("\n");
    expect(withBigWin.length).toBe(3);
    expect(withBigWin[2]).toContain("🧳");
  });

  it("פארסר: סיכום עם ניצחון טכני / תייר מתפענח זהה לבלעדיהם", () => {
    const stripAwards = (text) =>
      text
        .split("\n")
        .filter((l) => !/^(👑|🏧|🏅|🧳)/.test(l))
        .join("\n");
    const withTourist = nightSummaryText({
      d: 20,
      mo: 8,
      endedAt,
      entries: [
        { name: "אופיר סנה", amount: 200, tipsGiven: 10 },
        { name: "דן ינקלויץ", amount: 0 },
        { name: "קובי סעדה", amount: -200 },
      ],
    });
    expect(withTourist).toContain("🧳");
    expect(parseEntries(withTourist)).toEqual(parseEntries(stripAwards(withTourist)));
    expect(parseSettlementNets(withTourist)).toEqual(
      parseSettlementNets(stripAwards(withTourist))
    );

    const withTechnical = nightSummaryText({
      d: 20,
      mo: 8,
      endedAt,
      entries: [
        { name: "אופיר סנה", amount: 10, tipsGiven: 5 },
        { name: "קובי סעדה", amount: -10 },
      ],
    });
    expect(withTechnical).toContain("🏅 ניצחון טכני: אופיר סנה");
    expect(parseEntries(withTechnical)).toEqual(parseEntries(stripAwards(withTechnical)));
    expect(parseSettlementNets(withTechnical)).toEqual(
      parseSettlementNets(stripAwards(withTechnical))
    );
  });
});

describe("אבני דרך בקופה — ציון חציית כפולת־500", () => {
  const milestoneLines = (amount) =>
    POT_MILESTONE_LINES.map((t) => t.replace("{amount}", amount.toLocaleString("he-IL")));
  const countMilestones = (reply) =>
    [...milestoneLines(500), ...milestoneLines(1000), ...milestoneLines(1500)].filter((l) =>
      reply.includes(l)
    ).length;
  const baseLive = () => ({
    players: [],
    applied: {},
    approvedNames: ["דן ינקלויץ", "קובי סעדה"],
  });

  it("חצייה מדווחת פעם אחת; אי־חצייה לא; שחזור לא מכפיל", () => {
    let live = baseLive();
    const add = (name, amount, id) =>
      applyCommands(live, [{ kind: "add", name, amount }], id, 2, { now: FIXED_NOW });

    let r = add("דן ינקלויץ", 300, "pm-1");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(0);

    r = add("דן ינקלויץ", 300, "pm-2");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(1);
    expect(r.reply).toContain(formatPotMilestoneLine(500, FIXED_NOW));

    r = add("דן ינקלויץ", 100, "pm-3");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(0);

    r = add("קובי סעדה", 400, "pm-4");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(1);
    expect(r.reply).toContain("1,000");

    /* מסירה חוזרת של הודעת החצייה: הקופה חוזרת ל־1,100 אבל אין הכרזה שנייה */
    r = add("קובי סעדה", 400, "pm-4");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(0);
    const kobi = live.players.find((p) => p.name === "קובי סעדה");
    expect(kobi.buyin).toBe(400);
    expect(kobi.buyinEvents.length).toBe(1);
  });

  it("כניסה אחת שחוצה שני ספים — מוכרז רק הגבוה, והנמוך לא מוכרז אחר כך", () => {
    let live = baseLive();
    const add = (name, amount, id) =>
      applyCommands(live, [{ kind: "add", name, amount }], id, 2, { now: FIXED_NOW });
    let r = add("דן ינקלויץ", 1200, "pm-big-1");
    live = r.live;
    expect(countMilestones(r.reply)).toBe(1);
    expect(r.reply).toContain("1,000");
    r = add("דן ינקלויץ", 50, "pm-big-2");
    expect(countMilestones(r.reply)).toBe(0);
  });
});

describe("נבואת פתיחה — פעם אחת בערב", () => {
  const hasProphecy = (reply) =>
    reply.includes("🔮 נבואת הבוט:") && OPENING_PROPHECIES.some((p) => reply.includes(p));

  it("בכניסה הראשונה יש נבואה; בשנייה אין; שחזור לא חוזר עליה", () => {
    let live = { players: [], applied: {}, approvedNames: ["דן ינקלויץ", "קובי סעדה"] };
    const add = (name, id) =>
      applyCommands(live, [{ kind: "add", name, amount: 50 }], id, 2, { now: FIXED_NOW });

    let r = add("דן ינקלויץ", "op-1");
    live = r.live;
    expect(hasProphecy(r.reply)).toBe(true);
    expect(r.reply).toContain(formatOpeningProphecy(FIXED_NOW));

    r = add("קובי סעדה", "op-2");
    live = r.live;
    expect(hasProphecy(r.reply)).toBe(false);

    /* מסירה חוזרת של הודעת הפתיחה — בלי נבואה שנייה */
    r = add("דן ינקלויץ", "op-1");
    expect(hasProphecy(r.reply)).toBe(false);
  });

  it("ערב שכבר התחיל (startedAt קיים) — אין נבואה", () => {
    const live = {
      players: [{ name: "דן ינקלויץ", buyin: 50, cashout: "", buyinEvents: [{ amount: 50, at: 1, total: 50 }] }],
      applied: {},
      approvedNames: ["דן ינקלויץ", "קובי סעדה"],
      startedAt: FIXED_NOW - 3_600_000,
    };
    const r = applyCommands(
      live,
      [{ kind: "add", name: "קובי סעדה", amount: 50 }],
      "op-9",
      2,
      { now: FIXED_NOW }
    );
    expect(hasProphecy(r.reply)).toBe(false);
  });
});

describe("כניסה חוזרת — שורת הומור מהכניסה השלישית", () => {
  it("מסירה חוזרת של אותה הודעה לא סופרת כניסה נוספת ולא מוסיפה שורה כפולה", () => {
    let live = { players: [], applied: {}, approvedNames: ["דן ינקלויץ"] };
    const add = (id) =>
      applyCommands(live, [{ kind: "add", name: "דן ינקלויץ", amount: 50 }], id, 2, { now: FIXED_NOW });
    live = add("rd-1").live;
    live = add("rd-2").live;
    const third = add("rd-3");
    live = third.live;
    expect(live.players[0].buyinEvents.length).toBe(3);
    const again = add("rd-3");
    expect(again.live.players[0].buyinEvents.length).toBe(3);
    expect(again.live.players[0].buyin).toBe(150);
  });
});
