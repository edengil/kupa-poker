import { describe, expect, it } from "vitest";
import { normalizePlayerPhone, playerPhone, setPlayerPhone } from "../lib/poker/phones";

describe("normalizePlayerPhone", () => {
  it("מקבל נייד ישראלי ומחזיר ספרות בלבד", () => {
    expect(normalizePlayerPhone("052-1234567")).toBe("0521234567");
    expect(normalizePlayerPhone("052 123 4567")).toBe("0521234567");
    expect(normalizePlayerPhone("0521234567")).toBe("0521234567");
  });
  it("ממיר קידומת בינלאומית למקומית", () => {
    expect(normalizePlayerPhone("+972-52-1234567")).toBe("0521234567");
    expect(normalizePlayerPhone("972521234567")).toBe("0521234567");
  });
  it("דוחה מספרים לא תקינים", () => {
    expect(normalizePlayerPhone("")).toBeNull();
    expect(normalizePlayerPhone(null)).toBeNull();
    expect(normalizePlayerPhone("12345")).toBeNull();
    expect(normalizePlayerPhone("05212345678")).toBeNull();
    expect(normalizePlayerPhone("abc")).toBeNull();
  });
});

describe("playerPhone + setPlayerPhone", () => {
  const db = { aliases: {}, phones: { "אופיר סנה": "0521234567" }, sessions: [] };
  it("קורא לפי שם קנוני", () => {
    expect(playerPhone(db, "אופיר סנה")).toBe("0521234567");
    expect(playerPhone(db, "קובי סעדה")).toBeNull();
    expect(playerPhone(null, "אופיר סנה")).toBeNull();
  });
  it("שומר מנורמל ומוחק על ריק, בלי לשנות את המקור", () => {
    const next = setPlayerPhone(db, "קובי סעדה", "+972-50-7654321");
    expect(next.phones["קובי סעדה"]).toBe("0507654321");
    expect(db.phones["קובי סעדה"]).toBeUndefined();
    const cleared = setPlayerPhone(next, "קובי סעדה", "");
    expect(cleared.phones["קובי סעדה"]).toBeUndefined();
  });
  it("ערך לא תקין מוחק כמו ריק", () => {
    const next = setPlayerPhone(db, "אופיר סנה", "123");
    expect(next.phones["אופיר סנה"]).toBeUndefined();
  });
});
