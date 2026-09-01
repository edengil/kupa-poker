import { NextResponse } from "next/server";

/** קיצור ניווט לכתובת חופשית: /w?q=רחוב → ווייז. */
export function GET(request) {
  const q = new URL(request.url).searchParams.get("q");
  const street = String(q || "").trim();
  if (!street) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }
  const target = `https://waze.com/ul?q=${encodeURIComponent(street)}&navigate=yes`;
  return NextResponse.redirect(target, 302);
}
