import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getSessionWithTimeout, SESSION_TIMEOUT_MS } from "../lib/sessionTimeout.js";
import { hasAuthError, AUTH_ERROR_MESSAGE } from "../lib/authError.js";

/* ============================================================================
   רגרסיית פריט 1.5 (ממצא ו-28/D7) — סשן פג לא מציג מסך בעלים מהמטמון:
   - אפקט ה־boot של OwnerApp בודק signedOut בגוף (נעילה סטטית).
   - PublicApp עבר ל־getSessionWithTimeout המשותף (נעילה סטטית + יחידה).
   - ‎?error=auth נקרא ומציג כשל התחברות (יחידה + רינדור של שני מסכי
     ההתחברות עם/בלי failed).
   סביבת הבדיקות היא node בלי DOM — בדיקות ההתנהגות הן על העזרים הטהורים
   ועל רינדור־שרת של מסכי ההתחברות; שער ה־boot ננעל סטטית על המקור.
   ============================================================================ */

vi.mock("../lib/supabaseClient", () => ({
  getSupabase: () => ({}),
}));

vi.mock("../lib/realtime", () => ({
  createBroadcaster: () => ({ ping() {}, dispose() {} }),
  watchPresence: () => () => {},
  subscribeToGroup: () => () => {},
  fetchSnapshot: async () => null,
  joinPresence: () => () => {},
  logView: async () => null,
  trackVisit: () => ({ stop() {}, onTab() {} }),
}));

vi.mock("../components/PokerApp", () => ({
  default: () => null,
  PokerTable: () => null,
}));
vi.mock("../components/Viewers", () => ({ default: () => null }));
vi.mock("../components/ViewerStats", () => ({ default: () => null }));
vi.mock("../components/InstallButton", () => ({ default: () => null }));
vi.mock("../components/PushPrompt", () => ({ PushPrompt: () => null }));
vi.mock("../components/Rsvp", () => ({ RsvpList: () => null, RsvpCard: () => null }));
vi.mock("../components/AppErrorBoundary", () => ({
  default: ({ children }) => children,
}));
vi.mock("../components/Logo", () => ({
  EGMark: () => null,
  EGByline: () => null,
  EGSplash: () => "splash",
}));

import { SignIn as OwnerSignIn } from "../components/OwnerApp.jsx";
import { SignIn as ViewerSignIn } from "../components/PublicApp.jsx";

const fakeSupabase = (getSession) => ({ auth: { getSession } });

describe("getSessionWithTimeout — יחידה", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("סשן קיים → מחזיר אותו, timedOut=false", async () => {
    const session = { user: { id: "u1" } };
    const sb = fakeSupabase(async () => ({ data: { session } }));
    await expect(getSessionWithTimeout(sb, 1000)).resolves.toEqual({
      data: { session },
      timedOut: false,
    });
  });

  it("אין סשן (תשובה אמיתית) → session=null עם timedOut=false", async () => {
    const sb = fakeSupabase(async () => ({ data: { session: null } }));
    await expect(getSessionWithTimeout(sb, 1000)).resolves.toEqual({
      data: { session: null },
      timedOut: false,
    });
  });

  it("getSession נתקע (ספארי) → timedOut=true, לא סשן־null מזויף", async () => {
    const sb = fakeSupabase(() => new Promise(() => {}));
    const p = getSessionWithTimeout(sb, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ data: { session: null }, timedOut: true });
  });

  it("getSession זורק → session=null עם timedOut=false (כשל אמיתי, לא timeout)", async () => {
    const sb = fakeSupabase(async () => {
      throw new Error("auth down");
    });
    await expect(getSessionWithTimeout(sb, 1000)).resolves.toEqual({
      data: { session: null },
      timedOut: false,
    });
  });

  it("ברירת המחדל היא 4000ms של ניסוי H", () => {
    expect(SESSION_TIMEOUT_MS).toBe(4000);
  });
});

describe("hasAuthError — יחידה", () => {
  it("‎?error=auth → true", () => {
    expect(hasAuthError("?error=auth")).toBe(true);
    expect(hasAuthError(new URLSearchParams("error=auth"))).toBe(true);
  });

  it("בלי הפרמטר / ערך אחר / קלט ריק → false", () => {
    expect(hasAuthError("")).toBe(false);
    expect(hasAuthError("?next=/g/x")).toBe(false);
    expect(hasAuthError("?error=other")).toBe(false);
    expect(hasAuthError(null)).toBe(false);
    expect(hasAuthError(undefined)).toBe(false);
  });
});

describe("מסכי התחברות — כשל התחברות מוצג, לא שקט (רינדור)", () => {
  it("OwnerApp: עם failed מוצגת הודעת הכשל; בלעדיו — לא", () => {
    const withFail = renderToString(
      React.createElement(OwnerSignIn, { onSignIn: () => {}, failed: true })
    );
    expect(withFail).toContain(AUTH_ERROR_MESSAGE);
    const plain = renderToString(React.createElement(OwnerSignIn, { onSignIn: () => {} }));
    expect(plain).not.toContain(AUTH_ERROR_MESSAGE);
    expect(plain).toContain("התחברות עם Google");
  });

  it("PublicApp: עם failed מוצגת הודעת הכשל; בלעדיו — לא", () => {
    const withFail = renderToString(
      React.createElement(ViewerSignIn, { onSignIn: () => {}, failed: true })
    );
    expect(withFail).toContain(AUTH_ERROR_MESSAGE);
    const plain = renderToString(React.createElement(ViewerSignIn, { onSignIn: () => {} }));
    expect(plain).not.toContain(AUTH_ERROR_MESSAGE);
    expect(plain).toContain("התחברות עם Google");
  });
});

describe("חיווט — נעילות סטטיות על המקור", () => {
  const ownerSrc = readFileSync(new URL("../components/OwnerApp.jsx", import.meta.url), "utf8");
  /* גל 8 (8.2): אפקט ה־boot חולץ מ־OwnerApp ל־useGroupBoot — נעלי השער
     נבדקות מול מקור ה־hook, באותו סדר ובאותן מחרוזות. */
  const bootSrc = readFileSync(new URL("../components/useGroupBoot.js", import.meta.url), "utf8");
  const publicSrc = readFileSync(new URL("../components/PublicApp.jsx", import.meta.url), "utf8");

  it("אפקט ה־boot של OwnerApp בודק signedOut בגוף — לפני כל עלייה מהמטמון", () => {
    expect(bootSrc).toContain("if (signedOut) return;");
    const gateAt = bootSrc.indexOf("if (signedOut) return;");
    const cacheBootAt = bootSrc.indexOf("if (cachedRow?.id && cachedRow?.slug)");
    expect(gateAt).toBeGreaterThan(-1);
    expect(cacheBootAt).toBeGreaterThan(gateAt);
  });

  it("OwnerApp ו־PublicApp חולקים את getSessionWithTimeout מהמודול המשותף", () => {
    /* גל 8 (8.3): הייבואים ל־lib עברו לכינוי @/lib — הנעילה בודקת את הצורה הקנונית. */
    expect(ownerSrc).toContain('from "@/lib/sessionTimeout"');
    expect(publicSrc).toContain('from "@/lib/sessionTimeout"');
    expect(publicSrc).toContain("getSessionWithTimeout(supabase)");
    /* הקריאה הגולמית שהייתה נתקעת בספארי כבר לא קיימת באפקט הצופה */
    expect(publicSrc).not.toContain("await supabase.auth.getSession()");
  });

  it("שני המשטחים קוראים את ‎?error=auth ומעבירים failed למסך ההתחברות", () => {
    expect(ownerSrc).toContain("hasAuthError(window.location.search)");
    expect(publicSrc).toContain("hasAuthError(window.location.search)");
  });

  it("ב־PublicApp timeout של סשן לא הופך ל־signedOut", () => {
    expect(publicSrc).toContain("if (timedOut) return;");
  });
});
