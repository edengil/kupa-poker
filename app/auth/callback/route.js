import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { lookupHome } from "@/lib/lookupHome";
import { resolveLanding } from "@/lib/homeRoute";

function safeNext(next) {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/** Google מחזיר לכאן אחרי ההתחברות. מחליפים את הקוד בסשן ומחזירים הביתה. */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = safeNext(searchParams.get("next") ?? "/");

  if (code) {
    const supabase = getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      /* אייפון: האייקון פותח `/` (מתעלם מ-start_url). אחרי Google מחזירים
         צופה ל-/g/<slug> האחרון שלו — לא לקופה ריקה של מנהל. */
      if (next === "/") {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const home = await lookupHome(data.user.id);
          const landing = resolveLanding({ ...home, standalone: false });
          if (landing.type === "viewer" && landing.slug) next = `/g/${landing.slug}`;
        }
      }
      const res = NextResponse.redirect(`${origin}${next}`);
      const slug = next.startsWith("/g/") ? next.slice(3).split("/")[0] : "";
      if (slug) {
        res.cookies.set("poker_last_view", slug, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      }
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
