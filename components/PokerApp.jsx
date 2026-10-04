"use client";
/* ============================================================================
   קופה — פוקר · רכיב האפליקציה
   הועבר אוטומטית מ-index.html המקורי. הלוגיקה לא שונתה.
   שינויים: שכבת האחסון הוחלפה ב-lib/store, ונוסף מצב readOnly.
   לוגיקה ב-lib/poker, ומסכים ב-components/poker. כאן נשארת רק מעטפת ה-App.
   טאבים כבדים נטענים lazy כדי שהמסך הראשון (טבלה) יעלה מהר.
   ============================================================================ */
import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from "react";
import { store } from "../lib/store";
import { C } from "../lib/poker/colors";
import { Header, TabBar, Style, TABBAR_H } from "./poker/chrome";
import { Banner } from "./poker/Banner";
import { TableTab } from "./poker/TableTab";
import { normalize } from "../lib/poker/db";
import { setPlayerEmail } from "../lib/poker/emailRsvp";
import { brokenRecords } from "../lib/poker/brokenRecords";
import { RecordsAlert } from "./poker/RecordsAlert.jsx";
import { normalizeRecordAlertLines } from "../lib/poker/recordsAlert";
import { DB_KEY, loadConfig } from "../lib/poker/config";
import { applyChipBackfill } from "../lib/poker/chipBackfill";
import { applyTipBackfill } from "../lib/poker/tipBackfill";
import { PersonalHighlightsCard } from "./poker/PersonalHighlightsCard";
import { PersonalStatsCard } from "./poker/PersonalStatsCard";
import { MonthHeroesCard } from "./poker/MonthHeroesCard";
import { RecentFormCard } from "./poker/RecentFormCard";
import { matchViewerToPlayer } from "../lib/poker/personalHighlights";
import { AL } from "../lib/poker/helpers";
import { isGroupAdmin } from "../lib/paymentAccess";
import { NightFocus } from "./poker/NightFocus";
import { TransferConfirmPopup } from "./poker/TransferConfirmPopup";
import { receiptConfirmPrompt, transferConfirmPrompt } from "../lib/nightConfirmations";
import { collectNotices, noticesForViewer } from "../lib/notifications";
import { loadSeenIds, markSeenIds, saveSeenIds, unseenNotices } from "../lib/noticeSeen";
import { markReceipt, markTransfer } from "../lib/paymentTracking";
import { NotificationsSheet } from "./poker/NotificationsSheet";
import { noticeDeliveryDecision } from "../lib/noticeDelivery";
import { getNoticeDeliveryState } from "../lib/pushClient";
import { allTransfersPaid } from "../lib/settlementClosed";
import { announceSettlementClosed } from "../lib/announceSettlementClosed";
import { flushStore } from "../lib/store";
import { EGFooter } from "./Logo";
import { track } from "../lib/analytics";

/* localStorage בטוח ל־SSR — null כשאין חלון דפדפן. */
const safeStorage = () =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const LiveTab = lazy(() =>
  import("./poker/LiveTab").then((m) => ({ default: m.LiveTab }))
);
const InputTab = lazy(() =>
  import("./poker/InputTab").then((m) => ({ default: m.InputTab }))
);
const SessionsTab = lazy(() =>
  import("./poker/SessionsTab").then((m) => ({ default: m.SessionsTab }))
);
const RecordsTab = lazy(() =>
  import("./poker/RecordsTab").then((m) => ({ default: m.RecordsTab }))
);
const PlayersTab = lazy(() =>
  import("./poker/PlayersTab").then((m) => ({ default: m.PlayersTab }))
);
const ProfileSheet = lazy(() =>
  import("./poker/ProfileSheet").then((m) => ({ default: m.ProfileSheet }))
);

function TabFallback() {
  return (
    <div
      role="status"
      style={{
        textAlign: "center",
        padding: "28px 12px",
        color: C.dim,
        fontSize: 14,
      }}
    >
      טוען…
    </div>
  );
}

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
  /** { name?, full_name?, email? } מ-Google auth — לשיאים אישיים */
  viewerAuth = null,
  /** צופה: סימון שולם דרך RPC */
  onMarkPayment = null,
  /** צופה: הצבעה לשחקן הערב דרך RPC */
  onVotePlayer = null,
  /** לינק לערב ספציפי — /g/slug/n/sessionId */
  focusSessionId = null,
  groupId = null,
}) {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [recordAlert, setRecordAlert] = useState(null);
  const [transferPromptDismissed, setTransferPromptDismissed] = useState(false);
  const [receiptPromptDismissed, setReceiptPromptDismissed] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  // null = עדיין בודק יכולת פוש; true = מקבל פוש בחוץ, false = מציג בתוך המסך
  const [pushCapable, setPushCapable] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let state = await getNoticeDeliveryState().catch(() => null);
      let decision = noticeDeliveryDecision(state || {});
      // האישור ניתן אבל המנוי עוד נרשם ברקע ב-PushPrompt — בדיקה אחת נוספת
      if (!decision.canPush && state?.installed && state?.permission === "granted") {
        await new Promise((r) => setTimeout(r, 1500));
        if (!alive) return;
        state = await getNoticeDeliveryState().catch(() => state);
        decision = noticeDeliveryDecision(state || {});
      }
      if (alive) setPushCapable(decision.canPush);
    })();
    return () => {
      alive = false;
    };
  }, []);
  // initialTab מאפשר לרענון מבחוץ (remount אחרי פינג מהבוט) לא לזרוק
  // את המשתמש בחזרה לטבלה
  const [tab, setTabState] = useState(initialTab);
  // מעבר טאב מדווח החוצה — ככה יומן הצפיות יודע במה כל צופה הסתכל
  const setTab = (id) => {
    setTabState(id);
    track("tab_viewed", { tab: id });
    if (typeof onTabChange === "function") onTabChange(id);
  };
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
          throw new Error("הנתונים שהתקבלו אינם תקינים. לא בוצע שינוי בהיסטוריה.");
        }
      } else {
        const { buildSeedDb } = await import("../lib/poker/seed");
        d = buildSeedDb(); // ברירת מחדל בזיכרון בלבד — לא נכתב אוטומטית
      }
      // גיבוי ג'יטונים מצ'אט אוג׳ 2026 — ממלא ערבים ישנים בלי שדה chips
      const chipsFilled = applyChipBackfill(d);
      // גיבוי טיפים חד־פעמי (למשל טיפ שנרשם אחרי סגירת הערב)
      const tipsFilled = applyTipBackfill(d);
      const filled = chipsFilled || tipsFilled;
      if (alive) {
        setDb(d);
        setReady(true);
        // בעלים: שומרים פעם אחת למסד כדי ששיאי הג'יטונים / הטיפים יישארו
        if (filled && !readOnly) {
          store.set(DB_KEY, JSON.stringify(d));
        }
      }
    })().catch((error) => {
      if (alive) setLoadError(error.message);
    });
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
    db.sessions.forEach((x) => {
      const n = Number(x.y);
      if (Number.isFinite(n)) s.add(n);
    });
    db.yearly.forEach((x) => {
      const n = Number(x.y);
      if (Number.isFinite(n)) s.add(n);
    });
    return [...s].sort((a, b) => b - a);
  }, [db]);

  // תקופה משותפת לבאנר ולטבלה — לחיצה על «הכל» מעדכנת את שניהם
  const [scope, setScope] = useState(readOnly ? "month" : "year");
  const [periodY, setPeriodY] = useState(null);
  const [periodMo, setPeriodMo] = useState(null);
  const y = periodY ?? (years[0] || new Date().getFullYear());
  const mo = useMemo(() => {
    if (periodMo != null) return periodMo;
    if (!db?.sessions?.length) return new Date().getMonth() + 1;
    const s = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso))[0];
    return s ? s.mo : new Date().getMonth() + 1;
  }, [periodMo, db]);

  const viewerName = useMemo(
    () => (db && viewerAuth ? matchViewerToPlayer(db, viewerAuth) : null),
    [db, viewerAuth]
  );
  const showPersonal = !!viewerAuth && !focusSessionId;
  const isAdmin = !readOnly || isGroupAdmin({ email: viewerAuth?.email, name: viewerName });
  const aliases = useMemo(() => (db ? AL(db) : {}), [db]);
  const transferPrompt = useMemo(
    () => (db && viewerName ? transferConfirmPrompt(db.sessions, viewerName, aliases) : null),
    [db, viewerName, aliases]
  );
  const receiptPrompt = useMemo(
    () => (db && viewerName ? receiptConfirmPrompt(db.sessions, viewerName, aliases) : null),
    [db, viewerName, aliases]
  );
  const notices = useMemo(
    () => (db ? noticesForViewer(collectNotices(db), viewerName, { isAdmin, aliases }) : []),
    [db, viewerName, isAdmin, aliases]
  );
  /* באדג' בסגנון פייסבוק: סופר רק התראות שטרם נצפו. פתיחת המגירה מסמנת
     את כל ה־id-ים הנוכחיים כנצפו; התראה חדשה (id חדש) תדליק שוב את הבאדג'. */
  const [seenIds, setSeenIds] = useState([]);
  useEffect(() => {
    setSeenIds(loadSeenIds(safeStorage(), viewerName));
  }, [viewerName]);
  const unseenCount = useMemo(
    () => unseenNotices(notices, seenIds).length,
    [notices, seenIds]
  );
  const openNotices = useCallback(() => {
    setNoticesOpen(true);
    setSeenIds((prev) => {
      const { ids, changed } = markSeenIds(
        prev,
        notices.map((n) => n.id)
      );
      if (changed) saveSeenIds(safeStorage(), viewerName, ids);
      return changed ? ids : prev;
    });
  }, [notices, viewerName]);
  const markNotice = useCallback(async (item) => {
    if (!db || !item?.sessionId || item.index == null) return;
    const session = db.sessions.find((s) => s.id === item.sessionId);
    if (!session) return;
    const field = item.action === "received" ? "received" : "paid";
    const next = field === "received"
      ? markReceipt(session, item.index, true, viewerName)
      : markTransfer(session, item.index, true, viewerName);
    if (typeof onMarkPayment === "function") {
      await onMarkPayment(session, item.index, true, field, viewerName);
    } else if (!readOnly) {
      commit({
        ...db,
        sessions: db.sessions.map((s) => (s.id === next.id ? next : s)),
      });
      await flushStore();
    }
    if (allTransfersPaid(next)) await announceSettlementClosed(next.id);
  }, [db, onMarkPayment, readOnly, viewerName]);
  const confirmOwnTransfers = useCallback(async () => {
    if (!transferPrompt || !db) return;
    let next = transferPrompt.session;
    for (const row of transferPrompt.rows) {
      next = markTransfer(next, row.index, true, viewerName);
    }
    if (typeof onMarkPayment === "function") {
      for (const row of transferPrompt.rows) {
        await onMarkPayment(transferPrompt.session, row.index, true, "paid", viewerName);
      }
    } else if (!readOnly) {
      commit({
        ...db,
        sessions: db.sessions.map((s) => (s.id === next.id ? next : s)),
      });
      await flushStore();
    }
    if (allTransfersPaid(next)) await announceSettlementClosed(next.id);
    setTransferPromptDismissed(true);
  }, [transferPrompt, db, onMarkPayment, readOnly, viewerName]);
  const confirmOwnReceipts = useCallback(async () => {
    if (!receiptPrompt || !db) return;
    let next = receiptPrompt.session;
    for (const row of receiptPrompt.rows) {
      next = markReceipt(next, row.index, true, viewerName);
    }
    if (typeof onMarkPayment === "function") {
      for (const row of receiptPrompt.rows) {
        await onMarkPayment(receiptPrompt.session, row.index, true, "received", viewerName);
      }
    } else if (!readOnly) {
      commit({
        ...db,
        sessions: db.sessions.map((s) => (s.id === next.id ? next : s)),
      });
      await flushStore();
    }
    if (allTransfersPaid(next)) await announceSettlementClosed(next.id);
    setReceiptPromptDismissed(true);
  }, [receiptPrompt, db, onMarkPayment, readOnly, viewerName]);

  const dismissRecordAlert = useCallback(() => setRecordAlert(null), []);
  const handleRecords = useCallback(
    (lines) => {
      const cleaned = normalizeRecordAlertLines(lines);
      if (cleaned) setRecordAlert(cleaned);
      if (typeof onRecords === "function") onRecords(lines);
    },
    [onRecords]
  );

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
        <div role={loadError ? "alert" : "status"}>
          {loadError || "טוען…"}
          {loadError && (
            <button onClick={() => window.location.reload()} style={{ display: "block", margin: "16px auto" }}>
              נסה שוב
            </button>
          )}
        </div>
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
      <RecordsAlert lines={recordAlert} onDismiss={dismissRecordAlert} />
      {/* חלונות הכניסה רק למי שלא יכול לקבל פוש בחוץ; מי שמקבל פוש רואה תג שקט בלבד */}
      {pushCapable === false && transferPrompt && !transferPromptDismissed ? (
        <TransferConfirmPopup
          session={transferPrompt.session}
          rows={transferPrompt.rows}
          viewerName={viewerName}
          aliases={aliases}
          onConfirm={confirmOwnTransfers}
          onLater={() => setTransferPromptDismissed(true)}
        />
      ) : pushCapable === false && receiptPrompt && !receiptPromptDismissed ? (
        <TransferConfirmPopup
          kind="received"
          session={receiptPrompt.session}
          rows={receiptPrompt.rows}
          viewerName={viewerName}
          aliases={aliases}
          onConfirm={confirmOwnReceipts}
          onLater={() => setReceiptPromptDismissed(true)}
        />
      ) : null}
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: `0 13px calc(${TABBAR_H}px + env(safe-area-inset-bottom))`,
        }}
      >
        {focusSessionId && (
          <NightFocus
            db={db}
            sessionId={focusSessionId}
            viewerName={viewerName}
            isAdmin={isAdmin}
            commit={commit}
            readOnly={readOnly}
            onMarkPayment={onMarkPayment}
            onVotePlayer={onVotePlayer}
          />
        )}
        <Header noticeCount={unseenCount} onOpenNotices={openNotices} />
        {noticesOpen ? (
          <NotificationsSheet
            items={notices}
            onClose={() => setNoticesOpen(false)}
            onMark={markNotice}
          />
        ) : null}
        <Banner
          db={db}
          onPlayer={setProfile}
          scope={scope}
          setScope={setScope}
          y={y}
          setY={setPeriodY}
          mo={mo}
          setMo={setPeriodMo}
        />
        {tab === "table" && <MonthHeroesCard db={db} onPlayer={setProfile} />}
        {tab === "table" && (
          <RecentFormCard db={db} playerName={viewerName} onPlayer={setProfile} />
        )}
        {showPersonal && tab === "table" && (
          <>
            <PersonalStatsCard db={db} playerName={viewerName} compact />
            <PersonalHighlightsCard db={db} playerName={viewerName} compact />
          </>
        )}
        <Suspense fallback={<TabFallback />}>
          {tab === "input" ? (
            <InputTab db={db} commit={commit} years={years} />
          ) : tab === "live" ? (
            <LiveTab
              db={db}
              commit={commit}
              onGameStart={onGameStart}
              renderRsvps={renderRsvps}
              onRecords={handleRecords}
              onPlanShared={onPlanShared}
            />
          ) : tab === "sessions" ? (
            <SessionsTab db={db} commit={commit} />
          ) : tab === "table" ? (
            <TableTab
              db={db}
              commit={commit}
              years={years}
              readOnly={readOnly}
              scope={scope}
              setScope={setScope}
              y={y}
              setY={setPeriodY}
              mo={mo}
              setMo={setPeriodMo}
              viewerName={viewerName}
              isAdmin={isAdmin}
              onMarkPayment={onMarkPayment}
              onVotePlayer={onVotePlayer}
              focusSessionId={focusSessionId}
            />
          ) : tab === "stats" && statsPanel ? (
            statsPanel
          ) : tab === "records" ? (
            <RecordsTab db={db} viewerName={viewerName} showMine={showPersonal} allowPick={!readOnly} />
          ) : (
            <PlayersTab db={db} onPlayer={setProfile} />
          )}
        </Suspense>
        <EGFooter />
      </div>
      {profile && (
        <Suspense fallback={null}>
          <ProfileSheet
            db={db}
            name={profile}
            onClose={() => setProfile(null)}
            onSaveEmail={
              readOnly
                ? undefined
                : (email) => commit(setPlayerEmail(db, profile, email))
            }
          />
        </Suspense>
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
export { PokerTable } from "./poker/PokerTable";
export { brokenRecords };
