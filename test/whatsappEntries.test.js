import { describe, it, expect } from "vitest";
import {
  parsePlayerLine,
  parseWhatsAppMessages,
  snapshotFromMessage,
  buildEntryTimings,
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
