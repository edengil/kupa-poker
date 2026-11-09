import { notFound } from "next/navigation";
import PublicApp from "@/components/PublicApp";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { groupExists } from "@/lib/groupExists";

/* הלינק הציבורי. הנתונים נטענים בצד הלקוח אחרי התחברות — public_group
   כבר לא פתוח ל-anon, אז אין מה לשלוף כאן בשרת.
   גל 6 (6.3): לפני הרינדור בודקים בשרת שהקבוצה קיימת — slug לא קיים
   מחזיר 404 אמיתי עם מסך עברי, במקום soft-404 עם דף ריק. */
export const dynamic = "force-dynamic";

export default async function PublicGroupPage({ params }) {
  const { slug } = await params;
  if (!(await groupExists(getAdminSupabase(), slug))) notFound();
  return <PublicApp slug={slug} />;
}

export const metadata = { title: "קופה — פוקר · צפייה" };
