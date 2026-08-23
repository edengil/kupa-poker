import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BOT_MARK } from "../lib/botMark.js";
import {
  normalizePins,
  extractSentMessageId,
  isNightShareText,
  nightIsoFromText,
  pinTypeForReportKind,
  pickUnpinVictim,
  unpinOrderFor,
  slotsToReplace,
  setPinSlot,
  clearPinSlot,
  ensurePin,
  PIN_RANK,
} from "../lib/waPins.js";

describe("pin priority", () => {
  it("ranks year > month > night", () => {
    expect(PIN_RANK.year).toBeGreaterThan(PIN_RANK.month);
    expect(PIN_RANK.month).toBeGreaterThan(PIN_RANK.night);
  });

  it("unpin order for month frees night only", () => {
    expect(unpinOrderFor("month")).toEqual(["night"]);
  });

  it("unpin order for year frees night then month", () => {
    expect(unpinOrderFor("year")).toEqual(["night", "month"]);
  });

  it("unpin order for night is empty — never frees month/year", () => {
    expect(unpinOrderFor("night")).toEqual([]);
  });

  it("pickUnpinVictim prefers night over month for year", () => {
    const pins = {
      night: { messageId: "n1", iso: "2026-08-20" },
      month: { messageId: "m1", key: "m:2026-07" },
      year: { messageId: "y1", key: "y:2025" },
    };
    expect(pickUnpinVictim(pins, "year")).toBe("night");
  });

  it("pickUnpinVictim returns null when pinning night with only month/year", () => {
    const pins = {
      month: { messageId: "m1", key: "m:2026-07" },
      year: { messageId: "y1", key: "y:2025" },
    };
    expect(pickUnpinVictim(pins, "night")).toBeNull();
  });

  it("pickUnpinVictim for month returns night", () => {
    const pins = {
      night: { messageId: "n1", iso: "2026-08-20" },
      year: { messageId: "y1", key: "y:2025" },
    };
    expect(pickUnpinVictim(pins, "month")).toBe("night");
  });
});

describe("pin state helpers", () => {
  it("normalizePins drops empty slots", () => {
    expect(normalizePins({ night: { messageId: "x" }, month: {} })).toEqual({
      night: { messageId: "x" },
    });
  });

  it("slotsToReplace night always replaces previous night", () => {
    expect(slotsToReplace("night", { night: { messageId: "old", iso: "2026-08-01" } })).toEqual([
      "night",
    ]);
  });

  it("set/clear pin slots", () => {
    let p = setPinSlot({}, "month", { messageId: "m1", key: "m:2026-07" });
    expect(p.month.messageId).toBe("m1");
    p = clearPinSlot(p, "month");
    expect(p.month).toBeUndefined();
  });

  it("extractSentMessageId reads nested message.id", () => {
    expect(extractSentMessageId({ sent: true, message: { id: "abc-def" } })).toBe("abc-def");
    expect(extractSentMessageId({})).toBeNull();
  });
});

describe("classify share / report", () => {
  it("detects night poker summary", () => {
    expect(isNightShareText(`${BOT_MARK} סיכום פוקר 20.8\nעדן מגיע 100`)).toBe(true);
  });

  it("detects tip block and settlement", () => {
    expect(isNightShareText(`${BOT_MARK} 💸 טיפים הערב\n...`)).toBe(true);
    expect(isNightShareText(`${BOT_MARK} יום א׳ 20.8 · חלוקה\nדן מעביר 50 לעדן`)).toBe(true);
    expect(isNightShareText(`${BOT_MARK} חשבון סופי · קופה 500₪`)).toBe(true);
  });

  it("rejects plain bot chatter", () => {
    expect(isNightShareText(`${BOT_MARK} הבוט פעיל`)).toBe(false);
    expect(isNightShareText("סיכום פוקר בלי סימן")).toBe(false);
  });

  it("parses night iso from summary head", () => {
    expect(nightIsoFromText(`${BOT_MARK} סיכום פוקר 20.8\nx`, new Date("2026-08-23T12:00:00Z"))).toBe(
      "2026-08-20"
    );
  });

  it("maps report kinds", () => {
    expect(pinTypeForReportKind("y")).toBe("year");
    expect(pinTypeForReportKind("m")).toBe("month");
    expect(pinTypeForReportKind("q")).toBe("month");
    expect(pinTypeForReportKind("h")).toBe("month");
  });
});

describe("ensurePin", () => {
  const token = "tok";
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins and updates state", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "" });
    const saved = [];
    const out = await ensurePin("night", "msg-1", { iso: "2026-08-20" }, {
      token,
      pins: {},
      savePins: async (p) => saved.push(p),
    });
    expect(out.ok).toBe(true);
    expect(out.pins.night.messageId).toBe("msg-1");
    expect(saved[0].night.messageId).toBe("msg-1");
    expect(fetchMock.mock.calls[0][0]).toContain("/messages/msg-1/pin");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("unpins previous night before pinning new", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: async () => "" }) // unpin old
      .mockResolvedValueOnce({ ok: true, text: async () => "" }); // pin new
    const out = await ensurePin("night", "msg-2", { iso: "2026-08-20" }, {
      token,
      pins: { night: { messageId: "msg-1", iso: "2026-08-20" } },
    });
    expect(out.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[0][0]).toContain("msg-1");
    expect(out.pins.night.messageId).toBe("msg-2");
  });

  it("on limit frees night before pinning month — never year", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => "pin limit" })
      .mockResolvedValueOnce({ ok: true, text: async () => "" }) // unpin night
      .mockResolvedValueOnce({ ok: true, text: async () => "" }); // retry pin
    const out = await ensurePin("month", "msg-m", { key: "m:2026-07" }, {
      token,
      pins: {
        night: { messageId: "msg-n", iso: "2026-08-01" },
        year: { messageId: "msg-y", key: "y:2025" },
      },
    });
    expect(out.ok).toBe(true);
    expect(out.pins.night).toBeUndefined();
    expect(out.pins.year.messageId).toBe("msg-y");
    expect(out.pins.month.messageId).toBe("msg-m");
  });

  it("logs and returns when no admin — does not throw", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "auth" });
    const out = await ensurePin("year", "msg-y", { key: "y:2025" }, { token, pins: {} });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("no admin");
  });

  it("refuses to unpin month/year to make room for night", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "limit" });
    const out = await ensurePin("night", "msg-n", { iso: "2026-08-20" }, {
      token,
      pins: {
        month: { messageId: "m1", key: "m:2026-07" },
        year: { messageId: "y1", key: "y:2025" },
      },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("limit");
    expect(out.pins.month.messageId).toBe("m1");
    expect(out.pins.year.messageId).toBe("y1");
    // only one fetch — pin attempt, no DELETE
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
