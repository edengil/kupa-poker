/* גל 6, פריט 6.3 (ו-30) — מסכי שגיאה אנושיים ו־404 אמיתי:

   - groupExists: שלילי מובהק (אין שורה, בלי שגיאה) = לא קיים; שורה =
     קיים; שגיאת שאילתה או זריקה = קיים (לא חוסמים על תקלה חולפת).
   - נתיב /g: קורא לבדיקת הקיום ו־notFound() על שלילי (מעבר מקור), ויש
     מסך not-found עברי.
   - מסך שגיאת השורש: לא מציג עוד את message הגולמי של המסד — הודעה
     עברית נקייה + הפניית אבחון, והגולמי הולך ל־reportDiag (מעבר מקור). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { groupExists } from "../lib/groupExists.js";

function fakeAdmin(result) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

describe("groupExists (בדיקת קיום בשרת)", () => {
  it("שורה קיימת → true", async () => {
    await expect(groupExists(fakeAdmin({ data: { id: "g1" }, error: null }), "abc")).resolves.toBe(true);
  });

  it("אין שורה ואין שגיאה → false (404 אמיתי)", async () => {
    await expect(groupExists(fakeAdmin({ data: null, error: null }), "nope")).resolves.toBe(false);
  });

  it("שגיאת שאילתה → true (תקלה חולפת לא חוסמת צופים)", async () => {
    await expect(
      groupExists(fakeAdmin({ data: null, error: { message: "db down" } }), "abc")
    ).resolves.toBe(true);
  });

  it("זריקה מהלקוח → true", async () => {
    const throwing = {
      from: () => {
        throw new Error("client boom");
      },
    };
    await expect(groupExists(throwing, "abc")).resolves.toBe(true);
  });

  it("slug ריק → false בלי שאילתה", async () => {
    await expect(groupExists(fakeAdmin({ data: { id: "g1" }, error: null }), "")).resolves.toBe(false);
  });
});

describe("6.3 — מעברי מקור: נתיב ציבורי ומסכי שגיאה", () => {
  const page = readFileSync(new URL("../app/g/[slug]/page.jsx", import.meta.url), "utf8");
  const notFoundScreen = readFileSync(
    new URL("../app/g/[slug]/not-found.jsx", import.meta.url),
    "utf8"
  );
  const owner = readFileSync(new URL("../components/OwnerApp.jsx", import.meta.url), "utf8");

  it("/g בודק קיום בשרת וקורא notFound על חסר", () => {
    expect(page).toContain("groupExists");
    expect(page).toContain("notFound()");
  });

  it("מסך ה־404 עברי ונקי", () => {
    expect(notFoundScreen).toContain("הקבוצה לא נמצאה");
  });

  it("PublicApp תחת AppErrorBoundary (כבר היה — נעילה)", () => {
    const pub = readFileSync(new URL("../components/PublicApp.jsx", import.meta.url), "utf8");
    expect(pub).toContain("<AppErrorBoundary>");
    expect(pub).toContain("</AppErrorBoundary>");
  });

  it("מסך שגיאת השורש לא מציג טקסט מסד גולמי", () => {
    expect(owner).not.toContain("{message || \"משהו השתבש\"}");
    expect(owner).toContain("לא הצלחנו לטעון את הקבוצה כרגע");
    expect(owner).toContain('reportDiag("root-landing"');
    expect(owner).toContain("מזהה אירוע");
  });
});
