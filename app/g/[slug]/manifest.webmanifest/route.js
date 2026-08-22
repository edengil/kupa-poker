/** מניפסט לצפייה הציבורית — start_url נשאר על /g/<slug> אחרי הוספה למסך הבית. */

const BASE = {
  name: "קופה — פוקר",
  short_name: "קופה",
  description: "מעקב אחרי ערבי הפוקר של הקבוצה",
  dir: "rtl",
  lang: "he",
  display: "standalone",
  background_color: "#0A2B21",
  theme_color: "#0A2B21",
  scope: "/",
  icons: [
    { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
  ],
};

export function GET(_req, { params }) {
  const slug = params.slug || "";
  if (!/^[a-z0-9]+$/i.test(slug)) {
    return new Response("bad slug", { status: 400 });
  }
  return Response.json(
    { ...BASE, start_url: `/g/${slug}`, id: `/g/${slug}` },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }
  );
}
