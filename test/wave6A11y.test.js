/* גל 6, פריט 6.4 — נגישות מכנית + שיירי J9 (ו-34 + ז-41):
   • aria-label ל־RoundBtn ‏(+/−) ולכל שימוש IconBtn (כולל מחיקת ערב).
   • תוויות מתוכנתות לשדות שלא היו להן (הדבקת סיכום ועריכת ערב בראש).
   • אזורי מגע ≥24px לשמור/בטל בעריכת קופה (PotDashboard + כרטיס החלוקה
     האחרונה + טופס המשיכה של קופת החיסכון).
   • באותו מעבר: toLocaleString עם locale מפורש בשני המקומות שהיו בלי
     (BalanceBar ב־chrome.jsx) — שאר המקומות כבר היו עם locale.
   הסריקה: axe-core אמיתי (ברירת המחדל שלו כוללת את כלל label) על
   ה־HTML המרונדר של מסכי הלייב והעריכה; פלוס נעילות מקור לשאר המסכים —
   כל input/textarea/select בקבצי הרכיבים חייב aria-label, עטיפת label,
   או htmlFor (דרך רכיב ה־Select שעבר ל־htmlFor+id). */
import React from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import axe from "axe-core";
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { IconBtn, RoundBtn } from "../components/poker/ui.jsx";
import { LivePlayerRow } from "../components/poker/live/LivePlayerRow.jsx";
import { SessionEditSheet } from "../components/poker/SessionEditSheet.jsx";
import { SavingsPotCard } from "../components/poker/SavingsPotCard.jsx";
import { PotDashboard } from "../components/poker/PotDashboard.jsx";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

const AXE_LABEL_RULES = ["label", "label-title-only", "button-name", "link-name", "select-name", "input-button-name"];

async function axeLabelViolations(html) {
  const dom = new JSDOM(`<!doctype html><html lang="he"><body>${html}</body></html>`);
  const results = await axe.run(dom.window.document.body, {
    runOnly: { type: "rule", values: AXE_LABEL_RULES },
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const noop = () => {};

function liveRowProps() {
  const p = { name: "קובי סעדה", buyin: 200, cashout: "", tipsGiven: 0, buyinEvents: [] };
  return {
    p,
    index: 0,
    group: 0,
    prevGroup: 0,
    players: [p],
    coupleFills: {},
    tips: [],
    aliases: {},
    cps: 2,
    menuIdx: -1,
    setMenuIdx: noop,
    tipPickerIdx: 0, // בורר הטיפ פתוח — שדה סכום הטיפ מרונדר
    setTipPickerIdx: noop,
    tipAmt: "",
    setTipAmt: noop,
    tipListName: "",
    setTipListName: noop,
    tipDelConfirm: false,
    setTipDelConfirm: noop,
    longPressRef: { current: null },
    cashoutDraftRef: { current: {} },
    doCoupleFill: noop,
    addManualTip: noop,
    deleteManualTip: noop,
    bump: noop,
    editBuyin: noop,
    addAmt: 50,
    rm: noop,
    setField: noop,
    commitCashout: noop,
  };
}

describe("גל 6.4 — axe על מסכי לייב ועריכה: אפס חסרי תווית/שם", () => {
  it("שורת שחקן בלייב (RoundBtn +/−, הסרה, שדה טיפ)", async () => {
    const html = renderToString(React.createElement(LivePlayerRow, liveRowProps()));
    expect(html).toContain('aria-label="הוספת קנייה לקובי סעדה"');
    expect(html).toContain('aria-label="הפחתת קנייה לקובי סעדה"');
    expect(html).toContain('aria-label="הסרת קובי סעדה מהלייב"');
    expect(await axeLabelViolations(html)).toEqual([]);
  });

  it("מסך עריכת ערב (textarea של טקסט הערב)", async () => {
    const db = { sessions: [NIGHT_24_10], aliases: {}, roster: [] };
    const html = renderToString(
      React.createElement(SessionEditSheet, { db, session: NIGHT_24_10, commit: noop, onClose: noop })
    );
    expect(html).toContain('aria-label="עריכת טקסט הערב"');
    expect(await axeLabelViolations(html)).toEqual([]);
  });

  it("כרטיס קופת חיסכון (טופס משיכה סגור ב־SSR — השדות ננעלים במקור)", async () => {
    const db = { sessions: [NIGHT_24_10], savingsWithdrawals: [] };
    const html = renderToString(
      React.createElement(SavingsPotCard, { db, commit: noop, isAdmin: true })
    );
    expect(await axeLabelViolations(html)).toEqual([]);
  });

  it("לוח הקופה (עריכת סכומים — אזורי המגע ננעלים במקור)", async () => {
    const db = { sessions: [NIGHT_24_10], aliases: {}, roster: [] };
    const html = renderToString(
      React.createElement(PotDashboard, { db, commit: noop, isAdmin: true })
    );
    expect(await axeLabelViolations(html)).toEqual([]);
  });
});

describe("גל 6.4 — רכיבי הבסיס נושאים שם נגיש תמיד", () => {
  it("IconBtn בלי aria-label מפורש מקבל שם ברירת־מחדל (לא כפתור אלם)", () => {
    const html = renderToString(React.createElement(IconBtn, { onClick: noop }, "X"));
    expect(html).toContain('aria-label="פעולה"');
  });
  it("RoundBtn בלי aria-label מפורש מקבל שם ברירת־מחדל", () => {
    const html = renderToString(React.createElement(RoundBtn, { onClick: noop }, "+"));
    expect(html).toContain('aria-label="פעולה"');
  });
  it("IconBtn עם aria-label מפורש שומר עליו", () => {
    const html = renderToString(
      React.createElement(IconBtn, { onClick: noop, "aria-label": "מחיקת ערב 24.10.2026" }, "X")
    );
    expect(html).toContain('aria-label="מחיקת ערב 24.10.2026"');
  });
});

describe("גל 6.4 — נעילות מקור", () => {
  const compDir = join(process.cwd(), "components");
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".jsx")) files.push(join(d, e.name));
    }
  };
  walk(compDir);
  const src = (f) => readFileSync(f, "utf8");

  // חילוץ תג פותח מלא: הולכים תו־תו עם עומק סוגריים — ">" בתוך {…}
  // (חץ של onClick, תבנית־מחרוזת) לא מסיים את התג; רק ">" בעומק 0 כן.
  const openTags = (s, name) => {
    const out = [];
    const re = new RegExp(`<${name}\\b`, "g");
    let m;
    while ((m = re.exec(s)) !== null) {
      let depth = 0;
      let i = m.index;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      out.push(s.slice(m.index, i + 1));
    }
    return out;
  };

  it("כל שימוש IconBtn בקוד נושא aria-label מפורש", () => {
    const missing = [];
    for (const f of files) {
      for (const tag of openTags(src(f), "IconBtn")) {
        if (!tag.includes("aria-label")) missing.push(`${f.split("/").slice(-2).join("/")}: ${tag.slice(0, 60)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("כל שימוש RoundBtn בקוד נושא aria-label מפורש", () => {
    const missing = [];
    for (const f of files) {
      for (const tag of openTags(src(f), "RoundBtn")) {
        if (!tag.includes("aria-label")) missing.push(f);
      }
    }
    expect(missing).toEqual([]);
  });

  it("אין toLocaleString() בלי locale מפורש ברכיבים וב־lib", () => {
    const offenders = [];
    const scan = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else if (/\.(jsx?|tsx?)$/.test(e.name)) {
          const s = readFileSync(p, "utf8");
          if (/\.toLocaleString\(\)/.test(s)) offenders.push(p);
        }
      }
    };
    scan(compDir);
    scan(join(process.cwd(), "lib"));
    expect(offenders).toEqual([]);
  });

  it("אזורי מגע ≥24px: שמור/בטל בעריכת קופה בשלושת המקומות", () => {
    const pot = src(join(compDir, "poker/PotDashboard.jsx"));
    expect(pot).toContain("minHeight: 28");
    const last = src(join(compDir, "poker/LastSettlementCard.jsx"));
    expect(last).toContain("minHeight: 26");
    const sav = src(join(compDir, "poker/SavingsPotCard.jsx"));
    expect(sav).toContain("minHeight: 32");
  });

  it("השדות המרכזיים של הגל נושאים תוויות", () => {
    const checks = [
      ["poker/InputTab.jsx", "הדבקת סיכום הערב"],
      ["poker/SessionEditSheet.jsx", "עריכת טקסט הערב"],
      ["poker/live/LivePlayerRow.jsx", "סכום טיפ ל"],
      ["poker/PotDashboard.jsx", "סכום קופה לעריכה"],
      ["poker/SavingsPotCard.jsx", "סכום משיכה מהקופה"],
      ["poker/PlanCard.jsx", "ייבוא אימיילים של שחקנים"],
      ["poker/AliasCard.jsx", "שם בטקסט"],
    ];
    for (const [rel, label] of checks) {
      const s = src(join(compDir, rel));
      // תווית סטטית (aria-label="…") או תבנית־מחרוזת (aria-label={`…${…}`})
      expect(
        s.includes(`aria-label="${label}`) || s.includes("aria-label={`" + label),
        `${rel} חסר aria-label המתחיל ב־${label}`
      ).toBe(true);
    }
  });
});
