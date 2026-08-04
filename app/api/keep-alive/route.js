import { NextResponse } from "next/server";
import { getAnonSupabase } from "@/lib/supabaseServer";

/* ============================================================================
   שמירה על הפרויקט ער.

   Supabase משהה פרויקטים בתוכנית החינמית אחרי 7 ימים בלי פניות למסד. קבוצת
   פוקר שמשחקת פעם בחודש נופלת בדיוק לתוך זה: החברים היו פותחים את הלינק
   ומקבלים מסך ריק, בלי שום סימן למה.

   הנתיב הזה עושה שאילתה זולה אחת. Vercel קורא לו לפי הלוח ב-vercel.json,
   והשעון של Supabase מתאפס בכל פעם.
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getAnonSupabase();
    // slug שלא קיים — מספיק כדי לגעת במסד, ולא מחזיר שום דבר
    const { error } = await supabase.rpc("public_group", { p_slug: "__keepalive__" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
