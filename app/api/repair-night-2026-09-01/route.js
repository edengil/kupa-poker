import { NextResponse } from "next/server";

/* הנתיב החד-פעמי לערב 1.9.2026 כובה.
   אין כאן נתוני ערב, ואין כתיבה ללייב — גם עם סוד ודגל כתיבה. */

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}

export function POST() {
  return NextResponse.json({ error: "gone" }, { status: 410 });
}
