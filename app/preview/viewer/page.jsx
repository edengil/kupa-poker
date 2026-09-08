import { notFound } from "next/navigation";
import PreviewViewerApp from "../../../components/PreviewViewerApp";

export const dynamic = "force-dynamic";

export default function PreviewViewerPage({ searchParams }) {
  if (process.env.NODE_ENV !== "development" && process.env.ALLOW_PREVIEW !== "1") {
    notFound();
  }
  const shareHistory = searchParams?.history !== "0";
  const withLive = searchParams?.live === "1";
  return <PreviewViewerApp shareHistory={shareHistory} withLive={withLive} />;
}
