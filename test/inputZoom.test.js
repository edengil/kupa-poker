import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { inputStyle, Select } from "../components/poker/ui.jsx";
import { LiveExitField } from "../components/poker/live/LiveExitField.jsx";

/* ============================================================================
   נעילה נגד זום־פוקוס באייפון: כל שדה הקלדה/בחירה משותף חייב להיות בגופן
   16 לפחות. מתחת ל־16, ספארי באייפון מגדיל אוטומטית את העמוד כשהשדה מקבל
   מיקוד — זו ה"קפיצה" שעדן ראה בהזנת ג'יטונים/כספים בסיום ערב (הסגנון
   המשותף היה 14, שדה היציאה ירש אותו, ועורך הקנייה דרס ל־15).
   הפתרון הוא גודל הגופן בשדות בלבד — לא maximum-scale על ה־viewport.
   ============================================================================ */

function fontSizeOfFirstInput(html) {
  const m = html.match(/<(?:input|select)[^>]*style="[^"]*font-size:\s*([\d.]+)px/);
  return m ? parseFloat(m[1]) : null;
}

describe("זום־פוקוס: סגנונות שדות משותפים ≥ 16", () => {
  it("inputStyle המשותף בגופן 16 לפחות", () => {
    expect(typeof inputStyle.fontSize).toBe("number");
    expect(inputStyle.fontSize).toBeGreaterThanOrEqual(16);
  });

  it("רכיב הבחירה המשותף (Select) מרנדר select בגופן 16 לפחות", () => {
    const html = renderToString(
      React.createElement(Select, {
        value: "a",
        onChange: () => {},
        options: [["a", "א"]],
        label: "בדיקה",
      })
    );
    expect(fontSizeOfFirstInput(html)).toBeGreaterThanOrEqual(16);
  });

  it("שדה היציאה בלייב (יורש את inputStyle) מרנדר input בגופן 16 לפחות", () => {
    const html = renderToString(
      React.createElement(LiveExitField, {
        name: "שחקן",
        cashout: "",
        onFocus: () => {},
        onChange: () => {},
        onBlur: () => {},
      })
    );
    expect(fontSizeOfFirstInput(html)).toBeGreaterThanOrEqual(16);
  });
});
