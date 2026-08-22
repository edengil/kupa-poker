import { NextResponse } from "next/server";

/** אייפון שומר את העוגיה באותו WebView. ביקור ב-/g/<slug> רושם לאן לחזור מ-`/`. */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  const res = NextResponse.next();
  const m = pathname.match(/^\/g\/([a-z0-9]+)$/i);
  if (m) {
    res.cookies.set("poker_last_view", m[1], {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}

export const config = {
  matcher: ["/g/:slug"],
};
