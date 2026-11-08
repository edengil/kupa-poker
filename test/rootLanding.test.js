/* נחיתת שורש — הכרעת בעלים/צופה/חדש.
   הרגרסיה שמאחורי הבדיקות: שחקן שצופה בקבוצה דרך הלינק הציבורי פתח את
   האפליקציה המותקנת (start_url="/") וקיבל מסך מנהלים של קבוצה חדשה
   וריקה — כי נתיב ה־boot בשורש יצר קבוצה בשקט לכל מחובר בלי קבוצה
   בבעלותו. הנעילה המרכזית: למשתמש עם שיוך צפייה לעולם לא נוצרת קבוצה. */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRootLanding } from "../lib/rootLanding.js";
import { fetchLastViewedGroup, fetchLastViewedGroupResult } from "../lib/realtime.js";

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

  it("כשל ב־RPC של הצפייה האחרונה: שגיאה (מסך נסה־שוב) — לעולם לא יצירת קבוצה (פריט 1.4)", async () => {
    /* הבדיקה הישנה קידדה את ההתנהגות הפגומה כ"מכוונת": כשל RPC חולף
       יצר קבוצת־זבל והצופה נתקע עליה כ"בעלים". ההתנהגות הנכונה: כשל ≠
       "אין צפיות" — שגיאה מדווחת, אפס יצירות. */
    const sb = fakeSupabase({ owned: [], rpcError: { message: "function missing" } });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out).toEqual({ kind: "error", message: "function missing" });
    expect(sb.calls.inserts).toEqual([]);
  });

  it("צופה שהקבוצה שלו נמחקה (cascade מחק את הצפיות): תשובה חיובית ריקה — נוחת כמשתמש חדש, לא תקוע", async () => {
    const sb = fakeSupabase({ owned: [], viewedRows: [] });
    const out = await resolveRootLanding(sb, USER, makeSlug);
    expect(out.kind).toBe("owner");
    expect(out.created).toBe(true);
    expect(sb.calls.inserts).toHaveLength(1);
  });

  it("boot כפול מקבילי למשתמש חדש: ריצה אחת משותפת — insert אחד בלבד (שומר in-flight)", async () => {
    const sb = fakeSupabase({ owned: [], viewedRows: [] });
    const [a, b] = await Promise.all([
      resolveRootLanding(sb, "user-double-boot", makeSlug),
      resolveRootLanding(sb, "user-double-boot", makeSlug),
    ]);
    expect(a).toEqual({ kind: "owner", row: CREATED_ROW, created: true });
    expect(b).toEqual(a);
    expect(sb.calls.inserts).toHaveLength(1);
    expect(sb.calls.rpc).toBe(1);
  });

  it("הכרעה חוזרת אחרי שהראשונה הסתיימה רצה מחדש (השומר מתנקה)", async () => {
    const sb = fakeSupabase({ owned: [OWNED_ROW] });
    await resolveRootLanding(sb, "user-seq", makeSlug);
    await resolveRootLanding(sb, "user-seq", makeSlug);
    expect(sb.calls.selects).toBe(2);
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

describe("fetchLastViewedGroupResult — הבחנת כשל מ״אין צפיות״ (פריט 1.4)", () => {
  const sbWith = (result) => ({ rpc: () => Promise.resolve(result) });

  it("יש צפייה → { ok: true, group }", async () => {
    const out = await fetchLastViewedGroupResult(
      sbWith({ data: [{ slug: "s1", name: "קבוצה" }], error: null })
    );
    expect(out).toEqual({ ok: true, group: { slug: "s1", name: "קבוצה" } });
  });

  it("אין צפיות → { ok: true, group: null } — תשובה חיובית, לא כשל", async () => {
    const out = await fetchLastViewedGroupResult(sbWith({ data: [], error: null }));
    expect(out).toEqual({ ok: true, group: null });
  });

  it("שגיאת שרת → { ok: false } — כשל, לא ״אין צפיות״", async () => {
    const out = await fetchLastViewedGroupResult(
      sbWith({ data: null, error: { message: "boom" } })
    );
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
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

  it("מסך השגיאה מציע ניסיון־חוזר — כשל חולף לא תוקע את המשתמש (פריט 1.4)", () => {
    expect(src).toContain("window.location.reload()");
    expect(src).toContain("נסה שוב");
  });
});
