import { fetchLastViewedGroupResult } from "./realtime";

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
   - { kind: "error", message }    — שאילתת הבעלות, שאילתת הצפיות או
                                     יצירת הקבוצה נכשלה; הקורא מציג מסך
                                     שגיאה עם ניסיון־חוזר, לא יוצר ולא נתקע.

   פריט 1.4: כשל חולף ב־RPC של הצפייה האחרונה אינו "אין קבוצה" — הוא
   שגיאה. קבוצה נוצרת רק על תשובה חיובית מהשרת שאין למשתמש שום צפייה
   (וגם אין בעלות). צופה שהקבוצה האחרונה שלו נמחקה (cascade מוחק את
   שורות הצפייה שלו) מקבל בדיוק את התשובה החיובית הזו, ולכן נוחת כמשתמש
   חדש — לא נשאר תקוע עם מצביע לקבוצה מתה על מסך מנהלים ריק.

   הזיהוי שרת־צדדי בלבד (לפי המשתמש המחובר), כי ה־localStorage של
   הדפדפן לא עובר למיכל של האפליקציה המותקנת ב־iOS.
   ============================================================================ */

/* שומר in-flight (פריט 1.4): שתי הכרעות מקבילות לאותו משתמש (boot כפול —
   הרכבת אפקט כפולה, רענון באמצע טעינה) חולקות ריצה אחת, כדי שמשתמש חדש
   לא יקבל שתי קבוצות משני insert־ים מקבילים. הריצה מתנקה כשהיא מסתיימת,
   כך שהכרעה מאוחרת (אחרי שינוי מצב אמיתי) רצה מחדש כרגיל. */
const inflightLandings = new Map(); // userId -> Promise<landing>

export function resolveRootLanding(supabase, userId, makeSlug) {
  const existing = inflightLandings.get(userId);
  if (existing) return existing;
  const run = resolveRootLandingOnce(supabase, userId, makeSlug).finally(() => {
    if (inflightLandings.get(userId) === run) inflightLandings.delete(userId);
  });
  inflightLandings.set(userId, run);
  return run;
}

async function resolveRootLandingOnce(supabase, userId, makeSlug) {
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
  const viewed = await fetchLastViewedGroupResult(supabase);
  if (!viewed.ok) {
    /* כשל חולף ≠ "אין צפיות": לא יוצרים קבוצת־זבל, לא תוקעים — שגיאה
       עם ניסיון־חוזר אצל הקורא. */
    return { kind: "error", message: viewed.error?.message || "last viewed group lookup failed" };
  }
  if (viewed.group?.slug) return { kind: "viewer", slug: viewed.group.slug };

  /* תשובה חיובית שאין שום שיוך — זה הנתיב היחיד שיוצר קבוצה: בעלים חדש באמת. */
  const { data: created, error: insertError } = await supabase
    .from("groups")
    .insert({ owner_id: userId, slug: makeSlug() })
    .select("id, slug, name")
    .single();
  if (insertError) return { kind: "error", message: insertError.message };
  return { kind: "owner", row: created, created: true };
}
