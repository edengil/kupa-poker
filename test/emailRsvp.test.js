import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizePlayerEmail,
  playerEmail,
  setPlayerEmail,
  inviteRecipientLists,
  markEmailInvites,
  applyEmailRsvp,
  emailRsvpStatus,
  planSummaryText,
  parseEmailImport,
  applyEmailImport,
} from "../lib/poker/emailRsvp.js";
import {
  signRsvpToken,
  verifyRsvpToken,
  rsvpTokenExpiry,
} from "../lib/rsvpToken.js";

const db = () => ({
  roster: ["אבי", "משה", "יוסי"],
  aliases: { אבי: "אבי כהן" },
  emails: { "אבי כהן": "avi@example.com" },
  sessions: [
    {
      iso: "2026-09-26",
      entries: [
        { name: "משה", amount: 100 },
        { name: "רוני", amount: -100 },
      ],
    },
  ],
  plan: { iso: "2026-10-08", time: "20:30", location: "אצל אבי", note: "" },
});

describe("normalizePlayerEmail", () => {
  it("מנרמל כתובת תקינה", () => {
    expect(normalizePlayerEmail("  Dani@Example.COM ")).toBe("dani@example.com");
  });
  it("דוחה כתובות לא תקינות", () => {
    expect(normalizePlayerEmail("")).toBeNull();
    expect(normalizePlayerEmail("dani@")).toBeNull();
    expect(normalizePlayerEmail("dani example.com")).toBeNull();
    expect(normalizePlayerEmail(null)).toBeNull();
  });
});

describe("setPlayerEmail + playerEmail", () => {
  it("שומר אימייל תחת השם הקנוני ולא מוטט את ה־db המקורי", () => {
    const base = db();
    const next = setPlayerEmail(base, "אבי", " new@Mail.com ");
    expect(playerEmail(next, "אבי כהן")).toBe("new@mail.com");
    expect(playerEmail(base, "אבי")).toBe("avi@example.com");
  });
  it("מחרוזת ריקה מוחקת את הכתובת", () => {
    const next = setPlayerEmail(db(), "אבי כהן", "");
    expect(playerEmail(next, "אבי")).toBeNull();
  });
  it("כתובת לא תקינה לא נשמרת", () => {
    const next = setPlayerEmail(db(), "אבי", "not-an-email");
    expect(playerEmail(next, "אבי")).toBeNull();
  });
});

describe("inviteRecipientLists", () => {
  it("מחלק שחקנים מוכרים (סגל + ערבים) לפי קיום אימייל", () => {
    const { withEmail, withoutEmail } = inviteRecipientLists(db());
    expect(withEmail).toEqual([{ name: "אבי כהן", email: "avi@example.com" }]);
    expect(withoutEmail.map((r) => r.name)).toEqual(["יוסי", "משה", "רוני"]);
  });
});

describe("markEmailInvites", () => {
  it("מסמן שנשלח וממזג עם סימונים קודמים בלי לדרוס אישורים", () => {
    const plan = { iso: "2026-10-08", emailRsvps: { אבי: { status: "yes", at: 1 } } };
    const once = markEmailInvites(plan, [{ name: "דני לוי", email: "d@x.com" }], 100);
    const twice = markEmailInvites(once, ["יוסי"], 200);
    expect(twice.emailInvites["דני לוי"]).toEqual({ at: 100, email: "d@x.com" });
    expect(twice.emailInvites["יוסי"]).toEqual({ at: 200 });
    expect(twice.emailRsvps).toEqual({ אבי: { status: "yes", at: 1 } });
  });
});

describe("applyEmailRsvp", () => {
  it("רושם מגיע / לא מגיע ומחליף תשובה קודמת", () => {
    const plan = { iso: "2026-10-08" };
    const yes = applyEmailRsvp(plan, "דני לוי", "yes", 10);
    expect(yes.emailRsvps["דני לוי"]).toEqual({ status: "yes", at: 10 });
    const no = applyEmailRsvp(yes, "דני לוי", "no", 20);
    expect(no.emailRsvps["דני לוי"]).toEqual({ status: "no", at: 20 });
    expect(plan.emailRsvps).toBeUndefined();
  });
  it("דוחה תשובה או שם לא תקינים", () => {
    const plan = { iso: "2026-10-08" };
    expect(applyEmailRsvp(plan, "דני", "maybe")).toBeNull();
    expect(applyEmailRsvp(plan, "", "yes")).toBeNull();
    expect(applyEmailRsvp(null, "דני", "yes")).toBeNull();
  });
});

describe("emailRsvpStatus", () => {
  it("משלב אימייל, זימון ותשובה לכל שחקן", () => {
    const base = db();
    base.plan = markEmailInvites(base.plan, [{ name: "אבי כהן", email: "avi@example.com" }], 5);
    base.plan = applyEmailRsvp(base.plan, "אבי כהן", "yes", 6);
    const rows = emailRsvpStatus(base);
    const avi = rows.find((r) => r.name === "אבי כהן");
    expect(avi).toEqual({
      name: "אבי כהן",
      email: "avi@example.com",
      invited: true,
      answer: "yes",
      via: "email",
    });
    const moshe = rows.find((r) => r.name === "משה");
    expect(moshe).toEqual({ name: "משה", email: null, invited: false, answer: null, via: null });
  });

  it("תשובת יומן עדכנית גוברת על תשובת אימייל ישנה", () => {
    const base = db();
    base.plan = applyEmailRsvp(base.plan, "אבי כהן", "yes", 6);
    base.plan.calendarRsvps = { "אבי כהן": { status: "no", at: 10, via: "calendar" } };
    base.plan.calendarEventId = "evt123";
    const rows = emailRsvpStatus(base);
    const avi = rows.find((r) => r.name === "אבי כהן");
    expect(avi.answer).toBe("no");
    expect(avi.via).toBe("calendar");
    expect(avi.invited).toBe(true);
  });

  it("תשובת אימייל עדכנית גוברת על תשובת יומן ישנה", () => {
    const base = db();
    base.plan = applyEmailRsvp(base.plan, "אבי כהן", "yes", 20);
    base.plan.calendarRsvps = { "אבי כהן": { status: "no", at: 10, via: "calendar" } };
    const rows = emailRsvpStatus(base);
    const avi = rows.find((r) => r.name === "אבי כהן");
    expect(avi.answer).toBe("yes");
    expect(avi.via).toBe("email");
  });
});

describe("planSummaryText", () => {
  it("כולל יום, תאריך, שעה ומיקום", () => {
    const text = planSummaryText(db().plan);
    expect(text).toContain("20:30");
    expect(text).toContain("אצל אבי");
    expect(text).toContain("2026");
  });
});

describe("rsvp token", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-for-rsvp";
    delete process.env.RSVP_TOKEN_SECRET;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  const exp = Date.now() + 60_000;
  const args = { groupId: "grp-1", name: "דני לוי", planIso: "2026-10-08", exp };

  it("חותם ומאמת סבב מלא", () => {
    const token = signRsvpToken(args);
    expect(token).toBeTruthy();
    expect(verifyRsvpToken(token)).toEqual({
      groupId: "grp-1",
      name: "דני לוי",
      planIso: "2026-10-08",
      exp,
    });
  });

  it("טוקן של שחקן אחד לא ניתן לשינוי לשחקן אחר (זיוף נשבר)", () => {
    const token = signRsvpToken(args);
    const [part, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ g: "grp-1", n: "אבי", p: "2026-10-08", exp }),
      "utf8"
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyRsvpToken(`${forgedPayload}.${sig}`)).toBeNull();
    expect(verifyRsvpToken(`${part}.${sig}x`)).toBeNull();
    expect(verifyRsvpToken("garbage")).toBeNull();
  });

  it("טוקן שפג נדחה", () => {
    const token = signRsvpToken({ ...args, exp: Date.now() - 1000 });
    expect(verifyRsvpToken(token)).toBeNull();
    const fresh = signRsvpToken(args);
    expect(verifyRsvpToken(fresh, Date.now() + 120_000)).toBeNull();
  });

  it("התפוגה אחרי תאריך הערב", () => {
    expect(rsvpTokenExpiry("2026-10-08")).toBeGreaterThan(Date.parse("2026-10-08T23:59:59+03:00"));
  });

  it("בלי מפתח שרת אין טוקנים", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(signRsvpToken(args)).toBeNull();
    expect(verifyRsvpToken("a.b")).toBeNull();
  });
});

describe("parseEmailImport", () => {
  const tdb = () => ({ roster: ["אבי כהן", "משה לוי", "דנה"], aliases: {} });

  it("מפענח שורות 'שם: email' ומתאים לשחקנים מוכרים", () => {
    const { matched, unmatched, invalid } = parseEmailImport(
      tdb(),
      "אבי כהן: avi@example.com\nמשה לוי: moshe@example.com"
    );
    expect(matched).toEqual([
      { name: "אבי כהן", email: "avi@example.com" },
      { name: "משה לוי", email: "moshe@example.com" },
    ]);
    expect(unmatched).toEqual([]);
    expect(invalid).toEqual([]);
  });

  it("מנרמל כינויים דרך aliases ומתעלם מכפילויות", () => {
    const db = { roster: ["אבי כהן"], aliases: { אבי: "אבי כהן" } };
    const { matched, unmatched } = parseEmailImport(db, "אבי: avi@example.com\nאבי כהן: avi2@example.com");
    expect(matched).toEqual([{ name: "אבי כהן", email: "avi@example.com" }]);
    expect(unmatched).toEqual(["אבי כהן: avi2@example.com"]);
  });

  it("מסווג שורות לא תקינות ושמות לא מוכרים", () => {
    const { matched, unmatched, invalid } = parseEmailImport(
      tdb(),
      "דנה: not-an-email\nזר מוחלט: zar@example.com\nשורה בלי כלום"
    );
    expect(matched).toEqual([]);
    expect(unmatched).toContain("זר מוחלט: zar@example.com");
    expect(unmatched).toContain("שורה בלי כלום");
    expect(invalid).toEqual(["דנה: not-an-email"]);
  });

  it("applyEmailImport שומר את כל הכתובות בבת אחת", () => {
    const next = applyEmailImport(tdb(), [
      { name: "אבי כהן", email: "avi@example.com" },
      { name: "משה לוי", email: "moshe@example.com" },
    ]);
    expect(playerEmail(next, "אבי כהן")).toBe("avi@example.com");
    expect(playerEmail(next, "משה לוי")).toBe("moshe@example.com");
    expect(playerEmail(next, "דנה")).toBeNull();
  });
});
