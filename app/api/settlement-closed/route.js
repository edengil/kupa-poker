import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { sendToGroup } from "@/lib/whatsapp";
import { reportError } from "@/lib/monitor";
import { allTransfersPaid, buildSettlementClosedText } from "@/lib/settlementClosed";
import { siteUrlFromEnv } from "@/lib/paymentReminder";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function userFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearer || !URL || !ANON) return null;
  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data, error } = await supabase.auth.getUser(bearer);
  if (error || !data?.user) return null;
  return data.user;
}

/** כשכולם סימנו — הודעה אחת לקבוצה. */
export async function POST(request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const slug = String(body.slug || "").trim();
  const sessionId = String(body.sessionId || "").trim();
  if (!slug || !sessionId) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return NextResponse.json({ error: "no group" }, { status: 404 });

  const sentMap = { ...(row.config?.settlementClosed || {}) };
  if (sentMap[sessionId]) return NextResponse.json({ ok: true, skipped: "already sent" });

  const session = (row.data?.sessions || []).find((s) => s?.id === sessionId);
  if (!session) return NextResponse.json({ error: "no session" }, { status: 404 });
  if (!allTransfersPaid(session)) return NextResponse.json({ ok: true, skipped: "still open" });

  const groupId = process.env.WHAPI_GROUP_ID;
  const token = process.env.WHAPI_TOKEN;
  if (!groupId || !token) {
    await reportError(new Error("WHAPI missing"), "settlement-closed");
    return NextResponse.json({ error: "whatsapp" }, { status: 500 });
  }

  const text = buildSettlementClosedText(session, {
    siteUrl: siteUrlFromEnv(),
    slug: row.slug || slug,
  });
  try {
    await sendToGroup(text, { token, groupId });
  } catch (e) {
    await reportError(e, `settlement-closed/${sessionId}`);
    return NextResponse.json({ error: "send failed" }, { status: 502 });
  }

  sentMap[sessionId] = new Date().toISOString();
  await supabase
    .from("groups")
    .update({ config: { ...(row.config || {}), settlementClosed: sentMap } })
    .eq("id", row.id);

  return NextResponse.json({ ok: true, sent: true });
}
