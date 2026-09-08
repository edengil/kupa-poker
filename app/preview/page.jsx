import { notFound } from "next/navigation";
import PreviewApp from "../../components/PreviewApp";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PreviewApp />;
}
