"use client";

import { useEffect, useMemo, useState } from "react";
import PokerApp, { PokerTable } from "./PokerApp";
import { configureStore, makeReadOnlyStore } from "../lib/store";
import { snapshotForViewer, viewerCps } from "../lib/publicShare";

/** נתוני דמה לצופה — בלי Supabase. */
export function buildViewerFixture({ shareHistory = true, withLive = false } = {}) {
  const data = {
    sessions: [
      {
        id: "pv_s1",
        iso: "2026-09-01",
        d: 1,
        mo: 9,
        y: 2026,
        entries: [
          { name: "אלפא צופה", amount: 120 },
          { name: "בטה צופה", amount: -120 },
        ],
      },
    ],
    yearly: [{ id: "pv_y", y: 2026, official: true, entries: [{ name: "אלפא צופה", amount: 120 }] }],
    monthly: [],
    aliases: {},
    roster: ["אלפא צופה", "בטה צופה"],
    plan: null,
  };
  const live = withLive
    ? {
        players: [{ name: "חי בלייב", buyin: 50, cashout: "" }],
        cps: 2,
        addAmt: 50,
        startedAt: Date.now() - 60_000,
      }
    : null;
  return {
    id: "preview-viewer",
    slug: "preview-viewer",
    config: { chipsPerShekel: 2, shareHistory },
    data,
    live,
  };
}

/**
 * סימולציית מסך צופה ציבורי ל־E2E:
 * /preview/viewer?history=0|1&live=1
 */
export default function PreviewViewerApp({ shareHistory = true, withLive = false }) {
  const [ready, setReady] = useState(false);
  const snap = useMemo(
    () => buildViewerFixture({ shareHistory, withLive }),
    [shareHistory, withLive]
  );
  const viewerSnap = useMemo(() => snapshotForViewer(snap), [snap]);
  const live = snap.live;
  const cps = viewerCps(viewerSnap, live);
  const pot = (live?.players || []).reduce((s, p) => s + (+p.buyin || 0), 0);

  useEffect(() => {
    configureStore(makeReadOnlyStore(viewerSnap));
    setReady(true);
  }, [viewerSnap]);

  return (
    <>
      <div
        role="status"
        data-testid="preview-viewer-banner"
        style={{ padding: 10, textAlign: "center", background: "#D9A441", color: "#0A2B21", fontSize: 13 }}
      >
        סביבת צופה · היסטוריה {shareHistory ? "גלויה" : "מוסתרת"} · בלי התחברות
      </div>
      {live?.players?.length > 0 && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "13px 13px 0" }} data-testid="preview-viewer-live">
          <h2 style={{ margin: "0 2px 9px", fontSize: 15, fontWeight: 700 }}>♠ משחק עכשיו</h2>
          <PokerTable
            players={live.players}
            cps={cps}
            addAmt={live.addAmt || 50}
            pot={pot}
            potChips={pot * cps}
            onSeat={() => {}}
            startedAt={live.startedAt}
            elapsed={live.startedAt ? Date.now() - live.startedAt : 0}
          />
        </div>
      )}
      {ready && <PokerApp readOnly />}
    </>
  );
}
