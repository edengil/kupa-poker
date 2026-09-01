import { describe, it, expect } from "vitest";
import {
  HOSTS,
  hostBySlug,
  siteBaseUrl,
  wazeQueryFromLocation,
  wazeNavigateUrl,
  wazeShortUrl,
  planShareLocationLines,
} from "../components/poker/hosts.js";

describe("HOSTS", () => {
  it("includes Netanel with street and door code", () => {
    const h = HOSTS.find((x) => x.label === "נתנאל כהן");
    expect(h.text).toContain("נורוק 6");
    expect(h.text).toContain("06060");
  });

  it("includes Shapak from chat and does not duplicate Netanel", () => {
    expect(HOSTS.filter((h) => h.label === "נתנאל כהן")).toHaveLength(1);
    expect(HOSTS.some((h) => h.label === "עדן שפאק")).toBe(true);
  });

  it("puts Shapak in Netanya so Waze gets street+city", () => {
    const h = HOSTS.find((x) => x.label === "עדן שפאק");
    expect(h.text).toBe("אצל עדן שפאק · קרל פופר 6, נתניה · קומה 5, דירה 20");
    expect(wazeQueryFromLocation(h.text)).toBe("קרל פופר 6, נתניה");
  });

  it("marks Dor as ground floor without a building code", () => {
    const h = HOSTS.find((x) => x.label === "דור ועדן לירז");
    expect(h.text).toBe("אצל דור ועדן לירז · תותחנים 16, כפר יונה · קומת קרקע");
    expect(h.text).not.toMatch(/קוד/);
    expect(wazeQueryFromLocation(h.text)).toBe("תותחנים 16, כפר יונה");
  });

  it("gives every host a unique short slug", () => {
    const slugs = HOSTS.map((h) => h.slug);
    expect(slugs.every(Boolean)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(
      expect.arrayContaining(["eden", "ofir", "dor", "sagi", "itzik", "netanel", "shpak"])
    );
  });
});

describe("hostBySlug → waze", () => {
  it("maps itzik to Yosef Burg street", () => {
    const h = hostBySlug("itzik");
    expect(h).toBeTruthy();
    expect(wazeQueryFromLocation(h.text)).toBe("יוסף בורג 10, נתניה");
    expect(wazeNavigateUrl(h.text)).toBe(
      "https://waze.com/ul?q=" + encodeURIComponent("יוסף בורג 10, נתניה") + "&navigate=yes"
    );
  });

  it("is case-insensitive and rejects unknown slugs", () => {
    expect(hostBySlug("ITZIK")?.slug).toBe("itzik");
    expect(hostBySlug("nobody")).toBeNull();
  });
});

describe("wazeQueryFromLocation", () => {
  it("takes street+city and drops floor/code", () => {
    expect(
      wazeQueryFromLocation("אצל נתנאל כהן · נורוק 6, נתניה · קומה 1, דירה 1 · קוד בניין 06060")
    ).toBe("נורוק 6, נתניה");
    expect(
      wazeQueryFromLocation("אצל עדן · לויתן 4, נתניה · קומה 23, דירה 2303 · קוד בניין #4770#")
    ).toBe("לויתן 4, נתניה");
  });

  it("returns null without a street", () => {
    expect(wazeQueryFromLocation("אצל נתנאל כהן")).toBeNull();
    expect(wazeQueryFromLocation("")).toBeNull();
  });

  it("accepts a free-typed street", () => {
    expect(wazeQueryFromLocation("תותחנים 16 כפר יונה")).toBe("תותחנים 16 כפר יונה");
  });
});

describe("wazeNavigateUrl / wazeShortUrl / planShareLocationLines", () => {
  it("builds a direct Waze query link without coordinates", () => {
    const url = wazeNavigateUrl("אצל שגיא גיל · יהדות הדממה 11, הרצליה");
    expect(url).toBe(
      "https://waze.com/ul?q=" + encodeURIComponent("יהדות הדממה 11, הרצליה") + "&navigate=yes"
    );
  });

  it("emits a short site URL for known hosts", () => {
    const itzikLoc = "אצל איציק · יוסף בורג 10, נתניה · קומה 2, דירה 6 · קוד בניין #7140";
    expect(wazeShortUrl(itzikLoc)).toBe(`${siteBaseUrl()}/w/itzik`);
    expect(wazeShortUrl(itzikLoc).length).toBeLessThan(50);
  });

  it("puts a short Waze URL on its own line in share text", () => {
    const lines = planShareLocationLines(
      "אצל איציק · יוסף בורג 10, נתניה · קומה 2, דירה 6 · קוד בניין #7140"
    );
    expect(lines[0]).toMatch(/^📍 /);
    expect(lines[1]).toBe("ניווט בווייז:");
    expect(lines[2]).toBe(`${siteBaseUrl()}/w/itzik`);
    expect(lines[2]).not.toMatch(/waze\.com/);
    expect(lines[2].length).toBeLessThan(50);
  });

  it("uses /w?q= for free-typed streets", () => {
    const url = wazeShortUrl("תותחנים 16 כפר יונה");
    expect(url).toBe(
      `${siteBaseUrl()}/w?q=` + encodeURIComponent("תותחנים 16 כפר יונה")
    );
  });
});
