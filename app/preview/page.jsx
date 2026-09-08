import { notFound } from "next/navigation";
import PreviewApp from "../../components/PreviewApp";

export const dynamic = "force-dynamic";

export default function PreviewPage({ searchParams }) {
  /* בפרודקשן חסום; ב־dev ובדיקות E2E (ALLOW_PREVIEW=1) פתוח. */
  if (process.env.NODE_ENV !== "development" && process.env.ALLOW_PREVIEW !== "1") {
    notFound();
  }
  const failFlush = searchParams?.failFlush === "1";
  return <PreviewApp failFlush={failFlush} />;
}
