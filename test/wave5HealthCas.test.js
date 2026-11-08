import { describe, it, expect } from "vitest";
import { recordWaSend } from "../lib/wa/healthServer.js";
import { botHealthView } from "../lib/wa/health.js";

/* ============================================================================
   גל 5, פריט 5.7 (פסק שער 0.4): חישוב מצב הבריאות עבר לתוך פונקציית
   ה־build של כתיבת ה־CAS — שתי כתיבות בריאות מקביליות על אותה קבוצה
   (למשל כשל שליחת וובהוק והצלחת תזכורת־קרון באותה שנייה) חייבות שתיהן
   לשרוד ב־config.botHealth הסופי. עם החישוב הישן (next מצילום ישן)
   הכתיבה השנייה הייתה דורסת את האירוע של הראשונה.
   ============================================================================ */

/* לקוח מזויף עם write_group_cas אמיתי: כתיבה נוחתת רק אם ה־updated_at
   שווה למצופה, אחרת conflict (data: null) וה־updateGroupCas מנסה שוב
   מול השורה הטרייה — בדיוק כמו ה־SQL. */
function casFakeSupabase(initialConfig = {}) {
  const state = {
    config: initialConfig,
    updatedAt: 1000,
    inserts: [],
  };
  const tick = () => new Promise((r) => setTimeout(r, 1));
  const sb = {
    rpc: async (fn, args) => {
      if (fn !== "write_group_cas") throw new Error(`unexpected rpc ${fn}`);
      await tick(); // מאלץ שתי הקריאות המקביליות לקרוא prev לפני הכתיבה
      if (args.p_expected_updated_at != null && args.p_expected_updated_at !== state.updatedAt) {
        return { data: null, error: null };
      }
      const patch = args.p_patch || {};
      if (patch.config) state.config = patch.config;
      state.updatedAt += 1;
      return { data: state.updatedAt, error: null };
    },
    from(table) {
      if (table === "diag_events") {
        return {
          insert: async (row) => {
            state.inserts.push(row);
            return { error: null };
          },
        };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: { id: 7, config: state.config, updated_at: state.updatedAt },
          error: null,
        }),
        maybeSingle: async () => ({
          data: { id: 7, config: state.config, updated_at: state.updatedAt },
          error: null,
        }),
      };
      return chain;
    },
  };
  return { sb, state };
}

describe("5.7 — recordWaSend מחשב את ה־next בתוך ה־build של ה־CAS", () => {
  it("כשל והצלחה מקביליים — שני האירועים שורדים ב־botHealth הסופי", async () => {
    const { sb, state } = casFakeSupabase({ botOn: true });
    const [failOut, okOut] = await Promise.all([
      recordWaSend({
        supabase: sb,
        groupId: 7,
        ok: false,
        error: new Error("Whapi send failed (404): not found"),
        where: "whatsapp/reply",
      }),
      recordWaSend({ supabase: sb, groupId: 7, ok: true, where: "payment-reminders/x" }),
    ]);
    const health = state.config.botHealth;
    /* שני האירועים שרדו ב־botHealth הסופי: פרטי הכשל מהאירוע האחד
       וחותמת ההצלחה מהאחר — עם החישוב הישן ה־lastFail* היו נמחקים
       כשהכתיבה השנייה דורסת את הראשונה. (המצב הסופי תלוי בסדר הנחיתה
       של שתי הכתיבות, ולכן לא נטען כאן.) */
    expect(health.lastFailAt).toEqual(expect.any(Number));
    expect(health.lastFailWhere).toBe("whatsapp/reply");
    expect(health.lastOkAt).toEqual(expect.any(Number));
    expect(botHealthView(health).state).toMatch(/^(up|down)$/);
    expect(state.config.botOn).toBe(true);
    expect(failOut).toBeTruthy();
    expect(okOut).toBeTruthy();
    /* שורת הכשל ב־diag נכתבה פעם אחת */
    expect(state.inserts.filter((r) => r.kind === "wa-send-fail")).toHaveLength(1);
  });

  it("שני כשלים מקביליים — המונה סופר את שניהם", async () => {
    const { sb, state } = casFakeSupabase({});
    await Promise.all([
      recordWaSend({ supabase: sb, groupId: 7, ok: false, error: new Error("a"), where: "w1" }),
      recordWaSend({ supabase: sb, groupId: 7, ok: false, error: new Error("b"), where: "w2" }),
    ]);
    expect(state.config.botHealth.fails).toBe(2);
  });
});
