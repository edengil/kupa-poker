import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { safeNextPath } from "@/lib/safeNext";

/** Google מחזיר לכאן אחרי ההתחברות. מחליפים את הקוד בסשן ומחזירים הביתה.
    ‏next עובר דרך safeNextPath — רק נתיבים פנימיים, בלי open redirect (גל 2). */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
