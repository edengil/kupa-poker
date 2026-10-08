import PublicApp from "@/components/PublicApp";

/* הלינק הציבורי. הנתונים נטענים בצד הלקוח אחרי התחברות — public_group
   כבר לא פתוח ל-anon, אז אין מה לשלוף כאן בשרת. */
export const dynamic = "force-dynamic";

export default async function PublicGroupPage({ params }) {
  const { slug } = await params;
  return <PublicApp slug={slug} />;
}

export const metadata = { title: "קופה — פוקר · צפייה" };
