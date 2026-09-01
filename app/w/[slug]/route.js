import { NextResponse } from "next/server";
import { hostBySlug, wazeNavigateUrl } from "@/components/poker/hosts";

/** קיצור ניווט: /w/itzik → ווייז עם כתובת המארח. */
export function GET(_request, { params }) {
  const host = hostBySlug(params?.slug);
  if (!host) {
    return NextResponse.json({ error: "unknown host" }, { status: 404 });
  }
  const target = wazeNavigateUrl(host.text);
  if (!target) {
    return NextResponse.json({ error: "no waze query" }, { status: 404 });
  }
  return NextResponse.redirect(target, 302);
}
