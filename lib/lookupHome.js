import { getAdminSupabase } from "./supabaseAdmin";
import { isEmptyKupa } from "./homeRoute";

/** קבוצה בבעלות + הקבוצה האחרונה שנצפתה ביומן — עוקף RLS עם המפתח הסודי. */
export async function lookupHome(userId) {
  const out = { ownerSlug: null, viewerSlug: null, ownerEmpty: false };
  if (!userId) return out;
  try {
    const admin = getAdminSupabase();
    const { data: owned } = await admin
      .from("groups")
      .select("slug, data")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (owned?.[0]?.slug) {
      out.ownerSlug = owned[0].slug;
      out.ownerEmpty = isEmptyKupa(owned[0].data);
    }
    const { data: views } = await admin
      .from("group_views")
      .select("group_id")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(1);
    const gid = views?.[0]?.group_id;
    if (gid) {
      const { data: g } = await admin.from("groups").select("slug").eq("id", gid).maybeSingle();
      out.viewerSlug = g?.slug || null;
    }
  } catch (e) {
    console.warn("lookupHome failed:", e.message);
  }
  return out;
}
