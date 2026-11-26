/* גל 6, פריט המשך — הקשחת updateGroupCas: שדה הגרסה updated_at חייב
   להיות בבחירת העמודות.

   הרקע: updateGroupCas קורא row.updated_at ?? null, ו־casWriteGroup
   מפרש null כ«בלי תנאי». קורא שמעביר columns בלי updated_at היה הופך
   את הכתיבה לבלתי־מותנית בשקט — דריסה עיוורת. היום כל הקוראים מעבירים
   את השדה (אומת ב־grep על כל הריפו), אז ההקשחה היא הגנת API: זריקה
   בקול במקום נפילה שקטה ל־null. הטסטים כאן נועלים את ההתנהגות. */
import { describe, expect, it } from "vitest";

import { updateGroupCas } from "../lib/groupCas.js";

const ROW = { id: "g1", config: {}, updated_at: "2026-11-26T10:00:00.000Z" };

function fakeSupabase(row = ROW) {
  const rpcCalls = [];
  const selectCalls = [];
  return {
    rpcCalls,
    selectCalls,
    from() {
      const chain = {
        select: (cols) => {
          selectCalls.push(cols);
          return chain;
        },
        eq: () => chain,
        single: () => Promise.resolve({ data: row, error: null }),
      };
      return chain;
    },
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: "2026-11-26T10:00:01.000Z", error: null });
    },
  };
}

describe("updateGroupCas — אכיפת שדה הגרסה", () => {
  it("columns בלי updated_at: זורק, ולא נוגע במסד בכלל", async () => {
    const sb = fakeSupabase();
    await expect(
      updateGroupCas(sb, "g1", () => ({ config: {} }), { columns: "id, config" })
    ).rejects.toThrow(/updated_at/);
    expect(sb.selectCalls).toHaveLength(0);
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it("columns בלי updated_at (בלי רווחים): זורק", async () => {
    const sb = fakeSupabase();
    await expect(
      updateGroupCas(sb, "g1", () => ({ config: {} }), { columns: "id,data,live" })
    ).rejects.toThrow(/updated_at/);
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it("ברירת המחדל: הכתיבה מותנית ב־updated_at שנקרא", async () => {
    const sb = fakeSupabase();
    const res = await updateGroupCas(sb, "g1", () => ({ config: { x: 1 } }));
    expect(res.ok).toBe(true);
    expect(sb.rpcCalls).toHaveLength(1);
    expect(sb.rpcCalls[0].name).toBe("write_group_cas");
    expect(sb.rpcCalls[0].args.p_expected_updated_at).toBe(ROW.updated_at);
  });

  it("columns מותאם שכולל updated_at: עובר, והגרסה מוזנת ל־CAS", async () => {
    const sb = fakeSupabase();
    const res = await updateGroupCas(sb, "g1", () => ({ config: { x: 2 } }), {
      columns: "id, config, updated_at",
      retries: 2,
    });
    expect(res.ok).toBe(true);
    expect(sb.rpcCalls[0].args.p_expected_updated_at).toBe(ROW.updated_at);
  });

  it("updated_at עם רווחים מסביב לפסיקים: מזוהה", async () => {
    const sb = fakeSupabase();
    const res = await updateGroupCas(sb, "g1", () => ({ config: { x: 3 } }), {
      columns: "id,config, updated_at ",
    });
    expect(res.ok).toBe(true);
  });
});
