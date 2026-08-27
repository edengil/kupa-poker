import { describe, it, expect, vi } from "vitest";
import {
  largePlayerGaps,
  nightsWithoutSummary,
  suspiciousAliases,
  buildGapsReport,
  DEFAULT_LARGE_GAP,
} from "../components/poker/gapsBoard.js";
import {
  checkNightBalance,
  confirmSaveIfUnbalanced,
  unbalancedSaveConfirmMessage,
} from "../components/poker/nightBalance.js";

describe("gapsBoard helpers", () => {
  const dbWithGap = {
    aliases: {},
    sessions: [
      {
        id: "a",
        iso: "2025-03-01",
        y: 2025,
        mo: 3,
        d: 1,
        entries: [
          { name: "עדן", amount: 100 },
          { name: "דן", amount: -100 },
        ],
      },
    ],
    yearly: [
      {
        id: "y25",
        y: 2025,
        official: true,
        entries: [
          { name: "עדן", amount: 300 },
          { name: "דן", amount: -300 },
        ],
      },
    ],
  };

  it("largePlayerGaps lists players above threshold", () => {
    const gaps = largePlayerGaps(dbWithGap, { minAbsGap: 50 });
    expect(gaps.map((g) => g.name).sort()).toEqual(["דן ינקלויץ", "עדן גיל"].sort());
    const eden = gaps.find((g) => g.name === "עדן גיל");
    expect(eden.gap).toBe(200);
    expect(eden.absGap).toBe(200);
    expect(eden.sessionsNet).toBe(100);
    expect(eden.tableNet).toBe(300);
  });

  it("largePlayerGaps respects minAbsGap", () => {
    expect(largePlayerGaps(dbWithGap, { minAbsGap: 500 })).toEqual([]);
    expect(largePlayerGaps(dbWithGap, { minAbsGap: DEFAULT_LARGE_GAP }).length).toBe(2);
  });

  it("nightsWithoutSummary uses meta only (no invent)", () => {
    const meta = {
      startOnlyNights: [
        { iso: "2024-01-10", s: 1, lb: 2 },
        { iso: "2025-06-01", s: 3 },
      ],
    };
    const list = nightsWithoutSummary({
      meta,
      sessions: [{ iso: "2025-06-01" }],
    });
    expect(list).toHaveLength(2);
    expect(list[0].iso).toBe("2025-06-01");
    expect(list[0].hasSession).toBe(true);
    expect(list[1].hasSession).toBe(false);
    expect(nightsWithoutSummary({ meta: {}, sessions: [{ iso: "2099-01-01" }] })).toEqual([]);
  });

  it("nightsWithoutSummary respects limit", () => {
    const meta = {
      startOnlyNights: [
        { iso: "2024-01-01", s: 1 },
        { iso: "2024-02-01", s: 2 },
        { iso: "2024-03-01", s: 3 },
      ],
    };
    expect(nightsWithoutSummary({ meta, limit: 2 })).toHaveLength(2);
  });

  it("suspiciousAliases flags identity and chain", () => {
    const issues = suspiciousAliases({
      aliases: {
        "דו": "דו",
        "מיקי": "מייק",
      },
    });
    expect(issues.some((i) => i.kind === "identity" && i.from === "דו")).toBe(true);
    /* מייק → מייקי בברירת מחדל → שרשרת */
    const chain = issues.find((i) => i.kind === "chain" && i.from === "מיקי");
    expect(chain).toBeTruthy();
    expect(chain.via).toBe("מייקי");
  });

  it("suspiciousAliases ignores empty user map", () => {
    expect(suspiciousAliases({ aliases: {} })).toEqual([]);
  });

  it("buildGapsReport aggregates", () => {
    const report = buildGapsReport(dbWithGap, {
      minAbsGap: 50,
      nightLimit: 5,
      meta: { startOnlyNights: [{ iso: "2024-01-01", s: 1 }] },
    });
    expect(report.playerGaps.length).toBe(2);
    expect(report.openNightsTotal).toBe(1);
    expect(report.hasItems).toBe(true);
  });
});

describe("nightBalance", () => {
  it("ok when nets sum to zero", () => {
    const c = checkNightBalance({
      entries: [
        { amount: 50 },
        { amount: -30 },
        { amount: -20 },
      ],
    });
    expect(c.ok).toBe(true);
    expect(c.netGap).toBe(0);
    expect(c.warnings).toEqual([]);
  });

  it("warns on net gap", () => {
    const c = checkNightBalance({
      entries: [
        { amount: 100 },
        { amount: -40 },
      ],
    });
    expect(c.ok).toBe(false);
    expect(c.netGap).toBe(60);
    expect(c.warnings[0]).toMatch(/נטו/);
  });

  it("warns on chips vs pot when provided", () => {
    const c = checkNightBalance({
      entries: [
        { amount: 10 },
        { amount: -10 },
      ],
      cashSumChips: 190,
      potChips: 200,
      cps: 2,
    });
    expect(c.ok).toBe(false);
    expect(c.chipsGap).toBe(-10);
    expect(c.chipsGapShekels).toBe(-5);
    expect(c.warnings.some((w) => w.includes("ג'יטונים"))).toBe(true);
  });

  it("accepts netSum override", () => {
    const c = checkNightBalance({ netSum: 0.001 });
    expect(c.ok).toBe(true);
    const c2 = checkNightBalance({ netSum: 1 });
    expect(c2.ok).toBe(false);
  });

  it("confirmSaveIfUnbalanced asks only when unbalanced", () => {
    const ask = vi.fn(() => true);
    expect(confirmSaveIfUnbalanced({ ok: true, warnings: [] }, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();

    const deny = vi.fn(() => false);
    expect(
      confirmSaveIfUnbalanced({ ok: false, warnings: ["פער"] }, deny)
    ).toBe(false);
    expect(deny).toHaveBeenCalledOnce();
    expect(deny.mock.calls[0][0]).toContain("לא מאוזן");
  });

  it("unbalancedSaveConfirmMessage is Hebrew and actionable", () => {
    const msg = unbalancedSaveConfirmMessage({
      warnings: ["סכום הנטו לא מתאפס — פער פלוס 10₪"],
    });
    expect(msg).toContain("לשמור בכל זאת");
    expect(msg).toContain("לתקן");
  });
});
