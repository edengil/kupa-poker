import PublicApp from "@/components/PublicApp";

export const dynamic = "force-dynamic";

export default function NightPage({ params }) {
  return <PublicApp slug={params.slug} nightId={params.sessionId} />;
}

export const metadata = { title: "קופה — ערב" };
