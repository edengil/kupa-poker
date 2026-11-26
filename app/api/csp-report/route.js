import { NextResponse } from "next/server";

/* ============================================================================
   TEMPORARY PREVIEW-ONLY SCAFFOLD — CSP violation report collector.
   Exists only on branch preview/csp-report-check to verify that enforcing
   CSP does not block legitimate resources. Will be dropped wholesale
   before the production commit lands; do NOT merge this file to main.

   Accepts:
   - Legacy format: POST application/csp-report, single JSON object
     with a "csp-report" property.
   - Reporting API format: POST application/reports+json, JSON array.

   For each report: one structured console.log line starting with
   [csp-report] (lands in Vercel function logs of the preview deployment),
   plus a best-effort in-memory ring buffer served by GET.
   No auth (browser reporting endpoint by design), no DB, no external calls.
   ============================================================================ */

export const dynamic = "force-dynamic";

const MAX_REPORTS = 200;
const reports = [];

function record(report) {
  const entry = { receivedAt: new Date().toISOString(), report };
  reports.push(entry);
  if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS);
  console.log(`[csp-report] ${entry.receivedAt} ${JSON.stringify(report)}`);
  return entry;
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    // Malformed / empty body — still return 204 so browsers don't retry.
    console.log(`[csp-report] ${new Date().toISOString()} {"error":"unparseable-body"}`);
    return new NextResponse(null, { status: 204 });
  }

  if (Array.isArray(body)) {
    // Reporting API format (application/reports+json)
    for (const item of body) record(item);
  } else if (body && typeof body === "object") {
    // Legacy format wraps the report in "csp-report"; accept bare objects too.
    if (body["csp-report"]) record(body["csp-report"]);
    else record(body);
  } else {
    record(body);
  }

  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ count: reports.length, reports });
}
