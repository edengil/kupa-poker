import { notFound } from "next/navigation";
import PreviewApp from "../../components/PreviewApp";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ searchParams }) {
  /* בפרודקשן חסום; ב־dev ובדיקות E2E (ALLOW_PREVIEW=1) פתוח. */
  if (process.env.NODE_ENV !== "development" && process.env.ALLOW_PREVIEW !== "1") {
    notFound();
  }
  // Next 16: searchParams הוא Promise — חובה await
  const params = await searchParams;
  const failFlush = params?.failFlush === "1";
  const viewerName = typeof params?.as === "string" ? params.as : "";
  return <PreviewApp failFlush={failFlush} viewerName={viewerName} />;
}
