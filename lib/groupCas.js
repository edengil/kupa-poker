/* ============================================================================
   כתיבת שורת קבוצה עם הגנת גרסה (CAS) — ממצא ביקורת 9.

   כל הכותבים (חנות הלקוח, בוט הוואטסאפ, הריצות התקופתיות) עוברים דרך
   write_group_cas בשרת: הכתיבה נוחתת רק אם updated_at של השורה עדיין
   שווה לערך שהכותב קרא. התנגשות מחזירה conflict — והכותב קורא מחדש,
   ממזג מול הטרי, ומנסה שוב, במקום לדרוס בעיוורון את מי שכתב בינתיים.

   הפונקציות כאן מקבלות לקוח supabase מוזרק — אותו קוד רץ בדפדפן
   (לקוח הבעלים, תחת RLS) ובשרת (לקוח אדמין).
   ============================================================================ */

/**
 * ניסיון כתיבה אחד עם תנאי גרסה.
 * @param {object} supabase לקוח supabase (דפדפן או שרת)
 * @param {string} groupId מזהה שורת הקבוצה
 * @param {string|null} expectedUpdatedAt ה־updated_at שנקרא; null = בלי תנאי
 * @param {object} patch תת־קבוצה של { data, config, live } (ערך null מנקה)
 * @returns {Promise<{ ok: true, updatedAt: string } | { ok: false, conflict: true }>}
 * זורק על שגיאת רשת/מסד אמיתית — כמו כתיבה ישירה שהייתה נכשלת.
 */
export async function casWriteGroup(supabase, groupId, expectedUpdatedAt, patch) {
  const { data, error } = await supabase.rpc("write_group_cas", {
    p_id: groupId,
    p_expected_updated_at: expectedUpdatedAt ?? null,
    p_patch: patch,
  });
  if (error) throw new Error(error.message);
  if (data == null) return { ok: false, conflict: true };
  return { ok: true, updatedAt: data };
}

/**
 * קריאה → בניית תיקון → כתיבת CAS, עם ניסיון־חוזר על התנגשות.
 * בכל ניסיון build מקבל את השורה הטרייה ומחזיר patch (או null = אין
 * מה לכתוב). כך מיזוג מול מצב טרי קורה בתוך הלולאה, לא לפניה.
 *
 * @param {object} supabase
 * @param {string} groupId
 * @param {(row: object) => (object|null|Promise<object|null>)} build
 * @param {{ retries?: number, columns?: string }} [opts]
 * @returns {Promise<{ ok: boolean, conflict?: boolean, skipped?: boolean, updatedAt?: string, row?: object, attempts: number }>}
 */
export async function updateGroupCas(supabase, groupId, build, { retries = 3, columns = "id, data, config, live, updated_at" } = {}) {
  let attempts = 0;
  while (attempts < retries) {
    attempts++;
    const { data: row, error } = await supabase
      .from("groups")
      .select(columns)
      .eq("id", groupId)
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("group not found");
    const patch = await build(row);
    if (!patch || !Object.keys(patch).length) {
      return { ok: true, skipped: true, row, attempts };
    }
    const res = await casWriteGroup(supabase, groupId, row.updated_at ?? null, patch);
    if (res.ok) return { ok: true, updatedAt: res.updatedAt, row, attempts };
    /* conflict — השורה זזה; הניסיון הבא קורא ובונה מחדש מול הטרי */
  }
  return { ok: false, conflict: true, attempts };
}
