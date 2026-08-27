import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseWhatsAppMessages,
  snapshotFromMessage,
  buildEntryTimings,
  buildNightSpans,
  parseSettlementNets,
  settlementKind,
} from "../scripts/parse-whatsapp-entries.mjs";
import {
  reconstructedChips,
  resolveEntryChips,
  chatBuyinFor,
} from "../components/poker/reconstructChips.js";
import { sessionDurationMs } from "../components/poker/durationRecords.js";

const JUNE10 = [
  "[10.6.2026, 20:55:43] Eden Gil: איציק 50 ביט",
  "ירדן 50 ביט",
  "אורן 50 ביט",
  "עדן 50 ביט",
  "קובי 50 ביט",
  "[10.6.2026, 20:59:48] Eden Gil: איציק 50 ביט",
  "ירדן 50 ביט",
  "אורן 50 ביט",
  "עדן 50 ביט",
  "קובי 50 ביט",
  "מייקי 50 ביט",
  "[11.6.2026, 0:58:53] Eden Gil: איציק 50 ביט",
  "ירדן 100 ביט",
  "אורן 200 ביט",
  "עדן 50 ביט",
  "קובי 550 ביט",
  "מייקי 250 ביט",
  "[11.6.2026, 1:06:27] Eden Gil: סיכום פוקר 10.6",
  "",
  "איציק חייב 50",
  "קובי חייב 500",
  "אורן חייבת 140",
  "ירדן מגיע 50",
  "דן מגיע 200",
  "עדן מגיע 430",
  "מייקי מגיע 115",
].join("\n");

const JULY18 = [
  "[18.7.2026, 20:05:39] Eden Gil: 18.7",
  "דן 100 ביט",
  "עדן 50 ביט",
  "אורן 50 ביט",
  "אופיר 50 ביט",
  "שגיא 50 ביט",
  "[19.7.2026, 0:35:42] Eden Gil: 18.7",
  "דן 350 ביט",
  "עדן 300 ביט",
  "אורן 350 ביט",
  "אופיר 100 ביט",
  "שגיא 250 ביט",
  "אור 200 ביט",
  "דן הספר 200 ביט",
  "שי 300 ביט",
  "דוד בני 100 ביט",
  "ארתור 200 ביט",
  "(50 כניסות מתוכם 2 בחוץ)",
  "[19.7.2026, 0:36:01] Eden Gil: ק18.7",
  "דן 350 ביט",
  "עדן 300 ביט",
  "אורן 350 ביט",
  "אופיר 100 ביט",
  "שגיא 250 ביט",
  "אור 200 ביט",
  "דן הספר 200 ביט",
  "שי 300 ביט",
  "דוד בני 150 ביט",
  "ארתור 200 ביט",
  "(50 כניסות מתוכם 1 בחוץ)",
  "[19.7.2026, 0:51:11] Eden Gil: סיכום פוקר 18.7",
  "",
  "דוד בני 150 ביט",
  "",
  "דן חייב 250",
  "דוד בני חייב 150",
  "שי חייב 300",
  "אורן חייבת 350",
  "דן הספר חייב 200",
  "ארתור חייב 100",
  "",
  "אור מגיע 600",
  "עדן מגיע 185",
  "אופיר מגיע 370",
  "שגיא מגיע 290",
].join("\n");

describe("gold: June 10 20:55 → June 11 01:06", () => {
  const start = Date.parse("2026-06-10T20:55:43+03:00");
  const end = Date.parse("2026-06-11T01:06:27+03:00");

  it("starts at the first opening list, not a later update", () => {
    const { spans } = buildNightSpans(parseWhatsAppMessages(JUNE10));
    expect(spans["2026-06-10"].s).toBe(start);
    expect(spans["2026-06-10"].e).toBe(end);
    expect(spans["2026-06-10"].e - spans["2026-06-10"].s).toBe(end - start);
  });

  it("duration uses סיכום, not last bit-list time", () => {
    const lastBit = Date.parse("2026-06-11T00:58:53+03:00");
    const { spans } = buildNightSpans(parseWhatsAppMessages(JUNE10));
    expect(spans["2026-06-10"].e).not.toBe(lastBit);
    expect(sessionDurationMs({ iso: "2026-06-10" }, spans)).toBe(end - start);
  });
});

describe("gold: 18.7 Eden 970 and David Beni not doubled", () => {
  it("Eden chips = (300 + 185) * 2 = 970", () => {
    expect(reconstructedChips({ buyin: 300, net: 185, cps: 2 })).toBe(970);
    expect(reconstructedChips({ buyin: 350, net: -250, cps: 2 })).toBe(200);
  });

  it("last bit snapshot before סיכום is buyin; leftover ביט in summary is ignored", () => {
    const messages = parseWhatsAppMessages(JULY18);
    const summary = messages.find((m) => /סיכום פוקר 18\.7/.test(m.text));
    expect(settlementKind(summary.text)).toBe(3);
    expect(snapshotFromMessage(summary)).toBeNull();

    const { nights } = buildEntryTimings(messages);
    expect(nights["עדן גיל"]["2026-07-18"].b).toBe(300);
    expect(nights["דוד בני גיל"]["2026-07-18"].b).toBe(150);

    const r = resolveEntryChips(
      { name: "עדן גיל", amount: 185 },
      { iso: "2026-07-18", nightsMap: nights }
    );
    expect(r).toMatchObject({ chips: 970, buyin: 300, source: "chat+net" });
  });

  it("parseSettlementNets counts David Beni once from חייב, not from leftover ביט", () => {
    const nets = parseSettlementNets(JULY18.slice(JULY18.indexOf("סיכום פוקר 18.7")));
    expect(nets["דוד בני גיל"]).toBe(-150);
    expect(nets["עדן גיל"]).toBe(185);
    expect(Object.keys(nets).filter((n) => n.includes("דוד")).length).toBe(1);
  });

  it("start is 20:05 first list, end is 00:51 סיכום — not 00:35/00:36", () => {
    const { spans } = buildNightSpans(parseWhatsAppMessages(JULY18));
    expect(spans["2026-07-18"].s).toBe(Date.parse("2026-07-18T20:05:39+03:00"));
    expect(spans["2026-07-18"].e).toBe(Date.parse("2026-07-19T00:51:11+03:00"));
  });
});

describe("last snapshot wins after a typo", () => {
  it("does not keep 1500 after a later 200 correction", () => {
    const text = [
      "[26.7.2026, 21:11:58] Eden Gil: אופיר 50 ביט",
      "עדן 50 ביט",
      "שגיא 50 ביט",
      "[26.7.2026, 22:54:38] Eden Gil: אופיר 1500 ביט",
      "עדן 300 ביט",
      "שגיא 250 ביט",
      "[26.7.2026, 23:10:26] Eden Gil: אופיר 200 ביט",
      "עדן 300 ביט",
      "שגיא 250 ביט",
      "[27.7.2026, 0:36:48] Eden Gil: אופיר 300 ביט",
      "עדן 375 ביט",
      "שגיא 250 ביט",
      "[27.7.2026, 1:19:57] Eden Gil: סיכום פוקר 26.7",
      "אופיר חייב 90",
      "עדן חייב 310",
      "שגיא מגיע 135",
    ].join("\n");
    const { nights } = buildEntryTimings(parseWhatsAppMessages(text));
    expect(nights["אופיר סנה"]["2026-07-26"].b).toBe(300);
    const r = resolveEntryChips(
      { name: "אופיר סנה", amount: -90 },
      { iso: "2026-07-26", nightsMap: nights }
    );
    expect(r).toMatchObject({ chips: 420, buyin: 300 });
  });
});

describe("end time is the סיכום, not a later payment ping", () => {
  it("keeps סיכום פוקר 24.6 at 01:15, ignores מעבירים לאופיר at 20:35", () => {
    const text = [
      "[24.6.2026, 21:56:49] Eden Gil: אופיר 50 ביט",
      "עדן 50 ביט",
      "קובי 50 ביט",
      "[25.6.2026, 1:15:51] Eden Gil: סיכום פוקר 24.6",
      "אופיר מגיע 215",
      "עדן חייב 205",
      "קובי חייב 50",
      "[25.6.2026, 20:35:36] Eden Gil: מעבירים לאופיר",
      "עדן גורשומוב חייבת 130",
      "נתנאל חייב 25",
      "עדן חייב 5",
      "קובי חייב 50",
    ].join("\n");
    const { spans } = buildNightSpans(parseWhatsAppMessages(text));
    expect(spans["2026-06-24"].e).toBe(Date.parse("2026-06-25T01:15:51+03:00"));
    expect(spans["2026-06-24"].e).not.toBe(Date.parse("2026-06-25T20:35:36+03:00"));
  });
});
describe("buyin is last snapshot, not a sum", () => {
  it("keeps b=50 when amounts only repeat", () => {
    const map = {
      "אופיר סנה": { "2026-07-15": { n: 1, a: [50], b: 50 } },
    };
    expect(chatBuyinFor("אופיר סנה", "2026-07-15", {}, map)).toBe(50);
    const r = resolveEntryChips(
      { name: "אופיר סנה", amount: 855 },
      { iso: "2026-07-15", nightsMap: map }
    );
    expect(r).toMatchObject({ chips: 1810, buyin: 50 });
  });
});

describe("audit-nights.json goldens", () => {
  const audit = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts", "audit-nights.json"), "utf8")
  );

  it("locks 18.7 Eden 970 and David Beni once", () => {
    const g = audit.golden.find((x) => x.iso === "2026-07-18");
    expect(g.players[0]).toMatchObject({ name: "עדן גיל", buyin: 300, net: 185, chips: 970 });
    expect(g.players[1]).toMatchObject({ name: "דוד בני גיל", buyin: 150, net: -150, chips: 0 });
  });

  it("locks June 10 20:55 → June 11 01:06", () => {
    const g = audit.golden.find((x) => x.iso === "2026-06-10");
    expect(g.span.start).toBe("10/06/2026, 20:55:43");
    expect(g.span.end).toBe("11/06/2026, 01:06:27");
  });

  it("has five extra sample nights with two players each", () => {
    expect(audit.sample).toHaveLength(5);
    for (const n of audit.sample) {
      expect(n.players.filter((p) => p.chips != null)).toHaveLength(2);
    }
  });
});
