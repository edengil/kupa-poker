import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { serverSiteUrl } from "@/lib/env";
import { signRsvpToken, rsvpTokenExpiry, rsvpTokensConfigured } from "@/lib/rsvpToken";
import { inviteRecipientLists, markEmailInvites, planSummaryText } from "@/lib/poker/emailRsvp";
import { sendInviteMail, inviteMailConfigured } from "@/lib/inviteMail";

/* ============================================================================
   שליחת זימוני אימייל לכל השחקנים כשנפתח ערב.

   רק הבעלים יכול לזמן, והנתיב קורא את רשימת האימיילים מהנתונים הטריים
   בשרת — לא מהדפדפן — כדי שלא יישלח זימון על סמך רשימה ישנה. שחקן שכבר
   קיבל זימון לערב הזה לא מקבל שני. התשובות חוזרות דרך /api/rsvp-confirm.
   ============================================================================ */

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function userClientFromBearer(bearer) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${bearer}` },
      fetch: (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" }),
    },
  });
}

async function resolveOwner(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearer) {
    try {
      const supabase = userClientFromBearer(bearer);
      const { data: userData, error } = await supabase.auth.getUser(bearer);
      if (error || !userData?.user) {
        return { error: "לא מחובר — התחבר מחדש", status: 401, code: "auth" };
      }
      const { data: group, error: gErr } = await supabase
        .from("groups")
        .select("id")
        .eq("owner_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      if (gErr) return { error: "שגיאת מסד נתונים", status: 500, code: "db", detail: gErr.message };
      if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
      return { user: userData.user, group, supabase };
    } catch (e) {
      return { error: "אימות נכשל", status: 500, code: "auth_crash", detail: e instanceof Error ? e.message : String(e) };
    }
  }

  const supabase = getServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "לא מחובר — התחבר מחדש", status: 401, code: "auth" };
  }
  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (gErr) return { error: "שגיאת מסד נתונים", status: 500, code: "db", detail: gErr.message };
  if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
  return { user, group, supabase };
}

export async function POST(request) {
  let auth;
  try {
    auth = await resolveOwner(request);
  } catch (e) {
    await reportError(e, "email-invite/auth");
    return NextResponse.json({ error: "אימות נכשל", code: "auth_crash" }, { status: 500 });
  }
  if (auth.error) {
    return NextResponse.json({ error: auth.error, code: auth.code, detail: auth.detail }, { status: auth.status });
  }

  let planIso = "";
  try {
    const body = await request.json();
    planIso = String(body?.planIso || "");
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה", code: "bad_json" }, { status: 400 });
  }

  if (!inviteMailConfigured() || !rsvpTokensConfigured()) {
    return NextResponse.json({ error: "שליחת מייל לא מוגדרת בשרת", code: "mail_off" }, { status: 503 });
  }
  const baseUrl = serverSiteUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "כתובת האתר לא מוגדרת בשרת", code: "no_site_url" }, { status: 503 });
  }

  const admin = getAdminSupabase();
  const { data: groupRow, error: readErr } = await admin
    .from("groups")
    .select("id, name, data")
    .eq("id", auth.group.id)
    .maybeSingle();
  if (readErr || !groupRow) {
    return NextResponse.json({ error: "שגיאת מסד נתונים", code: "db" }, { status: 500 });
  }
  const db = groupRow.data || {};
  const plan = db.plan || null;
  if (!plan?.iso || (planIso && planIso !== plan.iso)) {
    return NextResponse.json({ error: "אין ערב פתוח לשלוח אליו זימונים", code: "no_plan" }, { status: 409 });
  }

  const { withEmail, withoutEmail } = inviteRecipientLists(db);
  const alreadyInvited = [];
  const pending = [];
  for (const r of withEmail) {
    if (plan.emailInvites?.[r.name]) alreadyInvited.push(r.name);
    else pending.push(r);
  }

  const summary = planSummaryText(plan);
  const exp = rsvpTokenExpiry(plan.iso);
  const sent = [];
  const failed = [];
  for (const r of pending) {
    const token = signRsvpToken({ groupId: groupRow.id, name: r.name, planIso: plan.iso, exp });
    if (!token) {
      failed.push(r.name);
      continue;
    }
    const link = (a) => `${baseUrl}/api/rsvp-confirm?t=${encodeURIComponent(token)}&a=${a}`;
    const res = await sendInviteMail({
      to: r.email,
      name: r.name,
      summary,
      yesUrl: link("yes"),
      noUrl: link("no"),
      groupName: groupRow.name,
    });
    if (res.sent) sent.push({ name: r.name, email: r.email });
    else failed.push(r.name);
  }

  if (sent.length) {
    // כתיבה מחדש מנתונים טריים, כדי לא לדרוס אישור שהגיע בינתיים מהאימייל
    const { data: fresh } = await admin
      .from("groups")
      .select("data")
      .eq("id", groupRow.id)
      .maybeSingle();
    const freshDb = fresh?.data || db;
    if (freshDb.plan?.iso === plan.iso) {
      const nextDb = { ...freshDb, plan: markEmailInvites(freshDb.plan, sent) };
      const { error: writeErr } = await admin
        .from("groups")
        .update({ data: nextDb })
        .eq("id", groupRow.id);
      if (writeErr) console.error("email-invite mark write failed:", writeErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sent.map((s) => s.name),
    failed,
    alreadyInvited,
    missingEmail: withoutEmail.map((r) => r.name),
  });
}
