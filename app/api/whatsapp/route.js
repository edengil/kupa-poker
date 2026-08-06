import { NextResponse } from "next/server";
import { getAdminSupabase, pingViewers } from "@/lib/supabaseAdmin";
import {
  parseCommands, applyCommands, extractMessage, isAllowed,
  sendToGroup, listGroups, BOT_MARK,
} from "@/lib/whatsapp";

/* ============================================================================
   נקודת הקצה שמקבלת הודעות מקבוצת הוואטסאפ.

   שלוש שכבות סינון לפני שנוגעים בנתונים, לפי הסדר:
     1. סוד בכתובת — בלעדיו אף אחד לא יכול אפילו לנסות
     2. הקבוצה הנכונה — הודעות מכל צ'אט אחר נזרקות
     3. הבעלים בלבד — רק עדן מפקד, כמו שביקשת
   ============================================================================ */

export const dynamic = "force-dynamic";

const ok = (extra = {}) => NextResponse.json({ ok: true, ...extra });

function guard(request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret");
  return Boolean(secret) && given === secret;
}

/* אבחון בלי לדלוף את הסוד עצמו: אומר רק אם המשתנה קיים בכלל ומה אורכו.
   configured:false פירושו שהבנייה רצה לפני שהמשתנים נוספו. */
function why(request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret");
  return {
    error: "forbidden",
    configured: Boolean(secret),
    expectedLength: secret ? secret.length : 0,
    receivedLength: given ? given.length : 0,
    hasSupabaseKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    hasWhapiToken: Boolean(process.env.WHAPI_TOKEN),
    hasSlug: Boolean(process.env.KUPA_GROUP_SLUG),
  };
}

/* עזר חד-פעמי: מאתר את מזהה הקבוצה בהתקנה הראשונה. */
export async function GET(request) {
  if (!guard(request)) return NextResponse.json(why(request), { status: 403 });
  try {
    const groups = await listGroups(process.env.WHAPI_TOKEN);
    const list = (groups?.groups || []).map((g) => ({ id: g.id, name: g.name || g.subject }));
    return NextResponse.json({ groups: list });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!guard(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let msg;
  try {
    msg = extractMessage(await request.json());
  } catch {
    return ok({ skipped: "bad payload" });
  }
  if (!msg) return ok({ skipped: "no text" });

  // תשובות של הבוט עצמו — אחרת נוצרת לולאה
  if (msg.text.trim().startsWith(BOT_MARK)) return ok({ skipped: "bot echo" });

  const groupId = process.env.WHAPI_GROUP_ID;
  if (groupId && msg.chatId !== groupId) return ok({ skipped: "other chat" });

  if (!isAllowed(msg, process.env.WHATSAPP_OWNER, process.env.WHATSAPP_ALLOWED))
    return ok({ skipped: "not allowed" });

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, slug, live, config")
    .eq("slug", process.env.KUPA_GROUP_SLUG)
    .single();

  if (error || !row) {
    console.error("group lookup failed:", error?.message);
    return ok({ skipped: "no group" });
  }

  /* המתג מהאפליקציה: כשהבוט כבוי הוא פשוט לא מגיב לכלום. החיבור ל-Whapi
     נשאר חי — רק ההתנהגות מושתקת, ולכן אין צורך בסריקת QR מחדש. */
  if (!row.config?.botOn) return ok({ skipped: "bot off" });

  const live = row.live || null;
  const gameActive = (live?.players?.length || 0) > 0;
  const cmds = parseCommands(msg.text, live?.addAmt || 50, gameActive);
  if (!cmds.length) return ok({ skipped: "not a command" });

  // מזהה ההודעה הוא מה שמאפשר לזהות עריכה או שליחה כפולה
  const { live: nextLive, reply } = applyCommands(live, cmds, msg.id);
  if (!reply) return ok({ skipped: "nothing to do" });

  const changed = nextLive !== live;
  if (changed) {
    const { error: writeError } = await supabase
      .from("groups")
      .update({ live: nextLive })
      .eq("id", row.id);
    if (writeError) {
      console.error("live write failed:", writeError.message);
      return ok({ skipped: "write failed" });
    }
    await pingViewers(row.slug);
  }

  try {
    await sendToGroup(reply, {
      token: process.env.WHAPI_TOKEN,
      groupId: msg.chatId,
    });
  } catch (e) {
    console.error(e.message); // הנתונים כבר נשמרו — התשובה היא בונוס
  }

  return ok({ handled: cmds.length });
}
