/** מגביל מה שצופים רואים לפי הגדרת המנהל. */

export function snapshotForViewer(snap) {
  if (!snap) return snap;
  const shareHistory = snap.config?.shareHistory !== false;
  if (shareHistory) return snap;
  return {
    ...snap,
    data: {
      plan: snap.data?.plan ?? null,
      roster: [],
      aliases: {},
      sessions: [],
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
