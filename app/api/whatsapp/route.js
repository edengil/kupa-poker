import { NextResponse } from "next/server";
import { getAdminSupabase, pingViewers } from "@/lib/supabaseAdmin";
import { notifyGameStart } from "@/lib/push";
import { reportError } from "@/lib/monitor";
import {
  parseCommands, applyCommands, extractMessage, isAllowed,
  sendToGroup, listGroups, BOT_MARK, setPresenceOffline,
  maybeRemindPending,
} from "@/lib/whatsapp";
import { knownPlayerNames } from "@/components/poker/personalHighlights";
import { AL, canon } from "@/components/poker/helpers";
import { normalize } from "@/components/poker/db";
import {
  isNightShareText,
  nightIsoFromText,
  jerusalemIso,
  pinAfterSend,
  normalizePins,
} from "@/lib/waPins";

/* ============================================================================
   נקודת הקצה שמקבלת הודעות מקבוצת הוואטסאפ.

   שלוש שכבות סינון לפני שנוגעים בנתונים, לפי הסדר:
     1. סוד בכתובת — בלעדיו אף אחד לא יכול אפילו לנסות
     2. הקבוצה הנכונה — הודעות מכל צ'אט אחר נזרקות
     3. הבעלים בלבד — רק עדן מפקד, כמו שביקשת
   ============================================================================ */

export const dynamic = "force-dynamic";

const ok = (extra = {}) => NextResponse.json({ ok: true, ...extra });

/* משתנה מודול — שורד בין הפעלות חמות של הפונקציה. אחרי cold start הוא
   מתאפס וזה בסדר: המחיר הוא איפוס נוכחות אחד מיותר. */
let lastPresenceReset = 0;
const PRESENCE_THROTTLE_MS = 5 * 60 * 1000;

function guard(request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret");
  return Boolean(secret) && given === secret;
}

/* "בוט הדלק" / "בוט כבה" / "בוט" (מצב). מזוהה לפני כל שאר הפקודות. */
function parseBotControl(text) {
  const line = (text || "").trim();
  if (/^(?:בוט|רובוט)\s+(?:הדלק|הפעל|קום)$|^(?:הדלק|הפעל)\s+(?:את\s+ה?)?בוט$/.test(line)) return "on";
  if (/^(?:בוט|רובוט)\s+(?:כבה|עצור|שתוק)$|^(?:כבה|עצור)\s+(?:את\s+ה?)?בוט$/.test(line)) return "off";
  if (/^(?:בוט|רובוט)\s*\??$/.test(line)) return "state";
  return null;
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

  /* תשובות של הבוט עצמו — אחרת נוצרת לולאה. הבדיקה מחמירה בכוונה:
     לא רק תחילת ההודעה אלא כל אזכור של סימן הבוט, וגם ⚠️ בתחילת שורה.
     ב-6.8.26 תשובה שהתחילה ב-⚠️ (אזהרת שם דו-משמעי) עברה את הפילטר הישן,
     ושורות הסיכום שבה ("אורן מגיע 525₪") פורסרו כהוספות כסף לכולם. */
  const incoming = msg.text.trim();
  if (incoming.includes(BOT_MARK) || incoming.startsWith("⚠️")) {
    return ok({ skipped: "bot echo" });
  }

  const groupId = process.env.WHAPI_GROUP_ID;
  const ownerPhone = process.env.WHATSAPP_OWNER;
  const isOwnerDm =
    groupId &&
    msg.chatId !== groupId &&
    isAllowed(msg, ownerPhone, "");
  if (groupId && msg.chatId !== groupId && !isOwnerDm) return ok({ skipped: "other chat" });

  /* הודעה שעדן שלח מהטלפון = הוא היה "מחובר", ווואטסאפ יעצור את ההתראות
     שלו עד שהנוכחות תתאפס. מאפסים אחרי שימוש בטלפון — ההמלצה הרשמית של
     Whapi — אבל לכל היותר פעם בכמה דקות: התוכנית החינמית מוגבלת
     ל-1,000 קריאות API בחודש, וכל איפוס נספר. */
  if (isAllowed(msg, process.env.WHATSAPP_OWNER, "") && Date.now() - lastPresenceReset > PRESENCE_THROTTLE_MS) {
    lastPresenceReset = Date.now();
    await setPresenceOffline(process.env.WHAPI_TOKEN);
  }

  if (!isAllowed(msg, process.env.WHATSAPP_OWNER, process.env.WHATSAPP_ALLOWED))
    return ok({ skipped: "not allowed" });

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, slug, live, config, data")
    .eq("slug", process.env.KUPA_GROUP_SLUG)
    .single();

  if (error || !row) {
    await reportError(error || "group not found", "whatsapp/group-lookup");
    return ok({ skipped: "no group" });
  }

  /* שליטה בבוט מתוך הקבוצה — רק הבעלים, לא רשימת המורשים. הפקודות האלה
     נבדקות לפני מתג ה-botOn, אחרת אי אפשר היה להדליק בוט כבוי. */
  const botCmd = parseBotControl(msg.text);
  if (botCmd) {
    if (!isAllowed(msg, process.env.WHATSAPP_OWNER, "")) return ok({ skipped: "not owner" });
    let reply;
    if (botCmd === "state") {
      reply = `${BOT_MARK} הבוט כרגע ${row.config?.botOn ? "פעיל ✅" : "כבוי 💤"}`;
    } else {
      const botOn = botCmd === "on";
      const { error: cfgError } = await supabase
        .from("groups")
        .update({ config: { ...(row.config || {}), botOn } })
        .eq("id", row.id);
      if (cfgError) {
        console.error("bot toggle failed:", cfgError.message);
        return ok({ skipped: "toggle failed" });
      }
      reply = botOn
        ? `${BOT_MARK} הבוט פעיל — שולחים פקודות ואני על זה.`
        : `${BOT_MARK} הבוט כבוי. "בוט הדלק" יחזיר אותי.`;
    }
    try {
      await sendToGroup(reply, { token: process.env.WHAPI_TOKEN, groupId: msg.chatId });
    } catch (e) {
      console.error(e.message);
    }
    return ok({ botControl: botCmd });
  }

  /* המתג מהאפליקציה: כשהבוט כבוי הוא פשוט לא מגיב לכלום. החיבור ל-Whapi
     נשאר חי — רק ההתנהגות מושתקת, ולכן אין צורך בסריקת QR מחדש. */
  if (!row.config?.botOn) return ok({ skipped: "bot off" });

  const live = row.live || null;
  const gameActive = (live?.players?.length || 0) > 0 || (live?.pendingApprovals?.length || 0) > 0;
  const cmds = parseCommands(msg.text, live?.addAmt || 50, gameActive);

  const remindIfDue = async () => {
    const reminded = maybeRemindPending(live, Date.now(), { groupNudge: false });
    if (!reminded) return null;
    const { error: writeError } = await supabase
      .from("groups")
      .update({ live: reminded.live })
      .eq("id", row.id);
    if (writeError) {
      await reportError(writeError, "whatsapp/pending-remind");
      return "write-failed";
    }
    try {
      if (reminded.ownerDm && ownerPhone) {
        await sendToGroup(reminded.ownerDm, {
          token: process.env.WHAPI_TOKEN,
          groupId: ownerPhone,
        });
      }
    } catch (e) {
      console.warn("pending remind failed:", e.message);
    }
    return "sent";
  };

  if (!cmds.length) {
    const r = await remindIfDue();
    if (r === "sent") return ok({ reminded: true });
    if (r === "write-failed") return ok({ skipped: "write failed" });
    return ok({ skipped: "not a command" });
  }

  /* צ'אט פרטי עם עדן — רק אישור/דחייה של שחקן חדש, לא פקודות משחק. */
  if (isOwnerDm) {
    const kinds = new Set(cmds.map((c) => c.kind));
    if (![...kinds].every((k) => k === "approve" || k === "reject")) {
      const r = await remindIfDue();
      if (r === "sent") return ok({ reminded: true });
      return ok({ skipped: "owner dm not approval" });
    }
  }

  /* כתובת האפליקציה + slug — לפקודת "לינק" ול־CTA בסוף ערב (חלוקה באפליקציה).
     ידועים רק כאן, לא בפרסר. */
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  for (const c of cmds) {
    c.siteUrl = siteUrl;
    c.slug = row.slug;
  }

  const db = normalize(row.data || {});
  const aliases = AL(db);
  const knownNames = [
    ...knownPlayerNames(db),
    ...(live?.players || []).map((p) => canon(p.name, aliases)),
    ...(live?.approvedNames || []),
  ];

  // מזהה ההודעה הוא מה שמאפשר לזהות עריכה או שליחה כפולה
  const { live: nextLive, reply, ownerDm } = applyCommands(live, cmds, msg.id, undefined, { knownNames });
  if (!reply) return ok({ skipped: "nothing to do" });

  const changed = nextLive !== live;
  if (changed) {
    const { error: writeError } = await supabase
      .from("groups")
      .update({ live: nextLive })
      .eq("id", row.id);
    if (writeError) {
      await reportError(writeError, "whatsapp/live-write");
      return ok({ skipped: "write failed" });
    }
    await pingViewers(row.slug);

    // המשחק נפתח דרך הוואטסאפ (שחקן ראשון בשולחן) — מודיעים לצופים
    if (!gameActive && (nextLive?.players?.length || 0) > 0) {
      try {
        await notifyGameStart(row, row.slug);
      } catch (e) {
        console.warn("game-start push failed:", e.message);
      }
    }
  }

  try {
    const token = process.env.WHAPI_TOKEN;
    if (ownerDm && ownerPhone) {
      try {
        await sendToGroup(ownerDm, { token, groupId: ownerPhone });
      } catch (e) {
        console.warn("owner dm failed:", e.message);
      }
    }
    let sent = null;
    if (reply) {
      sent = await sendToGroup(reply, { token, groupId: msg.chatId });
      /* אישור מצ'אט פרטי — מעדכנים גם את הקבוצה */
      if (isOwnerDm && groupId && groupId !== msg.chatId) {
        try {
          await sendToGroup(reply, { token, groupId });
        } catch (e) {
          console.warn("group echo of approval failed:", e.message);
        }
      }
    }
    if (sent && isNightShareText(reply)) {
      const iso = nextLive?.startedAt
        ? jerusalemIso(new Date(nextLive.startedAt))
        : nightIsoFromText(reply);
      await pinAfterSend("night", sent, { iso }, {
        token,
        pins: normalizePins(row.config?.pins),
        savePins: async (pins) => {
          // קוראים מחדש config כדי לא לדרוס botOn/sentReports אם השתנו במקביל
          const { data: fresh } = await supabase
            .from("groups")
            .select("config")
            .eq("id", row.id)
            .maybeSingle();
          await supabase
            .from("groups")
            .update({ config: { ...(fresh?.config || row.config || {}), pins } })
            .eq("id", row.id);
        },
      });
    }
  } catch (e) {
    console.error(e.message); // הנתונים כבר נשמרו — התשובה היא בונוס
  }

  return ok({ handled: cmds.length });
}
