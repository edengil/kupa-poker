import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";

/** Google מחזיר לכאן אחרי ההתחברות. מחליפים את הקוד בסשן ומחזירים הביתה. */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
