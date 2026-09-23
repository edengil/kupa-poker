import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setPresenceOffline,
  resetPresenceThrottleForTests,
  PRESENCE_THROTTLE_MS,
  sendToGroup,
} from "../lib/whatsapp.js";
import { classifyWhapiSendFailure } from "../lib/whapiErrors.js";
import { buildPlanInviteText, planInviteLabel } from "../lib/planInvite.js";

describe("classifyWhapiSendFailure", () => {
  it("maps trial 402 to whapi_quota with share hint", () => {
    const out = classifyWhapiSendFailure(
      'Whapi send failed (402): {"code":402,"error":"trial version limit exceeded"}'
    );
    expect(out.code).toBe("whapi_quota");
    expect(out.hint).toMatch(/מכסת/);
    expect(out.hint).toMatch(/שתף/);
  });

  it("maps 401 to auth", () => {
    expect(classifyWhapiSendFailure("Whapi send failed (401): nope").code).toBe("whapi_auth");
  });
});

describe("buildPlanInviteText", () => {
  it("builds invite with link and location", () => {
    const text = buildPlanInviteText(
      { iso: "2026-09-23", time: "21:00", location: "אצל עדן · לויתן 4, נתניה · קומה 23, דירה 2303 · קוד בניין #4770#", note: "חניה" },
      { isUpdate: false, baseUrl: "https://kupa-poker.vercel.app", slug: "kupa" }
    );
    expect(text).toContain("ערב פוקר מתוכנן");
    expect(planInviteLabel({ iso: "2026-09-23", time: "21:00" })).toMatch(/21:00/);
    expect(text).toContain("https://kupa-poker.vercel.app/g/kupa");
    expect(text).toContain("📝 הערות: חניה");
    expect(text).toContain("ניווט בווייז:");
  });

  it("uses update head when isUpdate", () => {
    const text = buildPlanInviteText(
      { iso: "2026-09-23", time: "20:00" },
      { isUpdate: true, baseUrl: "https://x.com", slug: "g1" }
    );
    expect(text).toContain("עדכון לערב הפוקר");
  });
});

describe("setPresenceOffline throttle", () => {
  beforeEach(() => {
    resetPresenceThrottleForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetPresenceThrottleForTests();
  });

  it("calls Whapi once then throttles within the window", async () => {
    const a = await setPresenceOffline("tok");
    const b = await setPresenceOffline("tok");
    expect(a.ok).toBe(true);
    expect(b.skipped).toBe("throttled");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/presences/me");
  });

  it("force bypasses throttle", async () => {
    await setPresenceOffline("tok");
    const forced = await setPresenceOffline("tok", { force: true });
    expect(forced.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sendToGroup does not presence-call on every rapid send", async () => {
    fetch.mockImplementation(async (url) => {
      if (String(url).includes("/messages/text")) {
        return { ok: true, status: 200, json: async () => ({ message: { id: "m1" } }), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    });
    await sendToGroup("שלום", { token: "tok", groupId: "g@g.us" });
    await sendToGroup("שלום 2", { token: "tok", groupId: "g@g.us" });
    const presenceCalls = fetch.mock.calls.filter(([u]) => String(u).includes("/presences/me"));
    const sendCalls = fetch.mock.calls.filter(([u]) => String(u).includes("/messages/text"));
    expect(sendCalls).toHaveLength(2);
    expect(presenceCalls).toHaveLength(1);
    expect(PRESENCE_THROTTLE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});
