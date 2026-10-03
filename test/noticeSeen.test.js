import { describe, expect, it } from "vitest";
import {
  loadSeenIds,
  markSeenIds,
  saveSeenIds,
  seenKey,
  unseenNotices,
} from "../lib/noticeSeen.js";

/** אחסון מזויף להזרקה — בלי תלות בדפדפן. */
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

describe("noticeSeen — מפתח לפי צופה", () => {
  it("מפתח נפרד לכל צופה, עם נפילה ל־anon", () => {
    expect(seenKey("אבי")).toBe("kupa:notices:seen:אבי");
    expect(seenKey(null)).toBe("kupa:notices:seen:anon");
    expect(seenKey("")).toBe("kupa:notices:seen:anon");
  });
});

describe("loadSeenIds / saveSeenIds", () => {
  it("[] כשהאחסון ריק או חסר", () => {
    expect(loadSeenIds(memStore(), "אבי")).toEqual([]);
    expect(loadSeenIds(null, "אבי")).toEqual([]);
  });

  it("[] כשהתוכן פגום או לא מערך", () => {
    expect(loadSeenIds(memStore({ "kupa:notices:seen:אבי": "לא ג'ייסון" }), "אבי")).toEqual([]);
    expect(loadSeenIds(memStore({ "kupa:notices:seen:אבי": '{"a":1}' }), "אבי")).toEqual([]);
  });

  it("מסנן החוצה ערכים שאינם מחרוזות", () => {
    const s = memStore({ "kupa:notices:seen:אבי": JSON.stringify(["a", 5, null, "b"]) });
    expect(loadSeenIds(s, "אבי")).toEqual(["a", "b"]);
  });

  it("שמירה וטעינה עגולה, בלי כפילויות", () => {
    const s = memStore();
    saveSeenIds(s, "אבי", ["a", "b", "a"]);
    expect(loadSeenIds(s, "אבי")).toEqual(["a", "b"]);
    expect(s._data["kupa:notices:seen:אבי"]).toBe(JSON.stringify(["a", "b"]));
  });

  it("צופים שונים לא דורסים זה את זה", () => {
    const s = memStore();
    saveSeenIds(s, "אבי", ["a"]);
    saveSeenIds(s, "משה", ["b"]);
    expect(loadSeenIds(s, "אבי")).toEqual(["a"]);
    expect(loadSeenIds(s, "משה")).toEqual(["b"]);
  });

  it("שמירה לא מפילה כשהאחסון זורק", () => {
    const bad = {
      getItem: () => null,
      setItem: () => {
        throw new Error("מלא");
      },
    };
    expect(() => saveSeenIds(bad, "אבי", ["a"])).not.toThrow();
  });
});

describe("unseenNotices", () => {
  const notices = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("הכל לא־נצפה כשאין נצפים", () => {
    expect(unseenNotices(notices, []).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("מסנן נצפים", () => {
    expect(unseenNotices(notices, ["a", "c"]).map((n) => n.id)).toEqual(["b"]);
  });

  it("רשימה ריקה כשאין התראות", () => {
    expect(unseenNotices([], ["a"])).toEqual([]);
    expect(unseenNotices(null, ["a"])).toEqual([]);
  });
});

describe("markSeenIds", () => {
  it("מוסיף חדשים ומדווח changed", () => {
    const { ids, changed } = markSeenIds(["a"], ["a", "b"]);
    expect(changed).toBe(true);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("changed=false כשאין חדש", () => {
    const { ids, changed } = markSeenIds(["a", "b"], ["a"]);
    expect(changed).toBe(false);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("מתעלם מערכים לא־מחרוזתיים", () => {
    const { ids } = markSeenIds([], [null, 5, "x"]);
    expect(ids).toEqual(["x"]);
  });
});
