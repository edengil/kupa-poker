import { describe, it, expect } from "vitest";
import { buildGoogleCalendarUrl, toCalDateTime, CAL_EVENT_HOURS } from "../lib/poker/calendarInvite.js";

describe("toCalDateTime", () => {
  it("בונה טווח תאריכים מקומי בפורמט גוגל", () => {
    expect(toCalDateTime("2026-10-06", "20:00")).toBe("20261006T200000/20261007T000000");
  });
  it("משתמש ב-20:00 כברירת מחדל כשהשעה חסרה", () => {
    expect(toCalDateTime("2026-10-06", "")).toBe("20261006T200000/20261007T000000");
    expect(toCalDateTime("2026-10-06", null)).toBe("20261006T200000/20261007T000000");
  });
  it("משך האירוע 4 שעות", () => {
    expect(CAL_EVENT_HOURS).toBe(4);
    expect(toCalDateTime("2026-10-06", "21:30")).toBe("20261006T213000/20261007T013000");
  });
  it("מחזיר null על תאריך לא תקין", () => {
    expect(toCalDateTime("", "20:00")).toBeNull();
    expect(toCalDateTime("not-a-date", "20:00")).toBeNull();
    expect(toCalDateTime(null, "20:00")).toBeNull();
  });
});

describe("buildGoogleCalendarUrl", () => {
  const plan = { iso: "2026-10-06", time: "20:00", location: "אצלי", note: "" };
  const emails = ["a@example.com", "b@example.com"];

  it("בונה URL תקין עם כל הפרמטרים", () => {
    const url = buildGoogleCalendarUrl(plan, emails);
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    const u = new URL(url);
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261006T200000/20261007T000000");
    expect(u.searchParams.get("location")).toBe("אצלי");
    expect(u.searchParams.get("add")).toBe("a@example.com,b@example.com");
    expect(u.searchParams.get("text")).toContain("פוקר");
  });
  it("מחזיר null בלי תאריך או בלי אורחים", () => {
    expect(buildGoogleCalendarUrl(null, emails)).toBeNull();
    expect(buildGoogleCalendarUrl(plan, [])).toBeNull();
    expect(buildGoogleCalendarUrl({ ...plan, iso: "" }, emails)).toBeNull();
  });
  it("מסנן כתובות ריקות", () => {
    const url = buildGoogleCalendarUrl(plan, ["a@example.com", "", null]);
    expect(new URL(url).searchParams.get("add")).toBe("a@example.com");
  });
});
