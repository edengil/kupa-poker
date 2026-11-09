/* בדיקת קיום קבוצה בשרת לנתיב הציבורי (גל 6, פריט 6.3 / ו-30).

   עד הגל, /g/<slug> החזיר תמיד 200 — גם ל־slug שלא קיים (soft-404):
   הדף נטען, הלקוח נכשל מאוחר, והמשתמש ראה מסך ריק. כאן: שאילתת קיום
   קלה בצד השרת (עמודות id+slug בלבד), והנתיב קורא notFound() רק על
   תשובה שלילית מובהקת. כשל שאילתה (רשת/מסד) ≠ קבוצה חסרה — לא חוסמים
   צופים אמיתיים בגלל תקלה חולפת. */

export async function groupExists(admin, slug) {
  if (!slug || typeof slug !== "string") return false;
  try {
    const { data, error } = await admin
      .from("groups")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
}
