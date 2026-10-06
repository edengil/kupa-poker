import { describe, it, expect } from "vitest";
import {
  calendarConfigured,
  localDateTime,
  addHours,
} from "../lib/googleCalendar.js";

describe("localDateTime", () => {
  it("בונה מחרוזת מקומית", () => {
    expect(localDateTime("2026-10-06", "20:00")).toBe("2026-10-06T20:00:00");
  });
  it("ברירת מחדל 20:00 כשהשעה לא תקינה", () => {
    expect(localDateTime("2026-10-06", "")).toBe("2026-10-06T20:00:00");
    expect(localDateTime("2026-10-06", "25:99")).toBe("2026-10-06T20:00:00");
  });
});

describe("addHours", () => {
  it("מוסיף 4 שעות וחוצה חצות", () => {
    expect(addHours("2026-10-06T20:00:00", 4)).toBe("2026-10-07T00:00:00");
  });
  it("מחזיר null על קלט לא תקין", () => {
    expect(addHours("not-a-date", 4)).toBeNull();
  });
});

describe("calendarConfigured", () => {
  it("מחזיר boolean (async)", async () => {
    expect(typeof (await calendarConfigured())).toBe("boolean");
  });
  it("false כשאין env ואין DB", async () => {
    // בלי משתני סביבה ובלי groupId — אמור להיות false
    expect(await calendarConfigured(null)).toBe(false);
  });
});
