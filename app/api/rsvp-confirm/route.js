import { getAdminSupabase, pingViewers } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { verifyRsvpToken } from "@/lib/rsvpToken";
import { applyEmailRsvp } from "@/lib/poker/emailRsvp";

/* ============================================================================
   אישור הגעה מלינק באימייל — נתיב ציבורי מאובטח בטוקן חתום.

   הטוקן קושר שחקן + ערב + קבוצה, ואי אפשר לנחש אותו. הלחיצה מעדכנת את
   plan.emailRsvps בנתוני הקבוצה, ומסך הערב הפתוח באפליקציה מציג את
   התשובה מיד. אפשר לשנות תשובה בלחיצה על הקישור השני עד שהטוקן פג.
   ============================================================================ */

export const dynamic = "force-dynamic";

function page(title, body, status = 200) {
  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:24px;background:#0c1512;font-family:Arial,Helvetica,sans-serif;color:#f3ead8">
<div style="max-width:460px;margin:40px auto;background:#122019;border:1px solid #2b4636;border-radius:16px;padding:28px;text-align:center">
${body}
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const fail = (msg) =>
  page(
    "קופה — פוקר",
    `<div style="font-size:40px">♠</div>
     <h1 style="font-size:20px;margin:12px 0 6px">משהו לא הסתדר</h1>
     <p style="color:#b9c8bd;font-size:15px;line-height:1.7">${msg}</p>`
  );

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("t") || "";
    const answer = url.searchParams.get("a") || "";
    const payload = verifyRsvpToken(token);
    if (!payload) {
      return fail("הקישור פג תוקף או שאינו תקין. אפשר לאשר הגעה מתוך האפליקציה.");
    }
    if (answer !== "yes" && answer !== "no") {
      return fail("התשובה לא הובנה. נסו שוב מהקישור במייל.");
    }

    const admin = getAdminSupabase();
    const { data: groupRow, error } = await admin
      .from("groups")
      .select("id, slug, data")
      .eq("id", payload.groupId)
      .maybeSingle();
    if (error || !groupRow) {
      return fail("לא נמצאה הקבוצה של ההזמנה.");
    }
    const db = groupRow.data || {};
    const plan = db.plan || null;
    if (!plan?.iso || plan.iso !== payload.planIso) {
      return fail("הערב שאליו הוזמנת כבר אינו פתוח. אם נפתח ערב חדש, תקבלו הזמנה חדשה.");
    }

    const nextPlan = applyEmailRsvp(plan, payload.name, answer);
    if (!nextPlan) {
      return fail("לא הצלחנו לרשום את התשובה. נסו שוב בעוד רגע.");
    }
    const { error: writeErr } = await admin
      .from("groups")
      .update({ data: { ...db, plan: nextPlan } })
      .eq("id", groupRow.id);
    if (writeErr) {
      console.error("rsvp-confirm write failed:", writeErr.message);
      return fail("לא הצלחנו לרשום את התשובה. נסו שוב בעוד רגע.");
    }
    if (groupRow.slug) await pingViewers(groupRow.slug);

    const coming = answer === "yes";
    return page(
      "קופה — פוקר",
      `<div style="font-size:44px">${coming ? "✅" : "❌"}</div>
       <h1 style="font-size:21px;margin:12px 0 6px">${
         coming ? "נרשם — מגיע!" : "נרשם — לא מגיע"
       }</h1>
       <p style="color:#b9c8bd;font-size:15px;line-height:1.7">${
         coming
           ? "התשובה שלך מופיעה עכשיו בערב הפתוח באפליקציה. נתראה על הלבד 🃏"
           : "חבל, נתראה בערב הבא. התשובה מופיעה עכשיו באפליקציה."
       }</p>
       <p style="color:#8fa398;font-size:13px">טעות? פשוט לחצו על הקישור השני במייל כדי לשנות.</p>`
    );
  } catch (e) {
    await reportError(e, "rsvp-confirm");
    return fail("קרה משהו בצד שלנו. נסו שוב בעוד רגע.");
  }
}
