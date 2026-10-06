import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { pushToTargets } from "@/lib/push";
import { paymentPlan } from "@/lib/paymentTracking";
import { reportError } from "@/lib/monitor";

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

async function subsForPlayer(supabase, groupId, playerName) {
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("group_id", groupId)
    .eq("player_name", playerName);
  return data || [];
}

async function subsForEmail(supabase, groupId, email) {
  if (!email) return [];
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("group_id", groupId)
    .eq("email", email);
  return data || [];
}

const fmt = (v) => `${Math.round(Math.abs(Number(v) || 0)).toLocaleString("en-US")} ₪`;

/**
 * POST /api/notify-transfers
 * body: { slug, sessionId, action: "settlement" | "paid",
 *         transferIndex?, payerName?, amount?, payeeName? }
 *
 * - settlement: שולח לכל שחקן פוש אישי על ההעברות שלו (למי להעביר / מי יעביר אליו)
 * - paid: שחקן אישר תשלום — מתריע למנהל (המשתמש המחובר)
 */
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
  const action = String(body.action || "").trim();
  if (!slug || !sessionId || !["settlement", "paid"].includes(action)) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return NextResponse.json({ error: "no group" }, { status: 404 });

  const session = (row.data?.sessions || []).find((s) => s?.id === sessionId);
  if (!session) return NextResponse.json({ error: "no session" }, { status: 404 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kupa-poker.vercel.app";
  const url = `${siteUrl}/g/${slug}`;

  try {
    if (action === "settlement") {
      const plan = paymentPlan(session);
      const open = plan.transfers.filter((t, i) => !plan.paid[i] && !plan.received[i]);
      if (!open.length) return NextResponse.json({ ok: true, sent: 0, skipped: "all paid" });

      // מקבץ לפי שחקן: למי הוא צריך להעביר / מי צריך להעביר אליו
      const perPlayer = new Map();
      for (const t of open) {
        const idx = plan.transfers.indexOf(t);
        if (!perPlayer.has(t.from)) perPlayer.set(t.from, { pay: [], receive: [] });
        if (!perPlayer.has(t.to)) perPlayer.set(t.to, { pay: [], receive: [] });
        perPlayer.get(t.from).pay.push({ to: t.to, amount: t.amount, index: idx });
        perPlayer.get(t.to).receive.push({ from: t.from, amount: t.amount, index: idx });
      }

      let sent = 0;
      for (const [name, { pay, receive }] of perPlayer) {
        const subs = await subsForPlayer(supabase, row.id, name);
        if (!subs.length) continue;
        const lines = [];
        for (const p of pay) lines.push(`אתה מעביר ${fmt(p.amount)} ל־${p.to}`);
        for (const r of receive) lines.push(`${r.from} מעביר אליך ${fmt(r.amount)}`);
        const res = await pushToTargets(subs, {
          title: "🃏 החלוקה מוכנה — קופה פוקר",
          body: lines.join("\n"),
          url,
          tag: `settle-${sessionId}`,
        });
        sent += res.sent || 0;
      }
      return NextResponse.json({ ok: true, sent, players: perPlayer.size });
    }

    // action === "paid" — שחקן אישר תשלום, מתריעים למנהל
    const payerName = String(body.payerName || "").trim();
    const payeeName = String(body.payeeName || "").trim();
    const amount = Number(body.amount) || 0;
    if (!payerName) return NextResponse.json({ error: "missing payer" }, { status: 400 });

    const adminSubs = await subsForEmail(supabase, row.id, user.email);
    if (!adminSubs.length) {
      return NextResponse.json({ ok: true, sent: 0, skipped: "admin not subscribed" });
    }
    const res = await pushToTargets(adminSubs, {
      title: "💰 אישור תשלום — קופה פוקר",
      body: `${payerName} אישר תשלום של ${fmt(amount)}${payeeName ? ` ל־${payeeName}` : ""}`,
      url,
      tag: `paid-${sessionId}-${body.transferIndex ?? "x"}`,
    });
    return NextResponse.json({ ok: true, sent: res.sent || 0 });
  } catch (e) {
    await reportError(e, "notify-transfers");
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
