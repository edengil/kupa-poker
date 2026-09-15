import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";

/* סריקת הודעות אחרונות בקבוצה — איתור סיכום/חלוקה לשחזור ערב.
   GET /api/wa-scan?secret=...   או כותרת x-vercel-cron: 1
*/

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WHAPI_BASE = "https://gate.whapi.cloud";

function msgText(m) {
  if (!m) return "";
  if (typeof m.text?.body === "string") return m.text.body;
  if (typeof m.body === "string") return m.body;
  if (typeof m.caption === "string") return m.caption;
  if (typeof m.text === "string") return m.text;
  return "";
}

function isPokerish(text) {
  const t = String(text || "");
  return (
    /סיכום פוקר/.test(t) ||
    /סיכום (?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/.test(t) ||
    /סיכום רבעון|סיכום שנת|סיכום חצי שנה/.test(t) ||
    /חשבון סופי/.test(t) ||
    /·\s*חלוקה/.test(t) ||
    /\d{1,2}\/\d{1,2}\/\d{4}\s*·\s*חלוקה/.test(t) ||
    (/חלוקה/.test(t) && /מעביר|מגיע|חייב/.test(t)) ||
    /טיפים הערב/.test(t) ||
    /טבלת הנטו/.test(t) ||
    (/מגיע/.test(t) && /חייב/.test(t)) ||
    /מעביר \d+ ל/.test(t)
  );
}

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = process.env.WHAPI_TOKEN;
  const groupId = process.env.WHAPI_GROUP_ID;
  if (!token || !groupId) {
    return NextResponse.json({ error: "WHAPI missing" }, { status: 500 });
  }

  const url = new URL(request.url);
  const count = Math.min(Number(url.searchParams.get("count") || 200) || 200, 500);
  /* חלון: מ־13.9 בצהריים שעון ישראל ואילך (אתמול + היום) */
  const timeFrom = Number(url.searchParams.get("from") || Math.floor(Date.parse("2026-09-13T12:00:00+03:00") / 1000));

  const api = `${WHAPI_BASE}/messages/list/${encodeURIComponent(groupId)}?count=${count}&sort=desc&time_from=${timeFrom}`;
  const res = await fetch(api, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "whapi failed", status: res.status, detail: raw.slice(0, 400) },
      { status: 502 }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json", detail: raw.slice(0, 200) }, { status: 502 });
  }

  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const hits = [];
  const recent = [];
  for (const m of messages) {
    const text = msgText(m);
    const ts = Number(m.timestamp || m.time || 0);
    const row = {
      id: m.id || m.message_id || null,
      ts,
      iso: ts ? new Date(ts * (ts < 2e10 ? 1000 : 1)).toISOString() : null,
      fromMe: Boolean(m.from_me),
      preview: text.slice(0, 120),
      text,
    };
    if (recent.length < 15) recent.push({ ...row, text: text.slice(0, 400) });
    if (!text || !isPokerish(text)) continue;
    hits.push(row);
  }

  return NextResponse.json({
    ok: true,
    scanned: messages.length,
    hits: hits.length,
    recent,
    messages: hits,
  });
}
