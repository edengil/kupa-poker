import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { processPushQueue } from "@/lib/pushQueue";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   עיבוד תור ההתראות — נקרא מ-cron כל דקה.
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const supabase = getAdminSupabase();
    const result = await processPushQueue(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await reportError(err, "push-queue");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
