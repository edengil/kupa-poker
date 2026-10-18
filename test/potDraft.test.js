import { describe, expect, it } from "vitest";
import { effectivePot } from "../lib/liveView";
import { blank } from "../lib/wa/state";

describe("effectivePot — אישור קופת הערב", () => {
  it("בלי עריכה: המחושב, מעוגל לשקלים שלמים", () => {
    expect(effectivePot(42.5, "")).toBe(43);
    expect(effectivePot(70, null)).toBe(70);
    expect(effectivePot(0, undefined)).toBe(0);
  });
  it("עריכת מנהל מנצחת, גם לאפס", () => {
    expect(effectivePot(42.5, "40")).toBe(40);
    expect(effectivePot(42.5, "0")).toBe(0);
    expect(effectivePot(42.5, " 55 ")).toBe(55);
  });
  it("ערך לא תקין נופל למחושב", () => {
    expect(effectivePot(42.5, "abc")).toBe(43);
    expect(effectivePot(42.5, "-5")).toBe(43);
  });
});

describe("blank של הבוט נושא את עריכת הקופה", () => {
  it("potDraft שורד מעבר דרך blank", () => {
    expect(blank({ potDraft: "55" }).potDraft).toBe("55");
    expect(blank({}).potDraft).toBe("");
    expect(blank(null).potDraft).toBe("");
  });
});
