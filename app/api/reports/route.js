import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPeriodReports } from "@/lib/runPeriodReports";

/* ============================================================================
   הדוחות התקופתיים לקבוצה.

   נקרא גם מ־/api/cron-daily (Hobby: פעם ביום) וגם ידנית:
   /api/reports?secret=<סוד>&force=m   (או q / h / y)
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const force = new URL(request.url).searchParams.get("force");
  const out = await runPeriodReports({ force });
  if (!out.ok && out.error) {
    return NextResponse.json({ error: out.error }, { status: 500 });
  }
  return NextResponse.json(out);
}
