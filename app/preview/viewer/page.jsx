import { notFound } from "next/navigation";
import PreviewViewerApp from "../../../components/PreviewViewerApp";

export const dynamic = "force-dynamic";

export default async function PreviewViewerPage({ searchParams }) {
  if (process.env.NODE_ENV !== "development" && process.env.ALLOW_PREVIEW !== "1") {
    notFound();
  }
  // Next 16: searchParams הוא Promise — חובה await
  const params = await searchParams;
  const shareHistory = params?.history !== "0";
  const withLive = params?.live === "1";
  return <PreviewViewerApp shareHistory={shareHistory} withLive={withLive} />;
}
