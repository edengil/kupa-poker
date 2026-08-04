import PublicApp from "@/components/PublicApp";
import { getAnonSupabase } from "@/lib/supabaseServer";

// הלינק הציבורי. אין התחברות — ה-slug עצמו הוא מפתח הגישה.
export const dynamic = "force-dynamic";

export default async function PublicGroupPage({ params }) {
  const supabase = getAnonSupabase();
  const { data, error } = await supabase.rpc("public_group", { p_slug: params.slug });
  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0A2B21",
          color: "#9DBBAC",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        <div>
          <div style={{ fontSize: 40, color: "#D9A441" }}>♠</div>
          <p style={{ marginTop: 14 }}>
            הלינק הזה לא מוביל לשום קבוצה.
            <br />
            בקש מהמנהל לשלוח לינק מעודכן.
          </p>
        </div>
      </main>
    );
  }

  return (
    <PublicApp
      slug={params.slug}
      snapshot={{ data: row.data, live: row.live, config: null }}
    />
  );
}

export async function generateMetadata({ params }) {
  const supabase = getAnonSupabase();
  const { data } = await supabase.rpc("public_group", { p_slug: params.slug });
  const row = Array.isArray(data) ? data[0] : data;
  return { title: row?.name ? `${row.name} · צפייה` : "קופה — פוקר" };
}
