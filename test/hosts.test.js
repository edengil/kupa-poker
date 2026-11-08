import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseHosts,
  hostsFromEnv,
  setHosts,
  getHosts,
  hostBySlug,
  hostFromLocation,
  hostPlayerFromLocation,
  siteBaseUrl,
  wazeQueryFromLocation,
  wazeNavigateUrl,
  wazeShortUrl,
  planShareLocationLines,
} from "../lib/poker/hosts.js";

/* גל 4ב (ממצא 17): המארחים מגיעים ממקור ההגדרות (KUPA_HOSTS_JSON), לא
   מקבוע בקוד. הבדיקות כאן עובדות על נתוני דוגמה בדיוניים בלבד — כתובות
   וקודים אמיתיים לא חיים יותר בריפו, גם לא בבדיקות. */
const FIXTURE_HOSTS = [
  { slug: "dani", label: "דני", text: "אצל דני · הפרחים 3, עיר הדוגמה · קומה 4, דירה 12 · קוד בניין #1234#" },
  { slug: "noa", label: "נועה לוי", text: "אצל נועה לוי · הים 8, עיר הדוגמה · קומת קרקע" },
  { slug: "omer", label: "עומר", text: "אצל עומר · ההר 21, מושב לדוגמה · קומה 1, דירה 2 · קוד בניין 98765" },
];

const originalEnv = process.env.KUPA_HOSTS_JSON;
afterEach(() => {
  if (originalEnv === undefined) delete process.env.KUPA_HOSTS_JSON;
  else process.env.KUPA_HOSTS_JSON = originalEnv;
});

describe("parseHosts / hostsFromEnv — מקור ההגדרות", () => {
  it("parses a JSON string and a plain array identically", () => {
    expect(parseHosts(JSON.stringify(FIXTURE_HOSTS))).toEqual(FIXTURE_HOSTS);
    expect(parseHosts(FIXTURE_HOSTS)).toEqual(FIXTURE_HOSTS);
  });

  it("reads KUPA_HOSTS_JSON from the environment", () => {
    process.env.KUPA_HOSTS_JSON = JSON.stringify(FIXTURE_HOSTS);
    expect(hostsFromEnv()).toEqual(FIXTURE_HOSTS);
  });

  it("returns [] for unset, malformed or non-array sources", () => {
    delete process.env.KUPA_HOSTS_JSON;
    expect(hostsFromEnv()).toEqual([]);
    expect(parseHosts("{not json")).toEqual([]);
    expect(parseHosts("42")).toEqual([]);
    expect(parseHosts(undefined)).toEqual([]);
    expect(parseHosts(null)).toEqual([]);
  });

  it("drops malformed entries and duplicate slugs (first wins)", () => {
    const messy = [
      { slug: "dani", label: "דני", text: "אצל דני · הפרחים 3, עיר הדוגמה" },
      { slug: "DANI", label: "כפול", text: "אצל כפול · אחר 1, עיר" },
      { slug: "", label: "בלי slug", text: "אצל בלי · אחר 2, עיר" },
      { slug: "x", label: "בלי טקסט" },
      "not-an-object",
      null,
    ];
    expect(parseHosts(messy)).toEqual([
      { slug: "dani", label: "דני", text: "אצל דני · הפרחים 3, עיר הדוגמה" },
    ]);
  });
});

describe("hosts from the settings source — identical behavior when defined", () => {
  beforeEach(() => setHosts(FIXTURE_HOSTS));

  it("exposes the injected list via getHosts with unique slugs", () => {
    const hosts = getHosts();
    expect(hosts).toHaveLength(3);
    const slugs = hosts.map((h) => h.slug);
    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps street and door code on the host text", () => {
    const h = getHosts().find((x) => x.label === "עומר");
    expect(h.text).toContain("ההר 21");
    expect(h.text).toContain("98765");
  });

  it("marks a ground-floor host without a building code", () => {
    const h = getHosts().find((x) => x.label === "נועה לוי");
    expect(h.text).not.toMatch(/קוד/);
    expect(wazeQueryFromLocation(h.text)).toBe("הים 8, עיר הדוגמה");
  });

  it("hostBySlug is case-insensitive and rejects unknown slugs", () => {
    expect(hostBySlug("DANI")?.slug).toBe("dani");
    expect(hostBySlug("nobody")).toBeNull();
    expect(hostBySlug("")).toBeNull();
  });

  it("hostBySlug → waze strips floor and code from the query", () => {
    const h = hostBySlug("dani");
    expect(wazeQueryFromLocation(h.text)).toBe("הפרחים 3, עיר הדוגמה");
    expect(wazeNavigateUrl(h.text)).toBe(
      "https://waze.com/ul?q=" + encodeURIComponent("הפרחים 3, עיר הדוגמה") + "&navigate=yes"
    );
  });

  it("hostFromLocation matches the full text and the אצל-head", () => {
    expect(hostFromLocation(FIXTURE_HOSTS[0].text)?.slug).toBe("dani");
    expect(hostFromLocation("אצל דני · משהו אחר לגמרי")?.slug).toBe("dani");
    expect(hostFromLocation("אצל זר · רחוב 1, עיר")).toBeNull();
    expect(hostFromLocation("")).toBeNull();
  });

  it("hostPlayerFromLocation resolves through the label map", () => {
    setHosts([{ slug: "pal", label: "איציק", text: "אצל איציק · הרחוב 1, עיר הדוגמה · קוד בניין 1111" }]);
    expect(hostPlayerFromLocation("אצל איציק · הרחוב 1, עיר הדוגמה · קוד בניין 1111")).toBe("איציק תפילין");
  });

  it("emits a short site URL for known hosts", () => {
    const url = wazeShortUrl(FIXTURE_HOSTS[0].text);
    expect(url).toBe(`${siteBaseUrl()}/w/dani`);
    expect(url.length).toBeLessThan(50);
  });

  it("puts the short Waze URL on its own line in share text", () => {
    const lines = planShareLocationLines(FIXTURE_HOSTS[2].text);
    expect(lines[0]).toMatch(/^📍 /);
    expect(lines[1]).toBe("ניווט בווייז:");
    expect(lines[2]).toBe(`${siteBaseUrl()}/w/omer`);
    expect(lines[2]).not.toMatch(/waze\.com/);
  });
});

describe("no hosts configured — graceful fallback", () => {
  beforeEach(() => setHosts([]));

  it("no known hosts: slug lookup fails, buttons list is empty", () => {
    expect(getHosts()).toEqual([]);
    expect(hostBySlug("dani")).toBeNull();
    expect(hostFromLocation(FIXTURE_HOSTS[0].text)).toBeNull();
  });

  it("waze links fall back to the free-text /w?q= form", () => {
    const url = wazeShortUrl(FIXTURE_HOSTS[0].text);
    expect(url).toBe(
      `${siteBaseUrl()}/w?q=` + encodeURIComponent("הפרחים 3, עיר הדוגמה")
    );
    const lines = planShareLocationLines(FIXTURE_HOSTS[0].text);
    expect(lines[0]).toMatch(/^📍 /);
    expect(lines[1]).toBe("ניווט בווייז:");
    expect(lines[2]).toBe(url);
  });
});

describe("wazeQueryFromLocation (pure, host-list independent)", () => {
  it("takes street+city and drops floor/code", () => {
    expect(
      wazeQueryFromLocation("אצל דני · הפרחים 3, עיר הדוגמה · קומה 4, דירה 12 · קוד בניין #1234#")
    ).toBe("הפרחים 3, עיר הדוגמה");
  });

  it("returns null without a street", () => {
    expect(wazeQueryFromLocation("אצל דני")).toBeNull();
    expect(wazeQueryFromLocation("")).toBeNull();
  });

  it("accepts a free-typed street", () => {
    expect(wazeQueryFromLocation("הפרחים 3 עיר הדוגמה")).toBe("הפרחים 3 עיר הדוגמה");
    const url = wazeShortUrl("הפרחים 3 עיר הדוגמה");
    expect(url).toBe(`${siteBaseUrl()}/w?q=` + encodeURIComponent("הפרחים 3 עיר הדוגמה"));
  });

  it("builds a direct Waze query link without coordinates", () => {
    const url = wazeNavigateUrl("אצל נועה לוי · הים 8, עיר הדוגמה · קומת קרקע");
    expect(url).toBe(
      "https://waze.com/ul?q=" + encodeURIComponent("הים 8, עיר הדוגמה") + "&navigate=yes"
    );
  });
});
