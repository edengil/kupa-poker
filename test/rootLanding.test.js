/* נחיתת שורש — הכרעת בעלים/צופה/חדש.
   הרגרסיה שמאחורי הבדיקות: שחקן שצופה בקבוצה דרך הלינק הציבורי פתח את
   האפליקציה המותקנת (start_url="/") וקיבל מסך מנהלים של קבוצה חדשה
   וריקה — כי נתיב ה־boot בשורש יצר קבוצה בשקט לכל מחובר בלי קבוצה
   בבעלותו. הנעילה המרכזית: למשתמש עם שיוך צפייה לעולם לא נוצרת קבוצה. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRootLanding } from "../lib/rootLanding.js";
import { fetchLastViewedGroup } from "../lib/realtime.js";

const USER = "user-1";
const OWNED_ROW = { id: "g-owned", slug: "owned-slug", name: "הקבוצה שלי" };
const CREATED_ROW = { id: "g-new", slug: "fresh-slug", name: null };

/* supabase מזויף שמחקה את שרשראות השאילתות שהקוד באמת משתמש בהן,
   וסופר קריאות — כדי שאפשר יהיה לטעון "insert לא נקרא" כעובדה. */
function fakeSupabase({
  owned = [],
  ownedError = null,
  viewedRows = [],
  rpcError = null,
  created = CREATED_ROW,
  insertError = null,
} = {}) {
  const calls = { selects: 0, rpc: 0, inserts: [] };
  return {
    calls,
    from(table) {
      if (table !== "groups") throw new Error(`unexpected table: ${table}`);
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          calls.selects++;
          return Promise.resolve(
            ownedError ? { data: null, error: ownedError } : { data: owned, error: null }
          );
        },
        insert(row) {
          calls.inserts.push(row);
          return chain;
        },
        single() {
          return Promise.resolve(
            insertError ? { data: null, error: insertError } : { data: created, error: null }
          );
        },
      };
      return chain;
    },
    rpc(name) {
      calls.rpc++;
      if (name !== "my_last_viewed_group")
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
      return Promise.resolve(
        rpcError ? { data: null, error: rpcError } : { data: viewedRows, error: null }
      );
    },
  };
}

const makeSlug = () => "fresh-slug";

describe("resolveRootLanding — הכרעת נחיתה בשורש", () => {
  it("בעלים עם קבוצה: עולה כבעלים, בלי RPC ובלי יצירה", async () => {
    const sb = fakeSupabase({ owned: [OWNED_ROW] });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "owner", row: OWNED_ROW });
    expect(sb.calls.rpc).toBe(0);
    expect(sb.calls.inserts).toEqual([]);
  });

  it("צופה בלי קבוצה בבעלותו: מנותב לקבוצה האחרונה שצפה בה — ולא נוצרת קבוצה", async () => {
    const sb = fakeSupabase({
      owned: [],
      viewedRows: [{ slug: "viewed-slug", name: "קבוצת החברים" }],
    });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "viewer", slug: "viewed-slug" });
    expect(sb.calls.inserts).toEqual([]);
  });

  it("משתמש בלי שום שיוך: נוצרת קבוצה ראשונה (הנתיב היחיד שיוצר)", async () => {
    const sb = fakeSupabase({ owned: [], viewedRows: [] });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "owner", row: CREATED_ROW, created: true });
    expect(sb.calls.inserts).toEqual([{ owner_id: USER, slug: "fresh-slug" }]);
  });

  it("שגיאה בשאילתת הבעלות: שגיאה מדווחת, בלי RPC ובלי יצירה", async () => {
    const sb = fakeSupabase({ ownedError: { message: "db down" } });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "error", message: "db down" });
    expect(sb.calls.rpc).toBe(0);
    expect(sb.calls.inserts).toEqual([]);
  });

  it("כשל ב־RPC של הצפייה האחרונה: נופל להתנהגות הקיימת (יצירת קבוצה), לא נתקע", async () => {
    const sb = fakeSupabase({ owned: [], rpcError: { message: "function missing" } });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out.kind).toBe("owner");
    expect(sb.calls.inserts).toHaveLength(1);
  });

  it("שגיאה ביצירת הקבוצה: שגיאה מדווחת", async () => {
    const sb = fakeSupabase({ owned: [], insertError: { message: "insert denied" } });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "error", message: "insert denied" });
  });
});

describe("fetchLastViewedGroup — עטיפת ה־RPC", () => {
  const sbWith = (result) => ({ rpc: () => Promise.resolve(result) });

  it("שורה מהשרת → { slug, name }", async () => {
    const out = await fetchLastViewedGroup(
      sbWith({ data: [{ slug: "s1", name: "קבוצה" }], error: null })
    );
    expect(out).toEqual({ slug: "s1", name: "קבוצה" });
  });

  it("אין צפיות → null", async () => {
    expect(await fetchLastViewedGroup(sbWith({ data: [], error: null }))).toBeNull();
  });

  it("שגיאת שרת → null (לא זורק)", async () => {
    expect(
      await fetchLastViewedGroup(sbWith({ data: null, error: { message: "boom" } }))
    ).toBeNull();
  });
});

describe("חיווט OwnerApp — נעילות סטטיות", () => {
  const src = readFileSync(new URL("../components/OwnerApp.jsx", import.meta.url), "utf8");

  it("ה־boot קורא ל־resolveRootLanding עם המשתמש וה־slug-maker", () => {
    expect(src).toContain("resolveRootLanding(supabase, user.id, newSlug)");
  });

  it("תוצאת צופה מנתבת למשטח הצפייה של הקבוצה", () => {
    expect(src).toContain('landing.kind === "viewer"');
    expect(src).toContain("window.location.replace(`/g/${landing.slug}`)");
  });

  it("ב־OwnerApp עצמו אין יותר יצירת קבוצה — היצירה רק בתוך resolveRootLanding", () => {
    expect(src).not.toContain(".insert(");
  });
});
