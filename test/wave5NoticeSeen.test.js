import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  loadSeenIds,
  markSeenIds,
  saveSeenIds,
  seenKey,
  unseenNotices,
} from "../lib/noticeSeen.js";
import { NotificationsSheet } from "../components/poker/NotificationsSheet.jsx";

/* ============================================================================
   גל 5, פריט 5.2: באדג' ו־seen מדויקים —
   (א) מפתח seen כולל רכיב קבוצה: אין דיכוי חוצה־קבוצות.
   (ב) רק פריטים שהוצגו בפועל מסומנים: פתיחה חלקית משאירה באדג'.
   ============================================================================ */

const memStore = (seed = {}) => {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
};

describe("5.2 — מפתח seen עם רכיב קבוצה", () => {
  it("קבוצות שונות — מפתחות שונים; בלי groupId נשמר פורמט המורשת", () => {
    expect(seenKey("אבי", "g1")).toBe("kupa:notices:seen:g1:אבי");
    expect(seenKey("אבי", "g2")).toBe("kupa:notices:seen:g2:אבי");
    expect(seenKey("אבי", "g1")).not.toBe(seenKey("אבי", "g2"));
    expect(seenKey("אבי")).toBe("kupa:notices:seen:אבי");
    expect(seenKey(null, "g1")).toBe("kupa:notices:seen:g1:anon");
  });

  it("אותו id שנצפה בקבוצה אחת לא מדכא את הבאדג' בקבוצה אחרת", () => {
    const s = memStore();
    const sharedId = "summary:2026-10:אבי לוי"; // id שיכול להתנגש בין קבוצות
    saveSeenIds(s, "אבי", [sharedId], "g1");
    expect(loadSeenIds(s, "אבי", "g1")).toEqual([sharedId]);
    expect(loadSeenIds(s, "אבי", "g2")).toEqual([]);
    /* ובמונחי באדג': בקבוצה השנייה הפריט עדיין לא־נצפה */
    expect(unseenNotices([{ id: sharedId }], loadSeenIds(s, "אבי", "g2"))).toHaveLength(1);
    expect(unseenNotices([{ id: sharedId }], loadSeenIds(s, "אבי", "g1"))).toHaveLength(0);
  });
});

describe("5.2 — סימון רק של מה שהוצג בפועל", () => {
  const notices = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("פתיחה חלקית: רק המוצגים מסומנים, הבאדג' נשאר על השאר", () => {
    /* המגירה מדווחת רק את שני הפריטים הראשונים (השאר מתחת לקפל) */
    const { ids, changed } = markSeenIds([], ["a", "b"]);
    expect(changed).toBe(true);
    expect(unseenNotices(notices, ids).map((n) => n.id)).toEqual(["c", "d"]);
  });

  it("גלילה שחושפת את השאר מאפסת את הבאדג'", () => {
    const first = markSeenIds([], ["a", "b"]);
    const second = markSeenIds(first.ids, ["c", "d"]);
    expect(unseenNotices(notices, second.ids)).toEqual([]);
  });

  it("המגירה נושאת data-notice-id לכל פריט (חוזה דיווח הנראות)", () => {
    const html = renderToString(
      React.createElement(NotificationsSheet, {
        items: [
          { id: "n1", kind: "transfer", title: "העברה ממתינה", body: "x", canMark: false },
          { id: "n2", kind: "plan", title: "ערב מתוכנן", body: "y", canMark: false },
        ],
        onClose: () => {},
        onMark: null,
        onVisible: () => {},
      })
    );
    expect(html).toContain('data-notice-id="n1"');
    expect(html).toContain('data-notice-id="n2"');
  });
});
