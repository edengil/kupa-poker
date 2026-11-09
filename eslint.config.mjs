import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import localRules from "./eslint-rules/no-relative-lib-import.mjs";

// מעבר מ־.eslintrc.json (eslint 9+ דורש קונפיג שטוח; ה־lint היה שבור — B7, 18.10)
export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // אירוע 24.10: הקונפיג של Next לא מפעיל no-undef (הוא סומך על TypeScript,
    // וה־JSX כאן לא עובר בדיקת טיפוסים) — וכך useMemo בלי ייבוא ב־OwnerApp
    // עבר lint נקי והפיל את עמוד הבעלים בכל רינדור מחובר (ReferenceError).
    // הפעלה מפורשת סוגרת את החור: ריצה ראשונה מצאה אפס ממצאים אמיתיים בקוד.
    rules: {
      "no-undef": "error",
    },
  },
  {
    // גל 8 (8.3) — אחידות ייבואים: מודולי lib נטענים דרך הכינוי "@/lib/…"
    // בכל אזורי היישום (app/components/scripts/e2e). ייבוא יחסי פנימה
    // לתיקייה או החוצה ממנה נשאר חוקי; יחסי בתוך lib עצמו ובבדיקות
    // נשאר כמו שהוא (לא ב־files של הבלוק הזה). הכלל המקומי שומר שייבוא
    // יחסי שחוצה אל lib לא יחזור.
    files: [
      "app/**/*.{js,jsx,ts,tsx}",
      "components/**/*.{js,jsx,ts,tsx}",
      "scripts/**/*.{js,mjs}",
      "e2e/**/*.{js,mjs}",
    ],
    plugins: { local: localRules },
    rules: {
      "local/no-relative-lib-import": "error",
    },
  },
  {
    // ה־service worker רץ בסביבת worker — הגלובל clients לגיטימי שם
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        clients: "readonly",
      },
    },
  },
]);
