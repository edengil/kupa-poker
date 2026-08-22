import PublicApp from "@/components/PublicApp";

/* הלינק הציבורי. הנתונים נטענים בצד הלקוח אחרי התחברות — public_group
   כבר לא פתוח ל-anon, אז אין מה לשלוף כאן בשרת. */
export const dynamic = "force-dynamic";

export default function PublicGroupPage({ params }) {
  return <PublicApp slug={params.slug} />;
}

export async function generateMetadata({ params }) {
  return {
    title: "קופה — פוקר · צפייה",
    manifest: `/g/${params.slug}/manifest.webmanifest`,
  };
}
