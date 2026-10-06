import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import {
  calendarConfigured,
  getEventAttendeeResponses,
  removeEventAttendee,
} from "@/lib/googleCalendar";
import { knownPlayerNames, playerEmail } from "@/lib/poker/emailRsvp";

/* ============================================================================
   סנכרון דו-כיווני בין אירוע היומן לאפליקציה.

   יומן → אפליקציה: תשובות האורחים (accepted/declined) נרשמות כמגיע/לא מגיע.
   אפליקציה → יומן: מי שענה "לא מגיע" באפליקציה מוסר מרשימת האורחים באירוע.

   נקרא כשהבעלים פותח את כרטיס הערב (וכפתור "סנכרן" ידני).
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
  const supabase = bearer ? userClientFromBearer(bearer) : getServerSupabase();
  const { data, error } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();
  const user = data?.user || null;
  if (error || !user) return { error: "לא מחובר", status: 401, code: "auth" };
  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (gErr) return { error: "שגיאת מסד נתונים", status: 500, code: "db" };
  if (!group) return { error: "אין קבוצה", status: 403, code: "no_group" };
  return { user, group };
}

export async function POST(request) {
  let auth;
  try {
    auth = await resolveOwner(request);
  } catch (e) {
    await reportError(e, "calendar-sync/auth");
    return NextResponse.json({ error: "אימות נכשל", code: "auth_crash" }, { status: 500 });
  }
  if (auth.error) {
    return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  }
  if (!(await calendarConfigured(auth.group.id))) {
    return NextResponse.json({ configured: false, code: "calendar_off" });
  }

  const admin = getAdminSupabase();
  const { data: groupRow, error: readErr } = await admin
    .from("groups")
    .select("id, data")
    .eq("id", auth.group.id)
    .maybeSingle();
  if (readErr || !groupRow) {
    return NextResponse.json({ error: "שגיאת מסד נתונים", code: "db" }, { status: 500 });
  }
  const db = groupRow.data || {};
  const plan = db.plan || null;
  const eventId = plan?.calendarEventId;
  if (!plan?.iso || !eventId) {
    return NextResponse.json({ configured: true, synced: 0, code: "no_event" });
  }

  // מיפוי אימייל → שם שחקן
  const emailToName = new Map();
  for (const name of knownPlayerNames(db)) {
    const email = playerEmail(db, name);
    if (email) emailToName.set(email.toLowerCase(), name);
  }

  let responses;
  try {
    responses = await getEventAttendeeResponses(eventId, auth.group.id);
  } catch (e) {
    await reportError(e, "calendar-sync/fetch");
    return NextResponse.json(
      { error: "קריאת האירוע מהיומן נכשלה", code: "calendar_failed" },
      { status: 502 }
    );
  }

  const rsvps = { ...(plan.calendarRsvps || {}) };
  let synced = 0;
  const removed = [];
  const appNo = new Set(
    Object.entries(plan.emailRsvps || {})
      .filter(([, v]) => v?.status === "no")
      .map(([name]) => name)
  );

  for (const r of responses) {
    const name = emailToName.get(r.email);
    if (!name) continue;
    if (r.responseStatus === "accepted" && rsvps[name]?.status !== "yes") {
      rsvps[name] = { status: "yes", at: Date.now(), via: "calendar" };
      synced++;
    } else if (r.responseStatus === "declined" && rsvps[name]?.status !== "no") {
      rsvps[name] = { status: "no", at: Date.now(), via: "calendar" };
      synced++;
    }
    // וההפך: ענה "לא מגיע" באפליקציה אבל עדיין אורח — מסירים מהאירוע
    if (appNo.has(name)) {
      try {
        await removeEventAttendee(eventId, r.email, auth.group.id);
        removed.push(name);
      } catch (e) {
        await reportError(e, "calendar-sync/remove");
      }
    }
  }

  const nextData = {
    ...db,
    plan: { ...plan, calendarRsvps: rsvps, calendarSyncedAt: Date.now() },
  };
  await admin.from("groups").update({ data: nextData }).eq("id", groupRow.id);

  return NextResponse.json({ configured: true, synced, removed, rsvps });
}
