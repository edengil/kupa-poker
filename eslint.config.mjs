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
]);
