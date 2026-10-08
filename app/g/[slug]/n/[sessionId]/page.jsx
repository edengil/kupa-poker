import PublicApp from "@/components/PublicApp";

export const dynamic = "force-dynamic";

export default async function NightPage({ params }) {
  const { slug, sessionId } = await params;
  return <PublicApp slug={slug} nightId={sessionId} />;
}

export const metadata = { title: "קופה — ערב" };
