import fs from "fs";
import { execSync } from "child_process";
import {
  r2, AL, balance, canon, DEFAULT_ALIASES, FEMALE, toWhatsApp, hhmm, dur, durWords,
} from "../components/poker/helpers.js";
import { fmt, MONTHS } from "../components/poker/format.js";
import { C } from "../components/poker/colors.js";

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) console.log("OK ", name, detail);
  else {
    console.log("FAIL", name, detail);
    failed++;
  }
};

const app = fs.readFileSync("components/PokerApp.jsx", "utf8");
const helpers = fs.readFileSync("components/poker/helpers.js", "utf8");

// --- structural: no leaked defs ---
const leaks = [
  "function SessionsTab",
  "function ShareSheet",
  "function toWhatsApp",
  "function Header(",
  "function TabBar(",
  "function BalanceMeter(",
  "function Style(",
  "function Banner(",
  "function TableTab(",
  "function Ledger(",
  "function InputTab(",
  "function AliasCard(",
  "function BackupCard(",
  "function parseEntries(",
  "function parseDate(",
  "function exportDb(",
  "const normalize =",
  "const KW =",
  "function RecordsTab(",
  "function PlayersTab(",
  "function ProfileSheet(",
  "function CumChart(",
  "function LiveTab(",
  "function PlanCard(",
  "function BotToggle(",
  "function PokerTable(",
  "export function brokenRecords",
  "const HOSTS",
  "const getConfig",
  "const LIVE_KEY =",
  "function aggregate(",
  "function yearTotals(",
  "function monthTotals(",
  "function allTimeTotals(",
  "const r2 =",
  "const DEFAULT_ALIASES",
  "const FEMALE",
  "const balance =",
  "const fmt =",
  "const MONTHS =",
  "function AL(",
  "function waOpen(",
  "const mkIcon",
  "function Select(",
  "function IconBtn(",
  "function Empty(",
  "function SegBar(",
  "function Tag(",
  "function NavBtn(",
  "function RoundBtn(",
  "function GroupLabel(",
  "const Stat =",
  "const inputStyle =",
  "const SEED =",
  "const SEED_YEARLY =",
  "const seedToSession =",
  "const buildSeedDb =",
];
for (const pat of leaks) ok(`no leak ${pat}`, !app.includes(pat));

// --- required imports (shell only — leaf modules live under child tabs) ---
for (const imp of [
  "./poker/SessionsTab",
  "./poker/chrome",
  "./poker/colors",
  "./poker/Banner",
  "./poker/TableTab",
  "./poker/InputTab",
  "./poker/db",
  "./poker/brokenRecords",
  "./poker/RecordsTab",
  "./poker/PlayersTab",
  "./poker/ProfileSheet",
  "./poker/LiveTab",
  "./poker/PokerTable",
  "./poker/config",
  "./poker/seed",
]) {
  ok(`import ${imp}`, app.includes(imp));
}

ok("seed.js exists", fs.existsSync("components/poker/seed.js"));
ok("seed.js exports SEED", fs.readFileSync("components/poker/seed.js", "utf8").includes("export const SEED ="));

// --- exports still available for PublicApp/OwnerApp ---
ok("export brokenRecords", /export\s*\{[^}]*brokenRecords/.test(app) || app.includes("export function brokenRecords"));
ok("export PokerTable", /export\s*\{[^}]*PokerTable/.test(app) || app.includes("export function PokerTable"));
ok("export default App", app.includes("export default App"));

for (const f of ["components/PublicApp.jsx", "components/OwnerApp.jsx"]) {
  const t = fs.readFileSync(f, "utf8");
  ok(`${f} imports PokerApp`, /from ["']\.\/PokerApp["']/.test(t));
}

// --- parity vs pre-refactor ---
const old = execSync("git show a2d138d^:components/PokerApp.jsx", { encoding: "utf8" });
const parseAliases = (block) =>
  Object.fromEntries([...block.matchAll(/"([^"]+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]));
const oa = old.match(/const DEFAULT_ALIASES = \{([\s\S]*?)\n\};/);
const na = helpers.match(/export const DEFAULT_ALIASES = \{([\s\S]*?)\n\};/);
ok("alias blocks exist", !!(oa && na));
if (oa && na) {
  const O = parseAliases(oa[1]);
  const N = parseAliases(na[1]);
  const same =
    Object.keys(O).length === Object.keys(N).length &&
    Object.keys(O).every((k) => O[k] === N[k]);
  ok("alias parity", same, `${Object.keys(O).length} keys`);
}
const of = old.match(/const FEMALE = new Set\((\[.*?\])\)/);
const nf = helpers.match(/export const FEMALE = new Set\((\[.*?\])\)/);
ok("female parity", of && nf && of[1] === nf[1]);

const oldFmt = old.match(/const fmt = n => \(n > 0 \? "\+" : n < 0 \? "−" : ""\) \+ Math\.abs\(n\)\.toLocaleString\("en-US"\);/);
ok("fmt formula preserved", !!oldFmt && fmt(12) === "+12" && fmt(-3) === "−3" && fmt(0) === "0");

const oldMonths = old.match(/const MONTHS = \[([^\]]+)\]/);
ok("MONTHS length 12", MONTHS.length === 12);
ok("MONTHS first/last", MONTHS[0] === "ינואר" && MONTHS[11] === "דצמבר");

// --- behavioral smoke ---
ok("r2", r2(1.239) === 1.24 && r2(1.235) === 1.24);
ok("balance gap", balance([{ amount: 100 }, { amount: -40 }]).gap === 60);
ok("balance zero", balance([{ amount: 50 }, { amount: -50 }]).gap === 0);
ok("canon default", canon("דן", DEFAULT_ALIASES) === "דן ינקלויץ");
ok("AL defaults", AL({ aliases: {} })["עדן"] === "עדן גיל");
ok("AL user override blocked by default", AL({ aliases: { עדן: "X" } })["עדן"] === "עדן גיל");
ok("AL user add", AL({ aliases: { זמיר: "זמיר כהן" } })["זמיר"] === "זמיר כהן");

const wa = toWhatsApp(
  [
    { name: "עדן גיל", amount: 50 },
    { name: "אורן גיל", amount: -50 },
    { name: "דן ינקלויץ", amount: 0 },
  ],
  { d: 1, mo: 8 },
  null,
  {},
  true
);
ok("wa head", wa.startsWith("סיכום פוקר 1.8"));
ok("wa female debtor", wa.includes("אורן גיל חייבת 50"));
ok("wa male creditor", wa.includes("עדן גיל מגיע 50"));
ok("wa zero", wa.includes("דן ינקלויץ סגר באפס"));

const t0 = Date.UTC(2026, 0, 1, 20, 5, 0);
ok("hhmm", hhmm(t0).includes(":"));
ok("dur", typeof dur(65000) === "string");
ok("durWords", durWords(90 * 60000).includes("שעות"));

// colors palette intact
for (const k of ["felt", "feltDeep", "card", "brass", "cream", "win", "loss"]) {
  ok(`color ${k}`, typeof C[k] === "string" && C[k].startsWith("#"));
}

// --- every imported symbol from poker modules is referenced ---
const importRe = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+"(\.\/poker\/[^"]+)"/g;
let m;
while ((m = importRe.exec(app))) {
  const mod = m[3];
  const names = (m[1] || m[2] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.split(/\s+as\s+/).pop().trim());
  for (const name of names) {
    // count occurrences beyond the import line
    const re = new RegExp(`\\b${name}\\b`, "g");
    const count = (app.match(re) || []).length;
    ok(`used ${name} from ${mod}`, count >= 2, `refs=${count}`);
  }
}

console.log("\n" + (failed ? `${failed} FAILURES` : "ALL CHECKS PASSED"));
process.exit(failed ? 1 : 0);
