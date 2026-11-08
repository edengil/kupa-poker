import OwnerApp from "@/components/OwnerApp";
import { hostsFromEnv, publicHosts } from "@/lib/poker/hosts";
import { getServerSupabase } from "@/lib/supabaseServer";

// עמוד הבית חייב רינדור דינמי: הוא יוצר לקוח Supabase בזמן רינדור,
// ופרה-רינדור סטטי בבילד נופל כשמשתני הסביבה לא זמינים (Vercel).
export const dynamic = "force-dynamic";

/* שער המארחים (תיקון F5): ברירת המחדל ללקוח היא רק slug+label
   (publicHosts). ה־text של מארח מכיל כתובת, קומה/דירה וקוד כניסה
   לבניין, ו־props של רכיב־לקוח מסורבלים למטען ה־RSC של הדף — רשימה
   מלאה כאן הייתה נחשפת לכל GET אנונימי. הרשימה המלאה נמסרת רק למי
   שהשרת אימת כבעל קבוצה: סשן העוגייה (getServerSupabase) + שורת
   groups עם owner_id של המשתמש — אותו זיהוי בעלות כמו בשורש
   (lib/rootLanding). ההתחברות היא OAuth עם חזרה מלאה לדף, כך שבעלים
   מקבל את הרשימה המלאה מיד עם הנחיתה אחרי ההתחברות. */
async function hostsForRequest() {
  const fromEnv = hostsFromEnv();
  const fallback = publicHosts(fromEnv);
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return fallback;
    const { data: owned } = await supabase
      .from("groups")
      .select("id")
      .eq("owner_id", data.user.id)
      .limit(1);
    return owned?.length ? fromEnv : fallback;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  // הכתובות וקודי הבניינים לא חלק מהקוד (גל 4ב, ממצא 17) — ומהיום
  // גם לא חלק ממטען הדף לאנונימיים (תיקון F5).
  return <OwnerApp hosts={await hostsForRequest()} />;
}
