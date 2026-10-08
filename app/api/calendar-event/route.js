import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import {
  calendarConfigured,
  createEveningEvent,
  updateEveningEvent,
  findEveningEvents,
  deleteCalendarEvent,
} from "@/lib/googleCalendar";
import { inviteRecipientLists, planSummaryText } from "@/lib/poker/emailRsvp";

/* ============================================================================
   יצירת אירוע יומן גוגל לערב הפתוח — במקום זימון האימייל.

   רק הבעלים יכול ליצור. השרת קורא את רשימת האימיילים מהנתונים הטריים —
   לא מהדפדפן. גוגל שולחת אוטומטית זימון לכל האורחים. מזהה האירוע נשמר
   בתוכנית (plan.calendarEventId) לסנכרון התשובות בהמשך.

   אם היומן לא מחובר — מחזיר configured:false והקליינט נופל בחזרה לזימון אימייל.
   ============================================================================ */

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * בונה תיאור עשיר וחגיגי לאירוע היומן:
 * כותרת עם קלפים, מיקום בולט (כולל אצל מי משחקים), שעה, והזמנה לאשר הגעה.
 */
function buildRichEventDescription(plan, weekday) {
  const lines = ["🃏♠️♥️ ערב פוקר ♣️♦️🃏", "מי שלא בא יא חלייה 😂", ""];
  if (plan?.location) {
    lines.push(`📍 ${plan.location}`);
    lines.push("");
  }
  const d = plan?.iso ? new Date(`${plan.iso}T12:00:00`) : null;
  if (d && !Number.isNaN(d.getTime())) {
    const dateStr = `${d.getDate()} ב${["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"][d.getMonth()]} ${d.getFullYear()}`;
    lines.push(`🕐 יום ${weekday} · ${dateStr}${plan?.time ? ` · בשעה ${plan.time}` : ""}`);
    lines.push("");
  }
  if (plan?.note) {
    lines.push(`📝 ${plan.note}`);
    lines.push("");
  }
  lines.push("יאללה בואו לשחק! 🎰");
  lines.push("אשרו הגעה כאן ביומן או באתר: https://kupa-poker.vercel.app");
  lines.push("");
  lines.push("נשלח מקופת הפוקר 🃏");
  return lines.join("\n");
}

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
    if (gErr) return { error: "שגיאת מסד נתונים", status: 500, code: "db" };
    if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
    return { user: userData.user, group, supabase };
  }

  const supabase = await getServerSupabase();
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
  if (gErr) return { error: "שגיאת מסד נתונים", status: 500, code: "db" };
  if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
  return { user, group, supabase };
}

export async function POST(request) {
  let auth;
  try {
    auth = await resolveOwner(request);
  } catch (e) {
    await reportError(e, "calendar-event/auth");
    return NextResponse.json({ error: "אימות נכשל", code: "auth_crash" }, { status: 500 });
  }
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error, code: auth.code },
      { status: auth.status }
    );
  }

  if (!(await calendarConfigured(auth.group.id))) {
    return NextResponse.json({ configured: false, code: "calendar_off" });
  }

  let planIso = "";
  try {
    const body = await request.json();
    planIso = String(body?.planIso || "");
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה", code: "bad_json" }, { status: 400 });
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
    return NextResponse.json({ error: "אין ערב פתוח", code: "no_plan" }, { status: 409 });
  }

  const { withEmail } = inviteRecipientLists(db);
  const emails = withEmail.map((r) => r.email);
  if (!emails.length) {
    return NextResponse.json({ configured: true, eventId: null, code: "no_emails" });
  }

  const d = new Date(`${plan.iso}T12:00:00`);
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });

  try {
    let eventId = plan.calendarEventId || null;
    // סמן pending מסמן בקשה אחרת שיוצרת כרגע — מחכים עד 15 שניות שהיא תסיים
    // במקום ליצור אירוע כפול
    if (eventId && eventId.startsWith("pending:")) {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        const { data: fresh } = await admin.from("groups").select("data").eq("id", groupRow.id).single();
        const cur = fresh?.data?.plan?.calendarEventId || null;
        if (cur && !cur.startsWith("pending:")) { eventId = cur; break; }
        if (!cur) { eventId = null; break; }
      }
      if (eventId && eventId.startsWith("pending:")) eventId = null; // פג תוקף ההמתנה
    }
    const eveningPayload = {
      iso: plan.iso,
      time: plan.time,
      location: plan.location,
      title: `🃏 ערב פוקר ♠️♥️ — ${weekday}`,
      description: buildRichEventDescription(plan, weekday),
      attendeeEmails: emails,
      groupId: auth.group.id,
    };
    // רשת ביטחון: לפני יצירה מחפשים אירוע קיים לאותו ערב ביומן
    if (!eventId) {
      const existing = await findEveningEvents(plan.iso, auth.group.id);
      if (existing.length) eventId = existing[0].id;
    }
    if (eventId) {
      // עדכון שקט של האירוע הקיים (בלי להספים את האורחים)
      try {
        await updateEveningEvent(eventId, eveningPayload);
      } catch (e) {
        if (e?.status === 404 || e?.status === 410) {
          // האירוע נמחק ידנית — מחפשים חלופה לפני יצירת חדש
          const existing = await findEveningEvents(plan.iso, auth.group.id);
          eventId = existing.length ? existing[0].id : null;
          if (eventId) await updateEveningEvent(eventId, eveningPayload);
        } else throw e;
      }
      // ניקוי עצמי: אם יש כפילויות מאותו ערב — שומרים את החדש ביותר, מוחקים את השאר בשקט
      if (eventId) {
        try {
          const dupes = await findEveningEvents(plan.iso, auth.group.id);
          const extras = dupes.filter((e) => e.id !== eventId);
          // שומרים את החדש ביותר כקנוני
          let canonical = eventId;
          for (const ex of extras) {
            const exTime = new Date(ex.created || 0).getTime();
            const canEv = dupes.find((e) => e.id === canonical);
            const canTime = new Date(canEv?.created || 0).getTime();
            if (exTime > canTime) canonical = ex.id;
          }
          for (const ex of dupes) {
            if (ex.id !== canonical) {
              try { await deleteCalendarEvent(ex.id, auth.group.id); } catch { /* ממשיכים */ }
            }
          }
          eventId = canonical;
        } catch { /* ניקוי נכשל — לא חוסם */ }
      }
      // מעדכן חותמת סנכרון
      const nextData = {
        ...db,
        plan: { ...plan, calendarEventId: eventId, calendarSyncedAt: Date.now() },
      };
      await admin.from("groups").update({ data: nextData }).eq("id", groupRow.id);
    } else {
      // כותבים סמן pending לפני הקריאה לגוגל — אם הבקשה תיכשל/תתנתק אחרי
      // שהאירוע נוצר, ניסיון חוזר לא ייצור אירוע כפול
      const pendingMarker = `pending:${Math.random().toString(36).slice(2)}:${Date.now()}`;
      await admin
        .from("groups")
        .update({ data: { ...db, plan: { ...plan, calendarEventId: pendingMarker } } })
        .eq("id", groupRow.id);
      // בדיקה אטומית: אם בקשה מקבילה כתבה סמן משלה אחרינו — היא מנצחת, מחכים לה
      const { data: checkRow } = await admin.from("groups").select("data").eq("id", groupRow.id).single();
      const checkMarker = checkRow?.data?.plan?.calendarEventId || null;
      if (checkMarker && checkMarker !== pendingMarker && checkMarker.startsWith("pending:")) {
        const deadline = Date.now() + 20000;
        let winner = null;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          const { data: w } = await admin.from("groups").select("data").eq("id", groupRow.id).single();
          const cur = w?.data?.plan?.calendarEventId || null;
          if (cur && !cur.startsWith("pending:")) { winner = cur; break; }
        }
        if (winner) {
          await updateEveningEvent(winner, eveningPayload);
          return NextResponse.json({ configured: true, eventId: winner, attendees: emails.length });
        }
        // המנצחת נכשלה — נופלים לחיפוש כפילות ואז יצירה
        const existing = await findEveningEvents(plan.iso, auth.group.id);
        if (existing.length) {
          eventId = existing[0].id;
          await updateEveningEvent(eventId, eveningPayload);
          const nextData = { ...db, plan: { ...plan, calendarEventId: eventId, calendarSyncedAt: Date.now() } };
          await admin.from("groups").update({ data: nextData }).eq("id", groupRow.id);
          return NextResponse.json({ configured: true, eventId, attendees: emails.length });
        }
      }
      eventId = await createEveningEvent(eveningPayload);
      // שומר את מזהה האירוע בתוכנית לסנכרון
      const nextData = {
        ...db,
        plan: { ...plan, calendarEventId: eventId, calendarSyncedAt: Date.now() },
      };
      await admin.from("groups").update({ data: nextData }).eq("id", groupRow.id);
    }
    return NextResponse.json({ configured: true, eventId, attendees: emails.length });
  } catch (e) {
    await reportError(e, "calendar-event/create");
    // טוקן פג/בוטל (400/401) — נופלים בחזרה לזימוני אימייל במקום שגיאה מתה
    if (/calendar_token_failed:(400|401)/.test(e.message || "")) {
      return NextResponse.json({ configured: false, code: "calendar_token_expired" });
    }
    return NextResponse.json(
      { error: "יצירת האירוע ביומן נכשלה", code: "calendar_failed", detail: e.message },
      { status: 502 }
    );
  }
}
