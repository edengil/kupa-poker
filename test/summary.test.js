import { describe, it, expect } from "vitest";
import { dueReports, buildPeriodReport, reportTitle } from "../lib/summary.js";

const keys = (list) => list.map((r) => r.key);

describe("dueReports — self-healing (runs any day, not only the 1st)", () => {
  it("returns last month's report on a mid-month day", () => {
    const now = new Date(2026, 7, 11); // Aug 11
    expect(keys(dueReports(now))).toEqual(["m:2026-07"]);
  });

  it("still returns last month's report on the 1st", () => {
    const now = new Date(2026, 7, 1); // Aug 1
    expect(keys(dueReports(now))).toContain("m:2026-07");
  });

  it("adds the quarterly report in the first month of a quarter", () => {
    const now = new Date(2026, 9, 15); // Oct 15 → month 10
    const k = keys(dueReports(now));
    expect(k).toContain("m:2026-09");
    expect(k).toContain("q:2026-Q3");
  });

  it("adds quarter, half and year in January", () => {
    const now = new Date(2026, 0, 15); // Jan 15
    const k = keys(dueReports(now));
    expect(k).toContain("m:2025-12");
    expect(k).toContain("q:2025-Q4");
    expect(k).toContain("h:2025-H2");
    expect(k).toContain("y:2025");
  });

  it("force=m returns previous month regardless of date", () => {
    const now = new Date(2026, 7, 11);
    expect(keys(dueReports(now, "m"))).toEqual(["m:2026-07"]);
  });
});

describe("buildPeriodReport", () => {
  const data = {
    sessions: [
      { y: 2026, mo: 7, d: 5, entries: [{ name: "עדן", amount: 100 }, { name: "אורן", amount: -100 }] },
      { y: 2026, mo: 7, d: 20, entries: [{ name: "עדן", amount: 50 }, { name: "דן", amount: -50 }] },
    ],
  };

  it("builds a monthly report from in-range sessions", () => {
    const rep = { kind: "m", y: 2026, mo: 7, key: "m:2026-07" };
    const text = buildPeriodReport(data, rep);
    expect(text).toBeTypeOf("string");
    expect(text).toContain("יולי");
    expect(text).toContain("עדן");
  });

  it("returns null when there are no sessions in range", () => {
    const rep = { kind: "m", y: 2026, mo: 6, key: "m:2026-06" };
    expect(buildPeriodReport(data, rep)).toBeNull();
  });
});

describe("reportTitle", () => {
  it("titles each report kind", () => {
    expect(reportTitle({ kind: "m", y: 2026, mo: 7 })).toContain("יולי");
    expect(reportTitle({ kind: "q", y: 2026, q: 3 })).toContain("רבעון 3");
    expect(reportTitle({ kind: "y", y: 2026 })).toContain("2026");
  });
});
