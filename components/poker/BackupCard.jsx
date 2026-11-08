"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../../lib/poker/colors";
import {
  buildFullBackup,
  downloadJsonFile,
  fullBackupFilename,
  parseFullBackup,
} from "../../lib/poker/db";
import { CONFIG_KEY, LIVE_KEY, store } from "../../lib/store";
import { getSupabase } from "../../lib/supabaseClient";
import { exportSessionsCsv } from "../../lib/poker/csvExport";
import { Download, Upload } from "./icons";

const btn = {
  flex: 1,
  padding: 11,
  borderRadius: 10,
  border: `1px solid ${C.line}`,
  background: C.feltDeep,
  color: C.cream,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontFamily: "inherit",
};

function parseStored(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readBlobs() {
  const config = parseStored(await store.get(CONFIG_KEY)) ?? {};
  const live = parseStored(await store.get(LIVE_KEY));
  return { config, live };
}

const REASON_LABELS = { daily: "יומי", "pre-delete": "לפני מחיקה", manual: "ידני" };

/* גיבוי JSON מלא + ייצוא CSV + צילומי שרת (גל 3).
   הגיבוי הידני כולל מעכשיו את שלושת הבלובים (db + config + live) ושם
   הקובץ נושא חותמת זמן מלאה. בנוסף: צילום שרת ידני ושחזור מקטע
   הצילומים — השחזור בונה קבוצה חדשה מהצילום, המקורית לא נגעה. */
export function BackupCard({ db, commit, groupId = null }) {
  const fileRef = useRef();
  const [candidate, setCandidate] = useState(null);
  const [error, setError] = useState("");

  /* צילומי שרת */
  const [snapshots, setSnapshots] = useState(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapMsg, setSnapMsg] = useState("");
  const [snapError, setSnapError] = useState("");

  const loadSnapshots = useCallback(async () => {
    if (!groupId) return;
    try {
      const supabase = getSupabase();
      const { data, error: rpcError } = await supabase.rpc("list_group_snapshots", {
        p_group_id: groupId,
      });
      if (rpcError) throw new Error(rpcError.message);
      setSnapshots(data || []);
    } catch (e) {
      setSnapError(e.message || "טעינת הצילומים נכשלה");
    }
  }, [groupId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const takeSnapshot = async () => {
    if (!groupId || snapBusy) return;
    setSnapBusy(true);
    setSnapMsg("");
    setSnapError("");
    try {
      const supabase = getSupabase();
      const { error: rpcError } = await supabase.rpc("snapshot_group", {
        p_group_id: groupId,
        p_reason: "manual",
      });
      if (rpcError) throw new Error(rpcError.message);
      setSnapMsg("הצילום נשמר בשרת.");
      await loadSnapshots();
    } catch (e) {
      setSnapError(e.message || "הצילום נכשל");
    } finally {
      setSnapBusy(false);
    }
  };

  const restoreSnapshot = async (snap) => {
    if (snapBusy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "השחזור ייצור קבוצה חדשה מתוך הצילום (הקבוצה הנוכחית לא תשתנה). להמשיך?"
      )
    ) {
      return;
    }
    setSnapBusy(true);
    setSnapMsg("");
    setSnapError("");
    try {
      const supabase = getSupabase();
      const { data, error: rpcError } = await supabase.rpc("restore_group_snapshot", {
        p_snapshot_id: snap.id,
      });
      if (rpcError) throw new Error(rpcError.message);
      const slug = data?.[0]?.slug;
      setSnapMsg(
        slug
          ? `נוצרה קבוצה חדשה מהצילום: /g/${slug} (היא תופיע ברשימת הקבוצות שלך).`
          : "השחזור הושלם."
      );
    } catch (e) {
      setSnapError(e.message || "השחזור נכשל");
    } finally {
      setSnapBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCandidate(null);
    setError("");
    const r = new FileReader();
    r.onload = () => {
      try {
        setCandidate(parseFullBackup(JSON.parse(r.result)));
      } catch (e) {
        setError(e.message || "קובץ לא תקין");
      }
    };
    r.onerror = () => setError("לא ניתן לקרוא את הקובץ.");
    r.readAsText(f);
    e.target.value = "";
  };

  const exportFull = async () => {
    try {
      const { config, live } = await readBlobs();
      downloadJsonFile(buildFullBackup({ db, config, live }), fullBackupFilename());
    } catch (e) {
      setError(e.message || "הגיבוי נכשל");
    }
  };

  const applyImport = async () => {
    if (!candidate) return;
    try {
      /* גיבוי־לפני־החלפה: תמיד מלא (כל הבלובים הנוכחיים), גם כשהייבוא
         עצמו הוא קובץ ישן של db בלבד. */
      const { config, live } = await readBlobs();
      downloadJsonFile(buildFullBackup({ db, config, live }), fullBackupFilename());
      if (candidate.full) {
        await store.set(CONFIG_KEY, JSON.stringify(candidate.config));
        await store.set(LIVE_KEY, candidate.live ? JSON.stringify(candidate.live) : "");
      }
      commit(candidate.db);
      setCandidate(null);
    } catch (e) {
      setError(e.message || "הייבוא נכשל");
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 14,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Download size={16} />
        גיבוי וייצוא
      </div>
      <p style={{ fontSize: 12, color: C.dim, marginTop: 0, lineHeight: 1.6 }}>
        גיבוי מלא ב־JSON (כולל הגדרות וערב חי), ייבוא חזרה, או ייצוא ערבים ושחקנים לקובץ שאפשר
        לפתוח באקסל.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => exportSessionsCsv(db)} style={btn}>
          <Download size={16} />
          ייצוא
        </button>
        <button type="button" onClick={() => void exportFull()} style={btn} data-testid="backup-full-btn">
          <Download size={16} />
          גיבוי מלא JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} style={btn} data-testid="backup-import-btn">
          <Upload size={16} />
          ייבוא
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onFile}
          data-testid="backup-import-input"
          style={{ display: "none" }}
        />
      </div>
      {error && (
        <p role="alert" data-testid="backup-import-error" style={{ color: C.loss }}>
          {error}
        </p>
      )}
      {candidate && (
        <div style={{ marginTop: 12, lineHeight: 1.7 }} data-testid="backup-import-confirm">
          <p>
            הגיבוי מכיל {candidate.db.sessions.length} ערבים ו־{candidate.db.yearly.length} מאזנים
            שנתיים{candidate.full ? ", וגם את ההגדרות והערב החי" : ""}. אישור יחליף את הנתונים
            הנוכחיים. תחילה יירד גיבוי מלא של הנתונים הקיימים.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" data-testid="backup-import-apply" style={btn} onClick={() => void applyImport()}>
              גבה והחלף נתונים
            </button>
            <button type="button" style={btn} onClick={() => setCandidate(null)}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {groupId && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>צילומי גיבוי בשרת</div>
          <p style={{ fontSize: 12, color: C.dim, marginTop: 0, lineHeight: 1.6 }}>
            צילום שרת נשמר גם אם הקבוצה תימחק: צילום יומי אוטומטי, צילום חובה לפני כל מחיקה,
            וצילום ידני כאן. שחזור יוצר קבוצה חדשה מהצילום.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={btn}
              data-testid="snapshot-take-btn"
              disabled={snapBusy}
              onClick={() => void takeSnapshot()}
            >
              צלם עכשיו
            </button>
          </div>
          {snapMsg && (
            <p data-testid="snapshot-msg" style={{ color: C.win, fontSize: 13 }}>
              {snapMsg}
            </p>
          )}
          {snapError && (
            <p role="alert" data-testid="snapshot-error" style={{ color: C.loss, fontSize: 13 }}>
              {snapError}
            </p>
          )}
          {snapshots && snapshots.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    padding: "6px 0",
                    borderTop: `1px dashed ${C.line}`,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {REASON_LABELS[s.reason] || s.reason} ·{" "}
                    {new Date(s.created_at).toLocaleString("he-IL")}
                  </span>
                  <button
                    type="button"
                    style={{ ...btn, flex: "0 0 auto", padding: "6px 12px", fontSize: 13 }}
                    data-testid="snapshot-restore-btn"
                    disabled={snapBusy}
                    onClick={() => void restoreSnapshot(s)}
                  >
                    שחזר כקבוצה חדשה
                  </button>
                </div>
              ))}
            </div>
          )}
          {snapshots && snapshots.length === 0 && (
            <p style={{ fontSize: 12, color: C.dim }}>אין עדיין צילומים לקבוצה הזו.</p>
          )}
        </div>
      )}
    </div>
  );
}
