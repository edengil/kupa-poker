import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPaymentReminders } from "@/lib/runPaymentReminders";

/* ============================================================================
   תזכורת ביום שאחרי המשחק ב־10:00 שעון ישראל.

   בדיקה: /api/payment-reminders?secret=<סוד>&force=1
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const force = Boolean(new URL(request.url).searchParams.get("force"));
  const out = await runPaymentReminders({ force });
  if (!out.ok && out.error) {
    return NextResponse.json({ error: out.error }, { status: 500 });
  }
  return NextResponse.json(out);
}
