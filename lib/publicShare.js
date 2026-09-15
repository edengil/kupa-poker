/** מגביל מה שצופים רואים לפי הגדרת המנהל. */

import { sessionsForViewer } from "./lastSession.js";

export function snapshotForViewer(snap) {
  if (!snap) return snap;
  const shareHistory = snap.config?.shareHistory !== false;
  if (shareHistory) return snap;
  return {
    ...snap,
    data: {
      plan: snap.data?.plan ?? null,
      roster: [],
      /* כינויים נשארים כדי לזהות את הצופה מול שמות בחלוקה */
      aliases: snap.data?.aliases && typeof snap.data.aliases === "object" ? snap.data.aliases : {},
      sessions: sessionsForViewer(snap.data?.sessions, { shareHistory: false }),
      yearly: [],
      monthly: [],
    },
  };
}

export function viewerCps(snap, live) {
  const fromLive = live?.cps != null ? +live.cps : null;
  const fromCfg = snap?.config?.chipsPerShekel != null ? +snap.config.chipsPerShekel : null;
  if (Number.isFinite(fromLive) && fromLive > 0) return fromLive;
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  return 2;
}
