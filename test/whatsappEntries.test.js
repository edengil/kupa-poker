import { describe, it, expect } from "vitest";
import {
  parsePlayerLine,
  parseWhatsAppMessages,
  snapshotFromMessage,
  buildEntryTimings,
  buildNightSpans,
  settlementKind,
  isPeriodSummary,
  canonChatName,
} from "../scripts/parse-whatsapp-entries.mjs";

describe("parsePlayerLine", () => {
  it("reads a bit line and a cash+bit split", () => {
    expect(parsePlayerLine("עדן 50 ביט")).toEqual({ name: "עדן גיל", amount: 50 });
    expect(parsePlayerLine("עדן 50 מזומן 20 בביט")).toEqual({ name: "עדן גיל", amount: 70 });
  });

  it("skips settlement and verb lines", () => {
    expect(parsePlayerLine("דן מגיע 50₪")).toBeNull();
    expect(parsePlayerLine("אברהם העביר 50 ביט")).toBeNull();
    expect(parsePlayerLine("נתנאל לקח 50 ביט")).toBeNull();
  });
});

describe("canonChatName", () => {
  it("maps short names and typos", () => {
    expect(canonChatName("נתנאל")).toBe("נתנאל כהן");
    expect(canonChatName("דן וייסמן")).toBe("דן ויסמן");
  });
});

describe("buildEntryTimings", () => {
  it("diffs cumulative ledgers into buy-in events without inventing times", () => {
    const text = [
      "[20.9.2025, 21:00:00] Eden Gil: נתנאל 50 ביט",
      "אופיר 50 ביט",
      "עדן 50 ביט",
      "[20.9.2025, 21:40:00] Eden Gil: נתנאל 50 ביט",
      "אופיר 100 ביט",
      "עדן 50 ביט",
    ].join("\n");
    const { meta, nights } = buildEntryTimings(parseWhatsAppMessages(text));
    expect(meta.snapshots).toBe(2);
    expect(nights["אופיר סנה"]["2025-09-20"].n).toBe(2);
    expect(nights["אופיר סנה"]["2025-09-20"].a).toEqual([50, 50]);
    expect(nights["אופיר סנה"]["2025-09-20"].t).toHaveLength(2);
    expect(nights["עדן גיל"]["2025-09-20"].a).toEqual([50]);
  });

  it("treats a bot report as a snapshot", () => {
    const msg = {
      text: "🤖\n20/09/2025\n🕐 התחלנו 21:00 · 40 דק׳ במשחק\n\nעדן גיל 100 ביט\nאופיר סנה 50 ביט",
      at: 1,
      y: 2025,
      mo: 9,
      d: 20,
      h: 21,
    };
    const snap = snapshotFromMessage(msg);
    expect(snap.totals["עדן גיל"]).toBe(100);
    expect(snap.totals["אופיר סנה"]).toBe(50);
  });
});

describe("night start/end from chat", () => {
  it("treats סיכום פוקר D.M as a night end, not a monthly summary", () => {
    expect(isPeriodSummary("סיכום פוקר - מרץ 2026\nנתנאל: 805+")).toBe(true);
    expect(settlementKind("סיכום פוקר - מרץ 2026\nנתנאל: 805+")).toBe(0);
    expect(settlementKind("סיכום פוקר 17.6\nעדן מגיע 135\nאופיר מגיע 42\nנתנאל חייב 74")).toBe(3);
    expect(
      settlementKind("עדן 150 ביט\nאורן 170 ביט\n\nפריצי מגיע 14\nנתנאל מגיע 170\nשגיא מגיע 75")
    ).toBe(2);
  });

  it("pairs first buy-in list with later settlement; keeps start-only without inventing end", () => {
    const text = [
      "[4.6.2024, 21:21:00] Eden Gil: עדן 50 ביט",
      "אורן 50 ביט",
      "אופיר 50 ביט",
      "[5.6.2024, 2:12:00] Eden Gil: סיכום פוקר 4.6",
      "עדן מגיע 40",
      "אורן מגיעה 20",
      "אופיר חייב 60",
      "[10.6.2024, 21:00:00] Eden Gil: עדן 50 ביט",
      "אורן 50 ביט",
    ].join("\n");
    const { meta, spans } = buildNightSpans(parseWhatsAppMessages(text));
    expect(spans["2024-06-04"]).toBeTruthy();
    expect(spans["2024-06-04"].e - spans["2024-06-04"].s).toBeGreaterThan(4 * 3600 * 1000);
    expect(spans["2024-06-10"].s).toBeTruthy();
    expect(spans["2024-06-10"].e).toBeUndefined();
    expect(meta.complete).toBe(1);
    expect(meta.startOnly).toBe(1);
  });

  it("does not treat מגיע/חייב without the word סיכום as a night end", () => {
    const text = [
      "[21.4.2025, 21:37:00] Eden Gil: נתנאל 50 ביט",
      "אופיר 50 ביט",
      "קובי 50 ביט",
      "[22.4.2025, 1:20:04] נתנאל כהן: דור חייב 20",
      "עידן חייב 100",
      "קובי מגיע 200",
      "נתנאל חייב 80",
    ].join("\n");
    const { meta, spans } = buildNightSpans(parseWhatsAppMessages(text));
    expect(spans["2025-04-21"].e).toBeUndefined();
    expect(spans["2025-04-21"].n2).toBeTruthy();
    expect(meta.complete).toBe(0);
    expect(meta.startOnly).toBe(1);
    expect(meta.netsWithoutSummary).toHaveLength(1);
    expect(meta.netsWithoutSummary[0].iso).toBe("2025-04-21");
  });
});
