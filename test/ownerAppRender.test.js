import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

/* ============================================================================
   בדיקת רגרסיה לאירוע 24.10 — קריסת עמוד הבעלים.

   שורש האירוע: קומיט ניקוי הלינט 62d902b הכניס קריאת useMemo ל־ShareBar
   שב־OwnerApp בלי להוסיף אותו לייבוא מ־react. כל רינדור של נתיב הבעלים
   המחובר זרק ReferenceError: useMemo is not defined — והעמוד מת באייפון
   (אובחן דרך בילד האבחון ו־diag_events מהמכשיר של עדן; תוקן ב־1c51538).

   למה הבדיקה מרנדרת את ShareBar ולא את כל OwnerApp: סביבת הבדיקות היא
   node בלי DOM, ו־OwnerApp מגיע ל"ready" רק דרך אפקטים אסינכרוניים.
   ShareBar הוא הרכיב שבו ישבה השגיאה והוא מתרנדר אך ורק בנתיב המחובר —
   רינדור־שרת שלו מריץ את גוף הרכיב במלואו, כולל קריאת ה־useMemo, בדיוק
   כמו בנתיב שהתרסק. (הגנת־העומק השנייה לאותה משפחת באגים היא no-undef
   ב־eslint — ראו eslint.config.mjs.)

   הילדים הכבדים של OwnerApp ממוקים ל־null: הם לא נושא הבדיקה, וגרף
   הייבוא שלהם (PokerApp וכל התלויות) לא צריך לרוץ בסביבת node.
   ============================================================================ */

vi.mock("../lib/supabaseClient", () => ({
  getSupabase: () => ({}),
}));

vi.mock("../lib/realtime", () => ({
  createBroadcaster: () => ({ ping() {}, dispose() {} }),
  watchPresence: () => () => {},
}));

vi.mock("../components/PokerApp", () => ({ default: () => null }));
vi.mock("../components/Viewers", () => ({ default: () => null }));
vi.mock("../components/ViewerStats", () => ({ default: () => null }));
vi.mock("../components/InstallButton", () => ({ default: () => null }));
vi.mock("../components/PushPrompt", () => ({ PushPrompt: () => null }));
vi.mock("../components/Rsvp", () => ({ RsvpList: () => null }));
vi.mock("../components/AppErrorBoundary", () => ({
  default: ({ children }) => children,
}));
vi.mock("../components/Logo", () => ({
  EGMark: () => null,
  EGByline: () => null,
  EGSplash: () => "splash",
}));

import OwnerApp, { ShareBar } from "../components/OwnerApp.jsx";

describe("OwnerApp — רינדור נתיב הבעלים (רגרסיית 24.10)", () => {
  it("ShareBar של הבעלים המחובר מתרנדר בלי לזרוק (כולל קריאת ה־useMemo)", () => {
    const el = React.createElement(ShareBar, {
      slug: "testslug123",
      groupId: "group-1",
      supabase: {},
      onSignOut: () => {},
      onSlugChange: () => {},
    });
    let html;
    expect(() => {
      html = renderToString(el);
    }).not.toThrow();
    // סימני היכר של רצועת הבעלים המלאה — לא רק "לא קרס"
    expect(html).toContain("שתף גם היסטוריה לצופים");
    expect(html).toContain("יציאה");
    expect(html).toContain("החלף לינק");
  });

  it("OwnerApp עצמו מתרנדר למצב הפתיחה בלי לזרוק", () => {
    let html;
    expect(() => {
      html = renderToString(React.createElement(OwnerApp));
    }).not.toThrow();
    expect(typeof html).toBe("string");
  });
});
