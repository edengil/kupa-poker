import { NextResponse } from "next/server";
import { hostBySlug, wazeNavigateUrl } from "@/lib/poker/hosts";

/** קיצור ניווט: /w/itzik → ווייז עם כתובת המארח. */
export async function GET(_request, { params }) {
  const { slug } = await params;
  const host = hostBySlug(slug);
  if (!host) {
    return NextResponse.json({ error: "unknown host" }, { status: 404 });
  }
  const target = wazeNavigateUrl(host.text);
  if (!target) {
    return NextResponse.json({ error: "no waze query" }, { status: 404 });
  }
  return NextResponse.redirect(target, 302);
}
