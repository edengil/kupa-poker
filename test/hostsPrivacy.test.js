import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publicHosts, setHosts, getHosts } from "../lib/poker/hosts.js";

/* תיקון F5: רשימת המארחים המלאה (כתובת, קומה/דירה, קוד כניסה לבניין)
   לא יוצאת ללקוח אנונימי. app/page.jsx הוא Server Component שמעביר
   props ל־OwnerApp (רכיב־לקוח), וה־props מסורבלים למטען ה־RSC של הדף —
   כלומר כל GET אנונימי לדף הבית היה מקבל את הרשימה המלאה ברגע
   ש־KUPA_HOSTS_JSON מוגדר. הבדיקות כאן מוכיחות:
   1. ההקרנה הציבורית (publicHosts) מכילה slug+label בלבד.
   2. דף הבית נותן את ההקרנה הציבורית לאנונימי ולמחובר־שאינו־בעלים.
   3. בעל קבוצה מאומת בשרת מקבל את הרשימה המלאה (זרימת הבעלים תקינה).
   4. כשל באימות השרת נופל חזרה להקרנה הציבורית, לא לרשימה המלאה.
   הנתונים בדיוניים, כמו בשאר בדיקות המארחים. */
const FIXTURE_HOSTS = [
  { slug: "dani", label: "דני", text: "אצל דני · הפרחים 3, עיר הדוגמה · קומה 4, דירה 12 · קוד בניין #1234#" },
  { slug: "noa", label: "נועה לוי", text: "אצל נועה לוי · הים 8, עיר הדוגמה · קומת קרקע" },
  { slug: "omer", label: "עומר", text: "אצל עומר · ההר 21, מושב לדוגמה · קומה 1, דירה 2 · קוד בניין 98765" },
];

/* מחרוזות שחיות רק בתוך ה־text הרגיש — אסור להן להופיע במטען אנונימי */
const SENSITIVE = ["הפרחים 3", "#1234#", "ההר 21", "98765", "קומה 4", "דירה 12", "קוד בניין"];

const mockState = vi.hoisted(() => ({ client: null, throws: false }));

vi.mock("@/lib/supabaseServer", () => ({
  getServerSupabase: async () => {
    if (mockState.throws) throw new Error("no session store");
    return mockState.client;
  },
}));

vi.mock("@/components/OwnerApp", () => ({ default: () => null }));

import HomePage from "../app/page.jsx";

function fakeClient({ user = null, owned = [] } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({ data: owned }),
        }),
      }),
    }),
  };
}

const originalEnv = process.env.KUPA_HOSTS_JSON;
beforeEach(() => {
  process.env.KUPA_HOSTS_JSON = JSON.stringify(FIXTURE_HOSTS);
  mockState.client = null;
  mockState.throws = false;
});
afterEach(() => {
  if (originalEnv === undefined) delete process.env.KUPA_HOSTS_JSON;
  else process.env.KUPA_HOSTS_JSON = originalEnv;
  setHosts([]);
});

async function hostsProp() {
  const el = await HomePage();
  return el.props.hosts;
}

function expectLabelsOnly(hosts) {
  expect(Array.isArray(hosts)).toBe(true);
  expect(hosts).toHaveLength(FIXTURE_HOSTS.length);
  for (const h of hosts) {
    expect(Object.keys(h).sort()).toEqual(["label", "slug"]);
  }
  const serialized = JSON.stringify(hosts);
  for (const s of SENSITIVE) expect(serialized).not.toContain(s);
}

describe("publicHosts — ההקרנה הציבורית", () => {
  it("מחזירה slug+label בלבד, בלי שדה text ובלי תוכן רגיש", () => {
    expectLabelsOnly(publicHosts(FIXTURE_HOSTS));
  });

  it("עוברת דרך אותו נירמול של parseHosts (כפילויות ופסולת נושרים)", () => {
    const messy = [
      ...FIXTURE_HOSTS,
      { slug: "DANI", label: "כפול", text: "אצל כפול · אחר 1, עיר" },
      { slug: "x", label: "בלי טקסט" },
    ];
    expectLabelsOnly(publicHosts(messy));
  });

  it("הזרקת ההקרנה הציבורית ללקוח לא מאכלסת את רשימת המארחים הפעילה", () => {
    /* שכבת הגנה שנייה: גם אם ההקרנה תגיע ל־setHosts, parseHosts זורק
       רשומות בלי text — הטקסט הרגיש לא יכול להיכנס למצב הלקוח ממנה. */
    setHosts(publicHosts(FIXTURE_HOSTS));
    expect(getHosts()).toEqual([]);
  });
});

describe("HomePage — שער המארחים בשרת (F5)", () => {
  it("אנונימי (אין סשן): רק slug+label במטען הדף", async () => {
    mockState.client = fakeClient({ user: null });
    expectLabelsOnly(await hostsProp());
  });

  it("מחובר שאינו בעל קבוצה: רק slug+label במטען הדף", async () => {
    mockState.client = fakeClient({ user: { id: "viewer-1" }, owned: [] });
    expectLabelsOnly(await hostsProp());
  });

  it("בעל קבוצה מאומת: הרשימה המלאה, כולל text (זרימת הבעלים תקינה)", async () => {
    mockState.client = fakeClient({ user: { id: "owner-1" }, owned: [{ id: "g1" }] });
    const hosts = await hostsProp();
    expect(hosts).toEqual(FIXTURE_HOSTS);
    expect(hosts.find((h) => h.slug === "dani").text).toContain("#1234#");
  });

  it("כשל באימות השרת: נפילה להקרנה הציבורית, לא לרשימה המלאה", async () => {
    mockState.throws = true;
    expectLabelsOnly(await hostsProp());
  });
});
