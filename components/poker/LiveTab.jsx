"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { store, flushStore } from "../../lib/store";
import { buildReport, nightDateParts } from "../../lib/report";
import { nightSummaryText } from "../../lib/nightShare";
import { C } from "../../lib/poker/colors";
import { fmt } from "../../lib/poker/format";
import { r2, AL, canon, waSend } from "../../lib/poker/helpers";
import { applyTipTotalsToPlayers, canonLivePlayers, liveAlreadySaved } from "../../lib/liveMerge";
import { applyManualTip, removeManualTip } from "../../lib/manualTips";
import { computeLiveRebuys } from "../../lib/poker/liveRebuys";
import { appendAction, labelAction, undoLast } from "../../lib/liveActionLog";
import { buildPlayersView, playerChips, effectivePot } from "../../lib/liveView";
import { computeLivePace, averageNightMs, formatClock } from "../../lib/poker/livePace";
import { notifyTransfersSettlement } from "../../lib/poker/notifyTransfersClient";
import { detectLiveRecords, liveRecordAnnouncement } from "../../lib/poker/liveRecords";
import { postToGroup } from "../../lib/postToGroup";
import { buildAttendanceSnapshot } from "../../lib/poker/attendance";
import { matchViewerToPlayer } from "../../lib/poker/personalHighlights";
import { getConfig, onConfig, setConfig, LIVE_KEY } from "../../lib/poker/config";
import { brokenRecords } from "../../lib/poker/brokenRecords";
import {
  applyCoupleFill,
  DEFAULT_FILL_CHIPS,
} from "../../lib/poker/coupleFills";
import { IconBtn, Empty, RoundBtn, inputStyle } from "./ui";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { LiveDistributionPanel } from "./live/LiveDistributionPanel";
import { LivePlayerSetupPanel } from "./live/LivePlayerSetupPanel";
import { LiveBuyinControls } from "./live/LiveBuyinControls";
import { LivePlayerRow } from "./live/LivePlayerRow";
import { LivePotPanel } from "./live/LivePotPanel";
import { LiveRebuysBoard } from "./live/LiveRebuysBoard";
import { LiveBitShare, LiveShareSheet, LiveSendPrompt } from "./live/LiveShare";
import { PlanCard } from "./PlanCard";
import { BotToggle } from "./BotToggle";
import { PokerTable } from "./PokerTable";
import { Plus, Minus, UserPlus, Coins, X } from "./icons";
import { brassCta, sectionEyebrow, sectionTitle } from "../../lib/poker/festive";
import { checkNightBalance, confirmSaveIfUnbalanced } from "../../lib/poker/nightBalance";

/* שעון לפעולות משתמש בתוך handlers (לא לרינדור) — saveNight ודומיו. */
const nowMs = () => Date.now();

/* טאב לייב — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function LiveTab({
  db,
  commit,
  onGameStart,
  renderRsvps,
  onRecords,
  onPlanShared,
}) {
  const A = AL(db);
  /* נוכחות ~100 יום אחרונים + סה"כ — משותף להצעות ולהצגת שחקנים בשולחן */
  const activity = useMemo(() => {
    const aliases = AL(db);
    const dates = db.sessions.map((s) => s.iso).sort();
    const latest = dates.length ? dates[dates.length - 1] : null;
    // חלון "החודשים האחרונים": ~100 ימים אחורה מהערב האחרון
    const cutoff = latest
      ? new Date(new Date(latest).getTime() - 100 * 864e5).toISOString().slice(0, 10)
      : "0000-00-00";
    const recent = {},
      allc = {};
    for (const s of db.sessions) {
      const seen = new Set();
      for (const e of s.entries) {
        const n = canon(e.name, aliases);
        if (seen.has(n)) continue;
        seen.add(n);
        allc[n] = (allc[n] || 0) + 1;
        if (s.iso >= cutoff) recent[n] = (recent[n] || 0) + 1;
      }
    }
    return { recent, allc };
  }, [db]);
  const known = useMemo(() => {
    const aliases = AL(db);
    const { recent, allc } = activity;
    const names = new Set(Object.keys(allc));
    (db.roster || []).forEach((n) => names.add(canon(n, aliases)));
    // הכי פעילים לאחרונה קודם, אחר כך לפי סה"כ, ואז א"ב
    return [...names].sort(
      (a, b) =>
        (recent[b] || 0) - (recent[a] || 0) ||
        (allc[b] || 0) - (allc[a] || 0) ||
        a.localeCompare(b, "he")
    );
  }, [db, activity]);
  const [cfg, setCfg] = useState(getConfig());
  useEffect(() => onConfig(setCfg), []);
  const cps = cfg.chipsPerShekel || 2;
  const [players, setPlayers] = useState([]); // {name, buyin(₪), cashout(chips string), tipsGiven?}
  const anyCash = players.some((p) => p.cashout !== "");
  /** במשחק: לפי פעילות. בסגירה: זוכים → שורה → חייבים → פתוחים למטה. */
  const playersView = useMemo(
    () =>
      buildPlayersView(players, {
        recent: activity.recent,
        allc: activity.allc,
        aliases: AL(db),
        anyCash,
        cps,
      }),
    [players, activity, db, anyCash, cps]
  );
  const [name, setName] = useState("");
  const [addAmt, setAddAmt] = useState(50);
  const [savings5, setSavings5] = useState(true); // 5% לקופת החיסכון — דלוק אוטומטית בכל משחק (עדן, 2026-10-14); הכפתור מכבה לערב ספציפי
  const [potDraft, setPotDraft] = useState(""); // עריכת המנהל לסכום קופת הערב — ריק = המחושב האוטומטי (עדן, 19.10)
  const [entriesCount, setEntriesCount] = useState(""); // כניסות שהכנתי (מלאי כולל)
  const [share, setShare] = useState(null);
  const [settleBuilder, setSettleBuilder] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(null); // חותמת זמן התחלת המשחק
  const [prompt, setPrompt] = useState(null); // הצעה לשלוח עדכון אחרי כניסה
  const [nowTs, setNowTs] = useState(() => Date.now()); // מתקתק לטיימר החי
  /* טיפים + מילוי זוגי — נשמרים בלייב; מילוי זוגי רק מהאפליקציה (לא בוואטסאפ) */
  const [tips, setTips] = useState([]);
  const [coupleFills, setCoupleFills] = useState([]);
  const [actionLog, setActionLog] = useState([]);
  const [handOfNight, setHandOfNight] = useState(""); // יד הערב — טקסט חופשי, נשמר עם הערב
  const [liveAnnounced, setLiveAnnounced] = useState([]); // מפתחות שיאים חיים שכבר הוכרזו הערב (דדופ)
  /* צילום ההזמנה ברגע פתיחת המשחק: אישורי הגעה + מיקום (התוכנית נמחקת כשהמשחק מתחיל) */
  const [planSnap, setPlanSnap] = useState(null);
  const rsvpRowsRef = useRef([]);
  const handleRsvpRows = (rows) => {
    rsvpRowsRef.current = Array.isArray(rows) ? rows : [];
  };
  const [menuIdx, setMenuIdx] = useState(null); // תפריט עדין למילוי זוגי
  const [tipPickerIdx, setTipPickerIdx] = useState(null); // שורת שחקן עם בוחר טיפ פתוח
  const [tipAmt, setTipAmt] = useState(""); // סכום (ג'יטונים) בבוחר הטיפ הידני
  const [tipListName, setTipListName] = useState(null); // שחקן שרשימת הטיפים שלו פתוחה
  const [tipDelConfirm, setTipDelConfirm] = useState(null); // מזהה אירוע טיפ שממתין לאישור מחיקה
  const longPressRef = useRef(null);
  /* שדות שהבוט כותב (applied/pending/closing/מחמאות) — נשמרים כדי לא לדרוס אותם */
  const liveMetaRef = useRef({});
  const cashoutDraftRef = useRef({}); // ערך יצא לפני עריכה — ליומן ביטול

  // שחזור משחק פעיל אחרי סגירת האפליקציה
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await store.get(LIVE_KEY);
      if (alive && raw) {
        try {
          const d = JSON.parse(raw);
          /* שריד של ערב שכבר נסגר ונשמר — לא משחזרים; מנקים את מצב הלייב */
          if (liveAlreadySaved(d, db?.sessions)) {
            store.set(LIVE_KEY, "");
            if (alive) setHydrated(true);
            return;
          }
          const liveTips = Array.isArray(d.tips) ? d.tips : [];
          if (Array.isArray(d.players)) {
            setPlayers(applyTipTotalsToPlayers(canonLivePlayers(d.players, A), liveTips, A));
          }
          if (d.entriesCount !== undefined) setEntriesCount(d.entriesCount);
          if (d.addAmt) setAddAmt(d.addAmt);
          if (d.savings5 !== undefined) setSavings5(d.savings5 !== false);
          if (typeof d.potDraft === "string") setPotDraft(d.potDraft);
          if (d.startedAt) setStartedAt(d.startedAt);
          if (Array.isArray(d.tips)) setTips(liveTips);
          if (Array.isArray(d.coupleFills)) setCoupleFills(d.coupleFills);
          if (Array.isArray(d.actionLog)) setActionLog(d.actionLog);
          if (typeof d.handOfNight === "string") setHandOfNight(d.handOfNight);
          if (Array.isArray(d.liveAnnounced)) setLiveAnnounced(d.liveAnnounced);
          if (d.planSnap && typeof d.planSnap === "object") setPlanSnap(d.planSnap);
          liveMetaRef.current = {
            applied: d.applied,
            pending: d.pending,
            closing: d.closing,
            pendingApprovals: d.pendingApprovals,
            approvedNames: d.approvedNames,
            tipComplimentBag: d.tipComplimentBag,
            tipComplimentLast: d.tipComplimentLast,
            // שומרים ts קיים — לא לכתוב Date.now() בכל שמירה (גורם להבדל מול השרת)
            ...(d.ts != null ? { ts: d.ts } : {}),
          };
        } catch {}
      }
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
    // שחזור חד־פעמי בטעינה בלבד: db/A נקראים כצילום של רגע הטעינה. הגעת db
    // מאוחרת מטופלת באפקט הניקוי הייעודי למטה — הוספתם לכאן תשחזר שוב ושוב.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // שמירה אוטומטית בכל שינוי
  useEffect(() => {
    if (!hydrated) return;
    if (players.length === 0) {
      store.set(LIVE_KEY, "");
      return;
    }
    store.set(
      LIVE_KEY,
      JSON.stringify({
        ...liveMetaRef.current,
        players,
        entriesCount,
        addAmt,
        savings5,
        potDraft,
        startedAt,
        tips,
        coupleFills,
        actionLog,
        handOfNight,
        liveAnnounced,
        planSnap,
        cps,
        editedAt: Date.now(),
      })
    );
  }, [players, entriesCount, addAmt, savings5, potDraft, startedAt, tips, coupleFills, actionLog, handOfNight, liveAnnounced, planSnap, cps, hydrated]);

  // שריד לייב של ערב שכבר נשמר — אם ה-db נטען רק אחרי שהלייב שוחזר,
  // מנקים את המשחק המת ברגע שמתגלה שהוא כבר קיים כערב שמור.
  useEffect(() => {
    if (!hydrated || !startedAt || players.length === 0) return;
    if (!liveAlreadySaved({ startedAt }, db?.sessions)) return;
    store.set(LIVE_KEY, "");
    // ניקוי מצב כשה־db מגלה שהערב כבר שמור — סנכרון מול מקור חיצוני (המסד),
    // לא נגזרת של הרינדור; אין דרך לבצעו בשלב הרינדור בלי לכתוב לחנות באמצעו.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayers([]);
    setEntriesCount("");
    setStartedAt(null);
    setSavings5(true); // הערב הבא מתחיל שוב עם 5% אוטומטי
    setLiveAnnounced([]);
    setTips([]);
    setCoupleFills([]);
    setActionLog([]);
    setHandOfNight("");
    setPlanSnap(null);
  }, [hydrated, startedAt, players.length, db?.sessions]);

  // שיא חי נשבר באמצע הערב → הכרזה בקבוצה פעם אחת לכל שיא+שחקן.
  // רק כשהבוט דלוק; נכשל בשקט כמו שאר ההכרזות — המשחק חשוב יותר.
  useEffect(() => {
    if (!hydrated || !cfg.botOn || players.length === 0) return;
    const fresh = detectLiveRecords({
      db,
      players,
      announced: liveAnnounced,
    });
    if (!fresh.length) return;
    // סימון "הוכרז" הוא ספר־החשבונות של אפקט ההכרזה החיצוני (שליחה לקבוצה) —
    // חייב להישמר יחד עם השליחה, באותו אפקט.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveAnnounced((prev) => [...new Set([...prev, ...fresh.map((r) => r.key)])]);
    const text = liveRecordAnnouncement(fresh);
    if (text) {
      postToGroup(text).catch((e) =>
        console.warn("live record announce failed:", e.message)
      );
    }
  }, [players, cfg.botOn, hydrated, db, liveAnnounced]);

  // ערב חדש מתחיל מרשימת שחקנים ריקה — הדדופ של ההכרזות מתאפס בכל נתיב
  // שרוקן את השחקנים (ביטול משחק, ניקוי ערב שמור, סיום שמירה), לא באפקט נפרד.

  // ההצעה נעלמת לבד אחרי 15 שניות כדי לא להפריע
  useEffect(() => {
    if (!prompt) return;
    const id = setTimeout(() => setPrompt(null), 15000);
    return () => clearTimeout(id);
  }, [prompt]);

  // שעון חי — מתעדכן כל שנייה כל עוד יש משחק פעיל
  useEffect(() => {
    if (!startedAt || players.length === 0) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, players.length]);
  const now = new Date();
  const dLbl = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const addPlayer = (nm) => {
    nm = canon(String(nm || "").trim(), A);
    if (!nm || players.some((p) => canon(p.name, A) === nm)) return;
    /* שחקן ראשון פותח את המשחק — מצלמים את ההזמנה ואת אישורי ההגעה
       לפני שהתוכנית נמחקת, כדי לשמור צילום נוכחות עם הערב. */
    const isGameStart = players.length === 0 && !startedAt;
    if (isGameStart) {
      // משחק נפתח — מדליקים את הבוט בשרת בוודאות, בלי להסתמך על המטמון
      // המקומי (שעלול לחשוב שהוא כבר דלוק כשבשרת הוא כבוי)
      setConfig({ botOn: true });
      if (typeof onGameStart === "function") onGameStart();
      // ההזמנה לערב כבר התממשה — מסירים כדי שלא יישאר "מחכה לערב"
      if (db.plan) commit({ ...db, plan: null });
    }
    if (isGameStart && !planSnap) {
      setPlanSnap(
        db.plan
          ? {
              planIso: db.plan.iso,
              location: db.plan.location,
              note: db.plan.note,
              rsvpRows: rsvpRowsRef.current,
            }
          : null
      );
    }
    setPlayers((p) => {
      if (p.length === 0 && !startedAt) {
        setStartedAt(Date.now());
      }
      // 5% לקופת החיסכון — החוב נשאר מלא, הקופה מחושבת כ-5% מסך הקניות
      const toPot = savings5 ? r2(addAmt * 0.05) : 0;
      return [
        ...p,
        {
          name: nm,
          buyin: addAmt,
          cashout: "",
          buyinEvents: [{ amount: addAmt, at: Date.now(), total: addAmt, pot: toPot || undefined }],
        },
      ];
    });
    setActionLog((log) => appendAction(log, { t: "seat", name: nm, amount: addAmt }));
    setName("");
  };
  const GRACE_MS = 10 * 60 * 1000; // 10 דק' חסד בתחילת המשחק — לא מציעים לשלוח
  const bump = (i, amt) => {
    const at = Date.now();
    const nm = players[i] && players[i].name;
    // 5% לקופת החיסכון (רק בקנייה חיובית) — החוב נשאר מלא
    const toPot = savings5 && amt > 0 ? r2(amt * 0.05) : 0;
    setPlayers((p) =>
      p.map((x, j) => {
        if (j !== i) return x;
        const buyin = Math.max(0, r2((+x.buyin || 0) + amt));
        const next = { ...x, buyin };
        if (amt > 0) {
          const events = [...(x.buyinEvents || [])];
          events.push({ amount: amt, at, total: buyin, pot: toPot || undefined });
          next.buyinEvents = events;
        }
        return next;
      })
    );
    if (nm && amt) setActionLog((log) => appendAction(log, { t: "buyin", name: nm, amount: amt }));
    if (amt > 0 && startedAt && Date.now() - startedAt > GRACE_MS) {
      setPrompt({
        name: nm,
        amt,
        id: Date.now(),
      });
    }
  };
  const setField = (i, patch) =>
    setPlayers((p) =>
      p.map((x, j) =>
        j === i
          ? {
              ...x,
              ...patch,
            }
          : x
      )
    );
  const commitCashout = (i, nextCashout) => {
    const p = players[i];
    if (!p) return;
    const before =
      cashoutDraftRef.current[p.name] !== undefined
        ? cashoutDraftRef.current[p.name]
        : p.cashout;
    const chips = String(nextCashout ?? "");
    if (String(before ?? "") === chips) return;
    setField(i, { cashout: chips });
    setActionLog((log) =>
      appendAction(log, { t: "cashout", name: p.name, chips, before: before ?? "" })
    );
    delete cashoutDraftRef.current[p.name];
  };
  const rm = (i) => {
    const p = players[i];
    if (!p) return;
    setActionLog((log) =>
      appendAction(log, { t: "remove", name: p.name, at: i, player: { ...p } })
    );
    setPlayers((list) => list.filter((_, j) => j !== i));
  };
  const undoAction = () => {
    const out = undoLast({ players, tips, coupleFills, actionLog });
    if (!out) return;
    setPlayers(out.players);
    setTips(out.tips);
    setCoupleFills(out.coupleFills);
    setActionLog(out.actionLog);
  };
  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  // קופת החיסכון = 5% מסך הקופה כשהמתג דלוק — חישוב ישיר
  const savingsPot = savings5 ? r2(pot * 0.05) : 0;
  const rebuyBoard = useMemo(() => computeLiveRebuys(players, A), [players, A]);
  const potChips = players.reduce((s, p) => s + playerChips(p, cps), 0);
  const nets = players.map((p) => ({
    name: p.name,
    net: p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0)),
  }));
  const settled = nets.filter((n) => n.net !== null);
  const canFinish = players.length > 0 && players.every((p) => p.cashout !== "");
  const netSum = r2(settled.reduce((s, n) => s + n.net, 0));
  const cashSumChips = players.reduce(
    (s, p) => s + (p.cashout === "" ? 0 : +p.cashout || 0),
    0
  );

  // מונה כניסות: כניסה אחת = 50₪. בשימוש = הקופה חלקי 50. נותרו = שהכנתי פחות בשימוש.
  const ENTRY = 50;
  const entriesUsed = r2(pot / ENTRY);
  const entriesPrepared = entriesCount === "" ? null : +entriesCount || 0;
  const entriesLeft = entriesPrepared === null ? null : r2(entriesPrepared - entriesUsed);

  // דוח ביט מתעדכן — בפורמט הקבוצה
  // אותו מפרמט בדיוק שהבוט בוואטסאפ משתמש בו — כדי ששני הטקסטים לא יתפצלו
  const bitReport = useMemo(
    () =>
      buildReport({
        players,
        entriesCount,
        startedAt,
        now: nowTs,
        cps,
      }),
    [players, entriesCount, startedAt, nowTs, cps]
  );
  /* קצב חי: פעולות לשעה מהיומן, וסיום משוער לפי משך הערב החציוני ההיסטורי */
  const avgNightMs = useMemo(() => averageNightMs(db.sessions), [db]);
  const livePace = computeLivePace({
    startedAt,
    actionCount: actionLog.length,
    now: nowTs,
    avgNightMs,
  });
  async function saveNight() {
    if (players.some((p) => p.cashout === "")) {
      alert("יש שחקנים שעדיין לא הוזנו להם ג׳יטונים ביציאה. יש להשלים את כולם לפני סיום הערב (גם 0).");
      return;
    }
    /* נטו ב־₪ כמו תמיד; בנוסף chips / tipsGiven על כל רשומה כדי ששיאי
       ג'יטונים וטיפים יעבדו מכאן והלאה. */
    const entries = players
      .filter((p) => p.cashout !== "")
      .map((p) => {
        const chips = +p.cashout || 0;
        const buyin = +p.buyin || 0;
        const net = r2(chips / cps - buyin);
        return {
          name: p.name,
          amount: net,
          chips,
          buyin,
          tipsGiven: +p.tipsGiven || 0,
          buyinEvents: Array.isArray(p.buyinEvents) && p.buyinEvents.length ? p.buyinEvents : undefined,
        };
      });
    /* כולל מי שסגר באפס — קודם סוננו החוצה כש־chips=0 */
    if (!entries.length) return;
    /* אזהרה רכה לפני שמירה לא־מאוזנת — לא חוסם קניות/ישיבה באמצע המשחק */
    const balCheck = checkNightBalance({
      entries,
      cashSumChips,
      potChips,
      cps,
    });
    if (!confirmSaveIfUnbalanced(balCheck)) return;
    /* חוסר בגיטונים — יורד מהמרוויחים באופן יחסי, בשקלים שלמים (לפי עדן) */
    const chipsShortage = balCheck.chipsGapShekels != null && balCheck.chipsGapShekels < -0.01
      ? Math.round(-balCheck.chipsGapShekels)
      : 0;
    if (chipsShortage > 0) {
      const winners = entries.filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount);
      const totalWin = winners.reduce((s, w) => s + w.amount, 0);
      let distributed = 0;
      winners.forEach((w, i) => {
        let deduct;
        if (i === winners.length - 1) {
          deduct = chipsShortage - distributed;
        } else {
          deduct = Math.round((w.amount / totalWin) * chipsShortage);
          distributed += deduct;
        }
        w.amount = r2(w.amount - deduct);
      });
    }
    /* תאריך הערב = תחילת המשחק בשעון ישראל (לא חצות אחרי סגירה מאוחרת). */
    const endedAt = nowMs();
    const { d, mo, y, iso } = nightDateParts(startedAt, endedAt);
    /* צילום נוכחות: אישורי הגעה מול מי שבאמת ישב. שמות הצופים ממופים
       לשמות שחקנים; מי שלא זוהה נשאר עם שם ההתחברות ופשוט לא נספר. */
    const attendance = planSnap
      ? buildAttendanceSnapshot({
          rsvpRows: (planSnap.rsvpRows || []).map((r) => ({
            status: r.status,
            playerName:
              matchViewerToPlayer(db, { name: r.name, email: r.email }) || r.name,
          })),
          actualNames: players.map((p) => p.name),
          aliases: A,
        })
      : undefined;
    const potFinal = effectivePot(savingsPot, potDraft);
    const rec = {
      id: "live_" + nowMs(),
      iso,
      d,
      mo,
      y,
      entries,
      tips: tips.length ? tips.map(({ name, amount, at }) => ({ name, amount, at })) : undefined,
      cps,
      coupleFills: coupleFills.length ? coupleFills : undefined,
      startedAt: startedAt || null,
      endedAt,
      location: planSnap?.location || db.plan?.location || undefined,
      placeNote: planSnap?.note || db.plan?.note || undefined,
      /* יומן הפעולות נשמר עם הערב — רק ממנו מחשבים שיאי יציאה, רק לערבי לייב */
      actionLog: actionLog.length ? actionLog : undefined,
      handOfNight: handOfNight.trim() || undefined,
      attendance,
      savings5: savings5 || undefined,
      /* סכום הקופה שהמנהל אישר/ערך בסוף הערב — הוא מה שנרשם ומה שמצטבר (עדן, 19.10) */
      savingsPot: potFinal > 0 ? potFinal : undefined,
    };
    const roster = [...new Set([...(db.roster || []), ...players.map((p) => p.name)])];
    // קופת החיסכון מצטברת ברמת הקבוצה (רק האדמין רואה) — לפי הסכום שאושר
    const prevPot = Number(db.savingsPot) || 0;
    const newPot = r2(prevPot + potFinal);
    // שבירת שיאים נבדקת מול ה-db שלפני ההוספה — ואם נשבר משהו, הבוט מכריז בקבוצה
    if (typeof onRecords === "function") {
      try {
        const broken = brokenRecords(db, rec);
        if (broken.length) onRecords(broken);
      } catch (e) {
        console.warn("record check failed:", e.message);
      }
    }
    commit({
      ...db,
      sessions: [...db.sessions, rec].sort((a, b) => a.iso.localeCompare(b.iso)),
      roster,
      plan: null, // הערב התקיים — ההזמנה כבר לא רלוונטית
      savingsPot: newPot > 0 ? newPot : undefined,
    });
    store.set(LIVE_KEY, "");
    const saved = await flushStore();
    if (saved === false) {
      alert("הערב נשמר במכשיר, אבל השמירה לשרת נכשלה. השאר את המסך פתוח עד שמופיע «כל השינויים נשמרו».");
    } else {
      // הערב נשמר — שולח לכל שחקן פוש אישי עם ההעברות שלו (למי להעביר / מי יעביר אליו)
      void notifyTransfersSettlement(rec.id);
    }
    /* סיכום + טיפים; חלוקה ידנית במסך נפרד לפני שליחה לקבוצה */
    const summaryText = nightSummaryText({ ...rec, cps }, A);
    const playersSnap = players.map((p) => ({ ...p }));
    setPlayers([]);
    setEntriesCount("");
    setStartedAt(null);
    setSavings5(true); // הערב הבא מתחיל שוב עם 5% אוטומטי
    setTips([]);
    setCoupleFills([]);
    setActionLog([]);
    setHandOfNight("");
    setPlanSnap(null);
    setMenuIdx(null);
    setTipPickerIdx(null);
    setTipAmt("");
    setTipListName(null);
    setTipDelConfirm(null);
    // הערב נסגר — הבוט חוזר לישון עד המשחק הבא
    if (getConfig().botOn) setConfig({ botOn: false });
    setSettleBuilder({
      sessionId: rec.id,
      players: playersSnap,
      cps,
      endedAt,
      summaryText,
      title: `חלוקה ${d}.${mo}.${y}`,
    });
  }

  /* מילוי זוגי: כל לחיצה = 30 ג'יטונים מהערימה של from לשותף.
     תפריט מאפשר לבחור כיוון (אני→שותף / שותף→אני). בלי תווית "תרומה". */
  function doCoupleFill(fromName) {
    const res = applyCoupleFill(players, fromName, DEFAULT_FILL_CHIPS);
    if (!res.ok) {
      if (res.reason === "missing_partner") {
        alert("בן/בת הזוג לא בשולחן — אי אפשר לרשום מילוי.");
      }
      return;
    }
    setPlayers(res.players);
    setCoupleFills((f) => [...f, res.event]);
    setActionLog((log) =>
      appendAction(log, {
        t: "fill",
        from: res.event.from,
        to: res.event.to,
        chips: res.event.chips,
      })
    );
    setMenuIdx(null);
  }

  /* הוספת טיפ ידנית מהאפליקציה — גיבוי כשהבוט נפל. אותה סמנטיקה כמו הבוט
     (אירוע ליומן + הורדה מהיציאה אם כבר נרשמה), בלי שום הכרזה לקבוצה.
     נשמר בנתיב מצב־הלייב הרגיל (tips שב־LIVE_KEY) ומתמזג לפי מזהה אירוע. */
  function addManualTip(i) {
    const p = players[i];
    if (!p) return;
    const res = applyManualTip({ players, tips, name: p.name, amount: tipAmt, aliases: A });
    if (!res.ok) return;
    setPlayers(res.players);
    setTips(res.tips);
    setActionLog((log) =>
      appendAction(log, { t: "tipAdd", name: p.name, event: res.event })
    );
    setTipPickerIdx(null);
    setTipAmt("");
  }
  function deleteManualTip(tipId, { restoreCashout = true } = {}) {
    const res = removeManualTip({ players, tips, tipId, aliases: A, restoreCashout });
    if (!res.ok) return;
    setPlayers(res.players);
    setTips(res.tips);
    setActionLog((log) =>
      appendAction(log, { t: "tipDel", name: res.event.name, event: res.event, cashoutRestored: restoreCashout })
    );
    setTipDelConfirm(null);
  }

  return (
    <div style={{ marginTop: 4 }}>
      <BotToggle on={!!cfg.botOn} onChange={(v) => setConfig({ botOn: v })} />
      {/* הזמנה לקבוצה (תאריך / מיקום / אישורי הגעה) — תמיד זמינה בלייב, לא תלויה בשולחן */}
      <PlanCard
        db={db}
        commit={commit}
        renderRsvps={
          renderRsvps ? (iso) => renderRsvps(iso, handleRsvpRows) : renderRsvps
        }
        onPlanShared={onPlanShared}
      />
      <LivePlayerSetupPanel
        name={name}
        setName={setName}
        addPlayer={addPlayer}
        known={known}
        players={players}
        cps={cps}
        setConfig={setConfig}
      />
      {players.length === 0 ? (
        <Empty text="♠ השולחן מחכה. הוסף שחקן ראשון — כל כניסה מוסיפה לקופה, והג'יטונים מתעדכנים לבד." />
      ) : (
        <>
          <div style={sectionTitle({ marginBottom: 8 })}>
            ♠ שחקנים בשולחן · {players.length}
          </div>
          <LiveBuyinControls
            savings5={savings5}
            onToggleSavings={() => setSavings5((v) => !v)}
            addAmt={addAmt}
            onAddAmt={setAddAmt}
            cps={cps}
          />

          <PokerTable
            players={players}
            cps={cps}
            addAmt={addAmt}
            pot={pot}
            potChips={potChips}
            onSeat={(i) => bump(i, addAmt)}
            startedAt={startedAt}
            elapsed={startedAt ? nowTs - startedAt : 0}
          />

          {livePace && (
            <div style={{ fontSize: 12.5, color: C.dim, textAlign: "center", margin: "6px 0 2px" }}>
              ⏱ קצב הערב: {livePace.actionsPerHour} פעולות לשעה
              {livePace.projectedEnd
                ? ` · סיום משוער ${formatClock(livePace.projectedEnd)}`
                : ""}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {playersView.map(({ p, index: i, group }, rowIdx) => (
              <LivePlayerRow
                key={p.name + ":" + i}
                p={p}
                index={i}
                group={group}
                prevGroup={rowIdx > 0 ? playersView[rowIdx - 1].group : null}
                players={players}
                coupleFills={coupleFills}
                tips={tips}
                aliases={A}
                cps={cps}
                menuIdx={menuIdx}
                setMenuIdx={setMenuIdx}
                tipPickerIdx={tipPickerIdx}
                setTipPickerIdx={setTipPickerIdx}
                tipAmt={tipAmt}
                setTipAmt={setTipAmt}
                tipListName={tipListName}
                setTipListName={setTipListName}
                tipDelConfirm={tipDelConfirm}
                setTipDelConfirm={setTipDelConfirm}
                longPressRef={longPressRef}
                cashoutDraftRef={cashoutDraftRef}
                doCoupleFill={doCoupleFill}
                addManualTip={addManualTip}
                deleteManualTip={deleteManualTip}
                bump={bump}
                addAmt={addAmt}
                rm={rm}
                setField={setField}
                commitCashout={commitCashout}
              />
            ))}
          </div>

          <LivePotPanel
            pot={pot}
            potChips={potChips}
            entriesCount={entriesCount}
            setEntriesCount={setEntriesCount}
            entriesUsed={entriesUsed}
            entriesLeft={entriesLeft}
            bitReport={bitReport}
            waSend={waSend}
            setShare={setShare}
          />
          <LiveRebuysBoard board={rebuyBoard} />

          <label style={{ display: "block", fontSize: 12, color: C.dim, margin: "4px 0 12px" }}>
            🃏 יד הערב (לא חובה — טקסט חופשי, יישמר עם הערב ויופיע בעמוד הערב הציבורי)
            <input
              value={handOfNight}
              onChange={(e) => setHandOfNight(e.target.value)}
              placeholder="למשל: אבי תפס סטרייט פלוש על הריבר"
              style={{ ...inputStyle, marginTop: 4, width: "100%" }}
            />
          </label>

          {savings5 && players.length > 0 && (
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.brass}66`,
                borderRadius: 12,
                padding: 13,
                margin: "0 0 12px",
                fontSize: 13.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🏦 קופת חיסכון מהערב — לאישורך</div>
              <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 8 }}>
                מחושב אוטומטית: {Math.round(savingsPot)}₪ (5% מהקניות). אם השדה ריק — יישמר המחושב.
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  min="0"
                  value={potDraft}
                  onChange={(e) => setPotDraft(e.target.value)}
                  placeholder={String(Math.round(savingsPot))}
                  aria-label="סכום קופה מאושר לערב"
                  style={{ ...inputStyle, width: 110 }}
                />
                <span>₪</span>
                {potDraft.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => setPotDraft("")}
                    style={{
                      fontSize: 11.5,
                      padding: "4px 10px",
                      borderRadius: 7,
                      cursor: "pointer",
                      border: `1px solid ${C.line}`,
                      background: "transparent",
                      color: C.dim,
                      fontFamily: "inherit",
                    }}
                  >
                    אפס למחושב
                  </button>
                )}
              </div>
              {potDraft.trim() !== "" && (
                <div style={{ fontSize: 12.5, color: C.brass, marginTop: 6 }}>
                  יישמר: {effectivePot(savingsPot, potDraft)}₪
                </div>
              )}
            </div>
          )}

          <LiveDistributionPanel
            anyCash={anyCash}
            netSum={netSum}
            cashSumChips={cashSumChips}
            potChips={potChips}
            cps={cps}
            canFinish={canFinish}
            onFinish={saveNight}
            actionLog={actionLog}
            onUndo={undoAction}
            onCancelGame={() => {
              if (confirm("לבטל את המשחק הפעיל? הנתונים שלו יימחקו.")) {
                setPlayers([]);
                setTips([]);
                setCoupleFills([]);
                setActionLog([]);
                setHandOfNight("");
                setPotDraft("");
                setLiveAnnounced([]);
                setPlanSnap(null);
                setMenuIdx(null);
                setTipPickerIdx(null);
                setTipAmt("");
                setTipListName(null);
              }
            }}
          />
        </>
      )}

      {settleBuilder && (
        <SavedSettlementEditor
          db={db} commit={commit} sessionId={settleBuilder.sessionId}
          onClose={() => setSettleBuilder(null)}
        />
      )}

      <LiveShareSheet
        share={share}
        dLbl={dLbl}
        aliases={A}
        onClose={() => setShare(null)}
      />
      <LiveSendPrompt
        prompt={prompt}
        bitReport={bitReport}
        onDismiss={() => setPrompt(null)}
      />
    </div>
  );
}
