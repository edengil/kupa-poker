import { fetchLastViewedGroup } from "./realtime";

/* ============================================================================
   הכרעת נחיתה בשורש ("/") למשתמש מחובר.

   השורש הוא מסך הבעלים, אבל לא כל מחובר הוא בעלים: שחקן שצופה בקבוצה דרך
   הלינק הציבורי מחזיק רק שורות group_views. כשהוא פותח את האפליקציה
   המותקנת (start_url="/") אסור ליצור לו בשקט קבוצה חדשה וריקה ולהציג לו
   מסך מנהלים — מנתבים אותו למשטח הצפייה של הקבוצה האחרונה שצפה בה.

   שלוש תוצאות אפשריות:
   - { kind: "owner", row }        — יש קבוצה בבעלותו (או שנוצרה עכשיו
                                     עבור משתמש בלי שום שיוך); הקורא עולה
                                     כבעלים כרגיל.
   - { kind: "viewer", slug }      — אין קבוצה בבעלותו אבל יש קבוצה שהוא
                                     צופה בה; הקורא מנתב ל־/g/<slug>.
   - { kind: "error", message }    — שאילתת הבעלות או יצירת הקבוצה נכשלה.

   הזיהוי שרת־צדדי בלבד (לפי המשתמש המחובר), כי ה־localStorage של
   הדפדפן לא עובר למיכל של האפליקציה המותקנת ב־iOS.
   ============================================================================ */
export async function resolveRootLanding(supabase, userId, makeSlug) {
  const { data: rows, error } = await supabase
    .from("groups")
    .select("id, slug, name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) return { kind: "error", message: error.message };

  const owned = rows?.[0];
  if (owned) return { kind: "owner", row: owned };

  /* אין קבוצה בבעלותו — אם הוא צופה בקבוצה כלשהי, שם ביתו. לא יוצרים
     קבוצה למשתמש עם שיוך צפייה קיים. */
  const viewed = await fetchLastViewedGroup(supabase);
  if (viewed?.slug) return { kind: "viewer", slug: viewed.slug };

  /* אין שום שיוך — זה הנתיב היחיד שיוצר קבוצה: בעלים חדש באמת. */
  const { data: created, error: insertError } = await supabase
    .from("groups")
    .insert({ owner_id: userId, slug: makeSlug() })
    .select("id, slug, name")
    .single();
  if (insertError) return { kind: "error", message: insertError.message };
  return { kind: "owner", row: created, created: true };
}
