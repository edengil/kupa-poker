/* ============================================================================
   גל 3 (3.1 + 3.4) — מריץ הצילומים והגיזום המתוזמן.

   פעם ביום, כחלק מהקרון היומי:
   1. צילום שרת ('daily') לכל קבוצה במסד — דרך פונקציית ה־definer האחת
      snapshot_group, כך שהצילום היומי והידני חולקים בדיוק אותו קוד SQL.
   2. גיזום צילומים ישנים (מעל SNAPSHOT_RETENTION_DAYS) — הצילומים הם
      גיבוי מתגלגל, לא ארכיון נצחי.
   3. גיזום diag_events מעל 90 יום (מדיניות השמירה של 3.4).

   כשל לעולם לא שקט: כל קבוצה שנכשלה נספרת, והסיכום עם failed > 0 עובר
   ל־reportError (מייל התראה + לוג). כשל של קבוצה אחת לא עוצר את השאר.
   ============================================================================ */

export const SNAPSHOT_RETENTION_DAYS = 30;
export const DIAG_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffIso(days, now) {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/**
 * מריץ את שלושת השלבים מול לקוח אדמין מוזרק.
 * @param {object} admin לקוח Supabase של השרת (service_role)
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ groups: number, snapshotted: number, failed: number,
 *   snapshotsPruned: number|null, diagPruned: number|null, errors: string[] }>}
 */
export async function runGroupSnapshots(admin, { now = new Date() } = {}) {
  const errors = [];

  const { data: groups, error: listError } = await admin.from("groups").select("id");
  if (listError) throw new Error(`snapshot group list failed: ${listError.message}`);

  let snapshotted = 0;
  let failed = 0;
  for (const g of groups || []) {
    const { error } = await admin.rpc("snapshot_group", {
      p_group_id: g.id,
      p_reason: "daily",
    });
    if (error) {
      failed += 1;
      errors.push(`${g.id}: ${error.message}`);
    } else {
      snapshotted += 1;
    }
  }

  let snapshotsPruned = null;
  const snapCut = await admin
    .from("group_snapshots")
    .delete()
    .lt("created_at", cutoffIso(SNAPSHOT_RETENTION_DAYS, now))
    .select("id");
  if (snapCut.error) {
    errors.push(`snapshot prune failed: ${snapCut.error.message}`);
  } else {
    snapshotsPruned = (snapCut.data || []).length;
  }

  let diagPruned = null;
  const diagCut = await admin
    .from("diag_events")
    .delete()
    .lt("created_at", cutoffIso(DIAG_RETENTION_DAYS, now))
    .select("id");
  if (diagCut.error) {
    errors.push(`diag prune failed: ${diagCut.error.message}`);
  } else {
    diagPruned = (diagCut.data || []).length;
  }

  return {
    groups: (groups || []).length,
    snapshotted,
    failed,
    snapshotsPruned,
    diagPruned,
    errors,
  };
}
