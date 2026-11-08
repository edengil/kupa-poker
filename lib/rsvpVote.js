/* הצבעת אישור־הגעה מהלינק הציבורי — כתיבה + אימות (ממצא ביקורת 25).

   עד גל 5 ה־upsert ב־RsvpCard לא בדק תוצאה בכלל: גם כשהכתיבה נכשלה
   (RLS, רשת) הכרטיס הכריז "נתראה בשולחן!". כאן ההצלחה היא עובדה
   נבדקת, לא הנחה: אחרי כתיבה בלי שגיאה קוראים חזרה את השורה של
   המצביע ומוודאים שהיא נחתה עם הסטטוס שנבחר. */

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 *   reason: "no_user" | "write_failed" | "verify_failed" | "not_landed"
 */
export async function castRsvpVote(supabase, { groupId, planIso, user, status }) {
  if (!user) return { ok: false, reason: "no_user" };
  const { error } = await supabase.from("game_rsvps").upsert(
    {
      group_id: groupId,
      user_id: user.id,
      plan_iso: planIso,
      status,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      email: user.email ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id,user_id" }
  );
  if (error) return { ok: false, reason: "write_failed" };
  const { data, error: readError } = await supabase
    .from("game_rsvps")
    .select("user_id, status")
    .eq("group_id", groupId)
    .eq("plan_iso", planIso)
    .eq("user_id", user.id);
  if (readError) return { ok: false, reason: "verify_failed" };
  return (data || []).some((r) => r.status === status)
    ? { ok: true }
    : { ok: false, reason: "not_landed" };
}
