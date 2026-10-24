import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

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
    // ה־service worker רץ בסביבת worker — הגלובל clients לגיטימי שם
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        clients: "readonly",
      },
    },
  },
]);
