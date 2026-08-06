import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { notifyGameStart } from "@/lib/push";

/* ============================================================================
   "המשחק התחיל" — נקרא מהאפליקציה כשנוסף השחקן הראשון לשולחן.

   האימות הוא טוקן ה-Supabase של המשתמש המחובר: רק בעלי הקבוצה יכול להפעיל
   התראה לצופים שלה. הסינון נגד הצפה (משחק אחד בערב) קורה בתוך notifyGameStart.
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function POST(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let slug;
  try {
    ({ slug } = await request.json());
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("groups")
    .select("id, owner_id, config")
    .eq("slug", slug)
    .single();
  if (error || !row) return NextResponse.json({ error: "no group" }, { status: 404 });
  if (row.owner_id !== userData.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await notifyGameStart(row, slug);
  return NextResponse.json({ ok: true, ...result });
}
