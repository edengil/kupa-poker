"use client";
/* ============================================================================
   קופה — פוקר · רכיב האפליקציה
   הועבר אוטומטית מ-index.html המקורי. הלוגיקה לא שונתה.
   שינויים: שכבת האחסון הוחלפה ב-lib/store, ונוסף מצב readOnly.
   המודולים חולצו ל-components/poker/*; כאן נשארת רק מעטפת ה-App.
   ============================================================================ */
import React, { useState, useEffect, useMemo } from "react";
import { store } from "../lib/store";
import { C } from "./poker/colors";
import { Header, TabBar, Style } from "./poker/chrome";
import { SessionsTab } from "./poker/SessionsTab";
import { Banner } from "./poker/Banner";
import { TableTab } from "./poker/TableTab";
import { normalize } from "./poker/db";
import { InputTab } from "./poker/InputTab";
import { brokenRecords } from "./poker/brokenRecords";
import { RecordsTab } from "./poker/RecordsTab";
import { PlayersTab } from "./poker/PlayersTab";
import { ProfileSheet } from "./poker/ProfileSheet";
import { LiveTab } from "./poker/LiveTab";
import { PokerTable } from "./poker/PokerTable";
import { DB_KEY, loadConfig } from "./poker/config";
import { buildSeedDb } from "./poker/seed";
import { applyChipBackfill } from "./poker/chipBackfill";
import { EGFooter } from "./Logo";

// שיתוף אמין: (1) Web Share API — גיליון השיתוף של iOS, בוחרים וואטסאפ והקבוצה; הטקסט עובר נקי.
// (2) נפילה להעתקה ללוח (כמו באפליקציית הטעינות). (3) נפילה אחרונה: deep-link ישיר לאפליקציה.
/* ============================ APP ============================ */
function App({
  readOnly = false,
  onTabChange,
  statsPanel = null,
  onGameStart,
  renderRsvps,
  onRecords,
  onPlanShared,
  initialTab = "table",
}) {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  // initialTab מאפשר לרענון מבחוץ (remount אחרי פינג מהבוט) לא לזרוק
  // את המשתמש בחזרה לטבלה
  const [tab, setTabState] = useState(initialTab);
  // מעבר טאב מדווח החוצה — ככה יומן הצפיות יודע במה כל צופה הסתכל
  const setTab = (id) => {
    setTabState(id);
    if (typeof onTabChange === "function") onTabChange(id);
  };
  const canWrite = !readOnly;
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadConfig();
      const raw = await store.get(DB_KEY);
      let d;
      if (raw) {
        try {
          d = normalize(JSON.parse(raw));
        } catch {
          d = buildSeedDb();
        }
      } else d = buildSeedDb(); // ברירת מחדל בזיכרון בלבד — לא נכתב אוטומטית
      // גיבוי ג'יטונים מצ'אט אוג׳ 2026 — ממלא ערבים ישנים בלי שדה chips
      const filled = applyChipBackfill(d);
      if (alive) {
        setDb(d);
        setReady(true);
        // בעלים: שומרים פעם אחת למסד כדי ששיאי הג'יטונים יישארו
        if (filled && !readOnly) {
          store.set(DB_KEY, JSON.stringify(d));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const commit = (n) => {
    if (readOnly) return;
    setDb(n);
    store.set(DB_KEY, JSON.stringify(n));
  }; // כתיבה רק בפעולת משתמש

  const years = useMemo(() => {
    if (!db) return [];
    const s = new Set([new Date().getFullYear()]);
    db.sessions.forEach((x) => s.add(x.y));
    db.yearly.forEach((x) => s.add(x.y));
    return [...s].sort((a, b) => b - a);
  }, [db]);

  if (!ready || !db) {
    return (
      <div
        dir="rtl"
        style={{
          background: C.feltDeep,
          color: C.dim,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "'Rubik',system-ui,sans-serif",
        }}
      >
        <Style />
        <div>טוען…</div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={{
        background: C.feltDeep,
        color: C.cream,
        minHeight: "100vh",
        fontFamily: "'Rubik',system-ui,sans-serif",
      }}
    >
      <Style />
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "0 13px calc(90px + env(safe-area-inset-bottom))",
        }}
      >
        <Header />
        <Banner db={db} onPlayer={setProfile} />
        {tab === "input" ? (
          <InputTab db={db} commit={commit} years={years} />
        ) : tab === "live" ? (
          <LiveTab
            db={db}
            commit={commit}
            onGameStart={onGameStart}
            renderRsvps={renderRsvps}
            onRecords={onRecords}
            onPlanShared={onPlanShared}
          />
        ) : tab === "sessions" ? (
          <SessionsTab
            db={db}
            commit={commit}
            goEdit={(r) => {
              setTab("input");
              setTimeout(() => window.__loadRaw?.(r), 0);
            }}
          />
        ) : tab === "table" ? (
          <TableTab db={db} years={years} readOnly={readOnly} />
        ) : tab === "stats" && statsPanel ? (
          statsPanel
        ) : tab === "records" ? (
          <RecordsTab db={db} />
        ) : (
          <PlayersTab db={db} onPlayer={setProfile} />
        )}
        <EGFooter />
      </div>
      {profile && (
        <ProfileSheet db={db} name={profile} onClose={() => setProfile(null)} />
      )}
      <TabBar
        tab={tab}
        setTab={setTab}
        n={db.sessions.length}
        readOnly={readOnly}
        hasStats={!!statsPanel}
      />
    </div>
  );
}

export default App;
export { PokerTable, brokenRecords };
