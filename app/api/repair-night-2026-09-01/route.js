import { NextResponse } from "next/server";
import { getAdminSupabase, pingViewers } from "@/lib/supabaseAdmin";

/* ============================================================================
   תיקון חד־פעמי ללייב של ערב 1.9.2026 — כניסות / טיפים / יציאות לפי וואטסאפ.
   אחרי שבאג הסנכרון דרס יציאות, השרת נשאר עם נתונים חלקיים/שגויים.

   GET /api/repair-night-2026-09-01?secret=<WHATSAPP_WEBHOOK_SECRET>
   GET ...&apply=1  — כותב לשרת (בלי זה: רק מציג מצב נוכחי + טיוטה)
   ============================================================================ */

export const dynamic = "force-dynamic";

const STARTED = Date.parse("2026-09-01T20:36:00+03:00");

/** שמות מלאים כמו ב-DEFAULT_ALIASES — כדי שהמסך יתאים לכינויים. */
const NIGHT = {
  startedAt: STARTED,
  entriesCount: "45",
  players: [
    { name: "שגיא גיל", buyin: 450, cashout: "700", tipsGiven: 13 },
    { name: "דן ינקלויץ", buyin: 400, cashout: "196", tipsGiven: 15 },
    { name: "אורן גיל", buyin: 250, cashout: "560", tipsGiven: 10 },
    { name: "קובי סעדה", buyin: 200, cashout: "200", tipsGiven: 10 },
    { name: "דור לירז", buyin: 150, cashout: "0", tipsGiven: 30 },
    { name: "נתנאל כהן", buyin: 150, cashout: "150", tipsGiven: 3 },
    { name: "עדן גיל", buyin: 150, cashout: "770", tipsGiven: 36 },
    { name: "עדן לירז", buyin: 150, cashout: "0", tipsGiven: 0 },
    { name: "איציק תפילין", buyin: 125, cashout: "0", tipsGiven: 0 },
    { name: "אופיר סנה", buyin: 150, cashout: "720", tipsGiven: 36 },
    { name: "ירין מלאך", buyin: 50, cashout: "1160", tipsGiven: 50 },
  ],
  tips: [
    { id: "r0901-01", name: "דן ינקלויץ", amount: 5, at: STARTED + 1 },
    { id: "r0901-02", name: "שגיא גיל", amount: 10, at: STARTED + 2 },
    { id: "r0901-03", name: "דור לירז", amount: 10, at: STARTED + 3 },
    { id: "r0901-04", name: "קובי סעדה", amount: 10, at: STARTED + 4 },
    { id: "r0901-05", name: "עדן גיל", amount: 6, at: STARTED + 5 },
    { id: "r0901-06", name: "דן ינקלויץ", amount: 5, at: STARTED + 6 },
    { id: "r0901-07", name: "שגיא גיל", amount: 3, at: STARTED + 7 },
    { id: "r0901-08", name: "אופיר סנה", amount: 15, at: STARTED + 8 },
    { id: "r0901-09", name: "אורן גיל", amount: 10, at: STARTED + 9 },
    { id: "r0901-10", name: "עדן גיל", amount: 20, at: STARTED + 10 },
    { id: "r0901-11", name: "ירין מלאך", amount: 20, at: STARTED + 11 },
    { id: "r0901-12", name: "אופיר סנה", amount: 10, at: STARTED + 12 },
    { id: "r0901-13", name: "דור לירז", amount: 10, at: STARTED + 13 },
    { id: "r0901-14", name: "ירין מלאך", amount: 10, at: STARTED + 14 },
    { id: "r0901-15", name: "דור לירז", amount: 10, at: STARTED + 15 },
    { id: "r0901-16", name: "ירין מלאך", amount: 20, at: STARTED + 16 },
    { id: "r0901-17", name: "נתנאל כהן", amount: 3, at: STARTED + 17 },
    { id: "r0901-18", name: "אופיר סנה", amount: 1, at: STARTED + 18 },
    { id: "r0901-19", name: "דן ינקלויץ", amount: 5, at: STARTED + 19 },
    { id: "r0901-20", name: "אופיר סנה", amount: 10, at: STARTED + 20 },
    { id: "r0901-21", name: "עדן גיל", amount: 10, at: STARTED + 21 },
  ],
};

function authorized(request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const given = new URL(request.url).searchParams.get("secret");
  return Boolean(secret) && given === secret;
}

function summarize(live) {
  if (!live || typeof live !== "object") return null;
  return {
    players: (live.players || []).map((p) => ({
      name: p.name,
      buyin: +p.buyin || 0,
      cashout: p.cashout === "" || p.cashout == null ? null : +p.cashout || 0,
      tipsGiven: +p.tipsGiven || 0,
    })),
    tipsTotal: (live.tips || []).reduce((s, t) => s + (+t.amount || 0), 0),
    tipsCount: (live.tips || []).length,
    entriesCount: live.entriesCount ?? null,
    startedAt: live.startedAt ?? null,
  };
}

function buildPatched(existing) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const players = NIGHT.players.map((p) => {
    const prev = (base.players || []).find((x) => x.name === p.name);
    return {
      ...(prev || {}),
      name: p.name,
      buyin: p.buyin,
      cashout: p.cashout,
      tipsGiven: p.tipsGiven,
      buyinEvents:
        Array.isArray(prev?.buyinEvents) && prev.buyinEvents.length
          ? prev.buyinEvents
          : [{ amount: p.buyin, at: NIGHT.startedAt, total: p.buyin }],
    };
  });
  return {
    ...base,
    players,
    tips: NIGHT.tips.map((t) => ({ ...t })),
    entriesCount: NIGHT.entriesCount,
    startedAt: base.startedAt || NIGHT.startedAt,
    closing: false,
    pending: null,
    applied: {
      ...(base.applied || {}),
      "repair-2026-09-01": [{ t: "repair", at: Date.now() }],
    },
    ts: Date.now(),
  };
}

const CPS = 2;
const r2 = (v) => Math.round(v * 100) / 100;

/** ערב שמור לפי הצ'אט — מחליף את 2026-09-02 אם כבר נוצר חלקי/שגוי. */
function buildSessionRecord(existingId) {
  const endedAt = Date.parse("2026-09-02T01:21:00+03:00");
  const entries = NIGHT.players.map((p) => {
    const chips = +p.cashout || 0;
    const buyin = +p.buyin || 0;
    return {
      name: p.name,
      amount: r2(chips / CPS - buyin),
      chips,
      buyin,
      tipsGiven: p.tipsGiven,
      buyinEvents: [{ amount: buyin, at: NIGHT.startedAt, total: buyin }],
    };
  });
  return {
    id: existingId || "repair_2026_09_01",
    iso: "2026-09-02",
    d: 2,
    mo: 9,
    y: 2026,
    entries,
    tips: NIGHT.tips.map(({ name, amount, at }) => ({ name, amount, at })),
    startedAt: NIGHT.startedAt,
    endedAt,
    location: undefined,
  };
}

function summarizeSession(s) {
  if (!s) return null;
  return {
    id: s.id,
    iso: s.iso,
    entries: (s.entries || []).map((e) => ({
      name: e.name,
      buyin: e.buyin ?? null,
      chips: e.chips ?? null,
      amount: e.amount,
      tipsGiven: e.tipsGiven || 0,
    })),
    tipsTotal: (s.tips || []).reduce((sum, t) => sum + (+t.amount || 0), 0),
  };
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";
  const finish = url.searchParams.get("finish") === "1";
  const slug = process.env.KUPA_GROUP_SLUG;
  if (!slug) {
    return NextResponse.json({ error: "KUPA_GROUP_SLUG missing" }, { status: 500 });
  }

  const sb = getAdminSupabase();
  const { data: row, error } = await sb
    .from("groups")
    .select("id, slug, live, data")
    .eq("slug", slug)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const before = summarize(row.live);
  const patched = buildPatched(row.live);
  const data = row.data && typeof row.data === "object" ? { ...row.data } : { sessions: [] };
  const sessions = Array.isArray(data.sessions) ? [...data.sessions] : [];
  const existingIdx = sessions.findIndex((s) => s?.iso === "2026-09-02" || s?.iso === "2026-09-01");
  const existing = existingIdx >= 0 ? sessions[existingIdx] : null;
  const sessionRec = buildSessionRecord(existing?.id);
  const nextSessions = [...sessions];
  if (existingIdx >= 0) nextSessions[existingIdx] = sessionRec;
  else nextSessions.push(sessionRec);
  nextSessions.sort((a, b) => String(a.iso).localeCompare(String(b.iso)));

  const sessionIsos = sessions
    .map((s) => s.iso || `${s.d}.${s.mo}.${s.y}`)
    .filter(Boolean)
    .slice(-8);

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      hint: "הוסף &apply=1 לתיקון לייב; &finish=1 גם שומר ערב ומנקה לייב",
      before,
      after: summarize(patched),
      existingSession: summarizeSession(existing),
      repairedSession: summarizeSession(sessionRec),
      recentSessions: sessionIsos,
    });
  }

  const patch = finish
    ? {
        live: null,
        data: {
          ...data,
          sessions: nextSessions,
          roster: [
            ...new Set([
              ...(Array.isArray(data.roster) ? data.roster : []),
              ...NIGHT.players.map((p) => p.name),
            ]),
          ],
        },
      }
    : { live: patched };
  const { error: writeError } = await sb.from("groups").update(patch).eq("id", row.id);
  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }
  await pingViewers(row.slug);

  return NextResponse.json({
    dryRun: false,
    written: true,
    finished: finish,
    before,
    after: finish ? null : summarize(patched),
    existingSession: summarizeSession(existing),
    repairedSession: finish ? summarizeSession(sessionRec) : undefined,
    recentSessions: sessionIsos,
    next: finish
      ? "רענון באפליקציה — הערב אמור להופיע בטאב ערבים (2.9). לייב אמור להיות ריק."
      : "רענון באפליקציה → לייב → סיים · שמור. אל תבטל משחק. או קרא שוב עם &finish=1.",
  });
}
