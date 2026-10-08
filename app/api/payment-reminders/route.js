import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPaymentReminders } from "@/lib/runPaymentReminders";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   תזכורת ביום שאחרי המשחק ב־10:00 שעון ישראל.

   בדיקה: /api/payment-reminders?secret=<סוד>&force=1
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const force = Boolean(new URL(request.url).searchParams.get("force"));
    const out = await runPaymentReminders({ force });
    if (!out.ok && out.error) {
      await reportError(new Error(out.error), "payment-reminders");
      return NextResponse.json({ error: out.error }, { status: 500 });
    }
    return NextResponse.json(out);
  } catch (err) {
    await reportError(err, "payment-reminders");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
