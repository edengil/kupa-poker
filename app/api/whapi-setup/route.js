import { NextResponse } from "next/server";
import { setPresenceOffline } from "@/lib/whatsapp";

/* ============================================================================
   תיקון חד-פעמי לבעיית ההתראות בטלפון.

   ערוץ Whapi מתחבר כ"מכשיר מקושר" ומדווח נוכחות online באופן קבוע.
   וואטסאפ מסיק שעדן פעיל במכשיר אחר — ומפסיק לשלוח התראות דחיפה לטלפון.

   ההגדרה offline_mode של Whapi פותרת את זה מהשורש: הערוץ מתחבר בלי לשדר
   online. ההגדרה נטענת רק אחרי חיבור מחדש של הערוץ (Stop ואז Start בפאנל
   של Whapi — בלי סריקת QR מחדש).

   הפעלה:  GET /api/whapi-setup?secret=<WHATSAPP_WEBHOOK_SECRET>
   ============================================================================ */

export const dynamic = "force-dynamic";

const WHAPI_BASE = "https://gate.whapi.cloud";

export async function GET(request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (!process.env.WHATSAPP_WEBHOOK_SECRET || secret !== process.env.WHATSAPP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = process.env.WHAPI_TOKEN;
  if (!token) return NextResponse.json({ error: "WHAPI_TOKEN not set" }, { status: 500 });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const before = await fetch(`${WHAPI_BASE}/settings`, { headers }).then((r) => r.json());

    const patch = await fetch(`${WHAPI_BASE}/settings`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ offline_mode: true }),
    });
    if (!patch.ok) {
      const detail = await patch.text().catch(() => "");
      throw new Error(`settings patch failed (${patch.status}): ${detail.slice(0, 200)}`);
    }

    // מאפסים גם את הנוכחות הנוכחית, שההתראות יחזרו עוד לפני החיבור מחדש
    await setPresenceOffline(token);

    const after = await fetch(`${WHAPI_BASE}/settings`, { headers }).then((r) => r.json());

    return NextResponse.json({
      ok: true,
      offline_mode: { before: before?.offline_mode ?? false, after: after?.offline_mode ?? null },
      next_step:
        after?.offline_mode === true
          ? "ההגדרה נשמרה. עכשיו בפאנל של Whapi: Stop ואז Start לערוץ (בלי QR מחדש) — ומאותו רגע ההתראות חוזרות."
          : "ההגדרה לא נקלטה — בדוק את הפאנל של Whapi ידנית.",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
