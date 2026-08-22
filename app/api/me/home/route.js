import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { lookupHome } from "@/lib/lookupHome";

/** לאן להחזיר את המשתמש: בעלים נשאר ב-`/`, צופה חוזר ל-/g/<slug> האחרון שלו. */
export async function GET() {
  const supabase = getServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return NextResponse.json({ ownerSlug: null, viewerSlug: null, ownerEmpty: false }, { status: 401 });
  }
  const home = await lookupHome(user.id);
  return NextResponse.json(home, { headers: { "cache-control": "no-store" } });
}
