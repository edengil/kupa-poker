"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../../lib/store";
import { buildReport, buildSettlement } from "../../lib/report";
import { settle, isCashOnly, transferVerb } from "../../lib/settlement";
import { C } from "./colors";
import { fmt, fmtGap } from "./format";
import { r2, AL, canon, toWhatsApp, waOpen, waSend } from "./helpers";
import { getConfig, onConfig, setConfig, LIVE_KEY } from "./config";
import { brokenRecords } from "./brokenRecords";
import {
  partnerOf,
  applyCoupleFill,
  DEFAULT_FILL_CHIPS,
  fillCountFor,
  canonCoupleName,
  summarizeCoupleFills,
  formatFillBadge,
  shortCoupleName,
} from "./coupleFills";
import { IconBtn, Empty, RoundBtn, inputStyle } from "./ui";
import { ShareSheet } from "./ShareSheet";
import { PlanCard } from "./PlanCard";
import { BotToggle } from "./BotToggle";
import { PokerTable } from "./PokerTable";
import {
  AlertTriangle, CheckCircle2, Plus, Minus, Send, UserPlus, Coins, X,
} from "./icons";
import { brassCta, brassCtaMuted, sectionEyebrow, sectionTitle } from "./festive";

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
  /** שורות לייב ממוינות לפי פעילות בחודשים האחרונים (אינדקס מקורי ל-bump/rm) */
  const playersView = useMemo(() => {
    const aliases = AL(db);
    const { recent, allc } = activity;
    return players
      .map((p, index) => ({ p, index }))
      .sort((a, b) => {
        const na = canon(a.p.name, aliases);
        const nb = canon(b.p.name, aliases);
        return (
          (recent[nb] || 0) - (recent[na] || 0) ||
          (allc[nb] || 0) - (allc[na] || 0) ||
          a.index - b.index
        );
      });
  }, [players, activity, db]);
  const [name, setName] = useState("");
  const [addAmt, setAddAmt] = useState(50);
  const [entriesCount, setEntriesCount] = useState(""); // כניסות שהכנתי (מלאי כולל)
  const [share, setShare] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(null); // חותמת זמן התחלת המשחק
  const [prompt, setPrompt] = useState(null); // הצעה לשלוח עדכון אחרי כניסה
  const [nowTs, setNowTs] = useState(Date.now()); // מתקתק לטיימר החי
  /* טיפים + מילוי זוגי — נשמרים בלייב; מילוי זוגי רק מהאפליקציה (לא בוואטסאפ) */
  const [tips, setTips] = useState([]);
  const [coupleFills, setCoupleFills] = useState([]);
  const [menuIdx, setMenuIdx] = useState(null); // תפריט עדין למילוי זוגי
  const longPressRef = useRef(null);
  /* שדות שהבוט כותב (applied/pending/closing/מחמאות) — נשמרים כדי לא לדרוס אותם */
  const liveMetaRef = useRef({});

  // שחזור משחק פעיל אחרי סגירת האפליקציה
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await store.get(LIVE_KEY);
      if (alive && raw) {
        try {
          const d = JSON.parse(raw);
          if (Array.isArray(d.players)) setPlayers(d.players);
          if (d.entriesCount !== undefined) setEntriesCount(d.entriesCount);
          if (d.addAmt) setAddAmt(d.addAmt);
          if (d.startedAt) setStartedAt(d.startedAt);
          if (Array.isArray(d.tips)) setTips(d.tips);
          if (Array.isArray(d.coupleFills)) setCoupleFills(d.coupleFills);
          liveMetaRef.current = {
            applied: d.applied,
            pending: d.pending,
            closing: d.closing,
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
        startedAt,
        tips,
        coupleFills,
      })
    );
  }, [players, entriesCount, addAmt, startedAt, tips, coupleFills, hydrated]);

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
    nm = nm.trim();
    if (!nm || players.some((p) => p.name === nm)) return;
    setPlayers((p) => {
      if (p.length === 0 && !startedAt) {
        setStartedAt(Date.now());
        // משחק נפתח — הבוט בקבוצה נדלק לבד, והצופים מקבלים התראה
        if (!getConfig().botOn) setConfig({ botOn: true });
        if (typeof onGameStart === "function") onGameStart();
        // ההזמנה לערב כבר התממשה — מסירים כדי שלא יישאר "מחכה לערב"
        if (db.plan) commit({ ...db, plan: null });
      }
      return [
        ...p,
        {
          name: nm,
          buyin: addAmt,
          cashout: "",
        },
      ];
    });
    setName("");
  };
  const GRACE_MS = 10 * 60 * 1000; // 10 דק' חסד בתחילת המשחק — לא מציעים לשלוח
  const bump = (i, amt) => {
    setPlayers((p) =>
      p.map((x, j) =>
        j === i
          ? {
              ...x,
              buyin: Math.max(0, r2((+x.buyin || 0) + amt)),
            }
          : x
      )
    );
    if (amt > 0 && startedAt && Date.now() - startedAt > GRACE_MS) {
      const nm = players[i] && players[i].name;
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
  const rm = (i) => setPlayers((p) => p.filter((_, j) => j !== i));
  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  const potChips = pot * cps;
  const anyCash = players.some((p) => p.cashout !== "");
  const nets = players.map((p) => ({
    name: p.name,
    net: p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0)),
  }));
  const settled = nets.filter((n) => n.net !== null);
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
  function saveNight() {
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
        };
      })
      .filter((e) => e.amount !== 0 || e.chips > 0 || e.tipsGiven > 0);
    if (!entries.length) return;
    const d = now.getDate(),
      mo = now.getMonth() + 1,
      y = now.getFullYear();
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const endedAt = Date.now();
    const rec = {
      id: "live_" + Date.now(),
      iso,
      d,
      mo,
      y,
      entries,
      tips: tips.length ? tips.map(({ name, amount, at }) => ({ name, amount, at })) : undefined,
      coupleFills: coupleFills.length ? coupleFills : undefined,
      startedAt: startedAt || null,
      endedAt,
    };
    const roster = [...new Set([...(db.roster || []), ...players.map((p) => p.name)])];
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
    });
    store.set(LIVE_KEY, "");
    // החלוקה מחושבת כאן ונשמרת לתצוגה מקדימה. היא לא נשלחת לשום מקום
    // עד שתאשר אותה במסך השיתוף.
    const split = buildSettlement(settle(players, cps), {
      now: endedAt,
      isCashOnly,
      transferVerb,
    });
    setShare({
      entries: entries.map(({ name, amount }) => ({ name, amount })),
      d,
      mo,
      final: true,
      startedAt: startedAt || null,
      endedAt,
      settlement: split,
    });
    setPlayers([]);
    setEntriesCount("");
    setStartedAt(null);
    setTips([]);
    setCoupleFills([]);
    setMenuIdx(null);
    // הערב נסגר — הבוט חוזר לישון עד המשחק הבא
    if (getConfig().botOn) setConfig({ botOn: false });
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
    setMenuIdx(null);
  }

  return (
    <div style={{ marginTop: 4 }}>
      <BotToggle on={!!cfg.botOn} onChange={(v) => setConfig({ botOn: v })} />
      {players.length === 0 && (
        <PlanCard db={db} commit={commit} renderRsvps={renderRsvps} onPlanShared={onPlanShared} />
      )}
      <div
        style={{
          background: `linear-gradient(165deg, ${C.cardHi} 0%, ${C.card} 100%)`,
          border: `1px solid ${C.brass}44`,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>♠</span>
          {players.length === 0 ? "פתח ערב חי" : "הוסף לשולחן"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                fontSize: 11.5,
                color: C.dim,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <UserPlus size={13} />
              הוסף שחקן (חדש או קיים)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer(name)}
              placeholder="שם"
              style={{ ...inputStyle, marginTop: 4, width: "100%" }}
            />
          </div>
          <button
            onClick={() => addPlayer(name)}
            style={{
              ...brassCta,
              borderRadius: 9,
              padding: "11px 15px",
            }}
          >
            <Plus size={18} />
          </button>
        </div>
        {known.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 10,
              maxHeight: 88,
              overflowY: "auto",
            }}
          >
            {known
              .filter((k) => !players.some((p) => p.name === k))
              .map((k) => (
                <button
                  key={k}
                  onClick={() => addPlayer(k)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 16,
                    background: C.feltDeep,
                    border: `1px solid ${C.line}`,
                    color: C.cream,
                    cursor: "pointer",
                  }}
                >
                  {k}
                </button>
              ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12.5,
            color: C.dim,
          }}
        >
          <Coins size={14} />
          <span>1 ש&quot;ח = {cps} ג&apos;יטונים</span>
          <div style={{ display: "flex", gap: 5, marginRight: "auto" }}>
            {[2, 4].map((v) => (
              <button
                key={v}
                onClick={() => setConfig({ chipsPerShekel: v })}
                style={{
                  fontSize: 12,
                  padding: "3px 9px",
                  borderRadius: 7,
                  cursor: "pointer",
                  border: "none",
                  fontWeight: cps === v ? 700 : 500,
                  background: cps === v ? C.brass : C.feltDeep,
                  color: cps === v ? C.feltDeep : C.cream,
                }}
              >
                ×{v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {players.length === 0 ? (
        <Empty text="♠ השולחן מחכה. הוסף שחקן ראשון — כל כניסה מוסיפה לקופה, והג'יטונים מתעדכנים לבד." />
      ) : (
        <>
          <div style={sectionTitle({ marginBottom: 8 })}>
            ♠ שחקנים בשולחן · {players.length}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            <span style={{ color: C.dim }}>סכום כניסה:</span>
            {[25, 50, 100].map((u) => (
              <button
                key={u}
                onClick={() => setAddAmt(u)}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: "none",
                  fontWeight: addAmt === u ? 700 : 500,
                  background: addAmt === u ? C.brass : C.card,
                  color: addAmt === u ? C.feltDeep : C.cream,
                }}
              >
                {u}₪
              </button>
            ))}
            <span style={{ color: C.dim, fontSize: 12 }}>
              = {addAmt * cps} ג&apos;יטונים
            </span>
          </div>

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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {playersView.map(({ p, index: i }) => {
              const net =
                p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0));
              const partnerName = partnerOf(p.name);
              const showFill =
                !!partnerName &&
                players.some((q) => canonCoupleName(q.name) === partnerName);
              const fillEvents = fillCountFor(coupleFills, p.name);
              const fillSummaries = showFill ? summarizeCoupleFills(coupleFills, p.name) : [];
              const partnerShort = partnerName ? shortCoupleName(partnerName) : "";
              const meShort = shortCoupleName(p.name);
              return (
                <div
                  key={p.name + ":" + i}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {/* לחיצה ארוכה = מילוי 30 ממני לשותף; לחיצה קצרה = תפריט כיוונים */}
                      <b
                        style={{ fontSize: 15, userSelect: "none", touchAction: "manipulation" }}
                        onPointerDown={() => {
                          if (!showFill) return;
                          longPressRef.current = setTimeout(() => doCoupleFill(p.name), 550);
                        }}
                        onPointerUp={() => {
                          if (longPressRef.current) clearTimeout(longPressRef.current);
                        }}
                        onPointerLeave={() => {
                          if (longPressRef.current) clearTimeout(longPressRef.current);
                        }}
                        onClick={() => {
                          if (!showFill) return;
                          setMenuIdx(menuIdx === i ? null : i);
                        }}
                      >
                        {p.name}
                      </b>
                      {showFill && (
                        <button
                          type="button"
                          title={`${meShort} → ${partnerShort} · ${DEFAULT_FILL_CHIPS}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuIdx(menuIdx === i ? null : i);
                          }}
                          style={{
                            background: "transparent",
                            border: `1px solid ${C.line}`,
                            color: C.dim,
                            borderRadius: 6,
                            fontSize: 11,
                            padding: "2px 6px",
                            cursor: "pointer",
                            opacity: 0.7,
                            fontFamily: "inherit",
                          }}
                        >
                          ↔{fillEvents > 0 ? ` ${fillEvents}×${DEFAULT_FILL_CHIPS}` : ""}
                        </button>
                      )}
                      {menuIdx === i && showFill && (
                        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => doCoupleFill(p.name)}
                            style={{
                              background: C.feltDeep,
                              border: `1px solid ${C.line}`,
                              color: C.cream,
                              borderRadius: 8,
                              fontSize: 11.5,
                              padding: "4px 8px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {meShort} → {partnerShort} · {DEFAULT_FILL_CHIPS}
                          </button>
                          <button
                            type="button"
                            onClick={() => doCoupleFill(partnerName)}
                            style={{
                              background: C.feltDeep,
                              border: `1px solid ${C.line}`,
                              color: C.cream,
                              borderRadius: 8,
                              fontSize: 11.5,
                              padding: "4px 8px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {partnerShort} → {meShort} · {DEFAULT_FILL_CHIPS}
                          </button>
                        </span>
                      )}
                      {fillSummaries.map((row) => (
                        <span
                          key={row.label}
                          style={{ fontSize: 11, color: C.dim, fontVariantNumeric: "tabular-nums" }}
                          title={row.ats?.length ? row.ats.map((t) => formatFillBadge({ ...row, lastAt: t })).join("\n") : undefined}
                        >
                          {formatFillBadge(row)}
                        </span>
                      ))}
                      {(+p.tipsGiven || 0) > 0 && (
                        <span style={{ fontSize: 11, color: C.dim }}>
                          טיפ {p.tipsGiven}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {net !== null && (
                        <b
                          style={{
                            color: net >= 0 ? C.win : C.loss,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(net)}₪
                        </b>
                      )}
                      <IconBtn onClick={() => rm(i)} danger>
                        <X size={14} />
                      </IconBtn>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <RoundBtn onClick={() => bump(i, -addAmt)}>
                        <Minus size={14} />
                      </RoundBtn>
                      <div style={{ textAlign: "center", minWidth: 70 }}>
                        <div
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                            fontSize: 15,
                          }}
                        >
                          {+p.buyin || 0}₪
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: C.dim,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {(+p.buyin || 0) * cps} ג&apos;יטונים
                        </div>
                      </div>
                      <RoundBtn onClick={() => bump(i, addAmt)}>
                        <Plus size={14} />
                      </RoundBtn>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginRight: "auto",
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: C.dim }}>יצא (ג&apos;יטונים)</span>
                      <input
                        value={p.cashout}
                        onChange={(e) =>
                          setField(i, {
                            cashout: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        placeholder="—"
                        style={{
                          ...inputStyle,
                          width: 66,
                          textAlign: "center",
                          padding: "7px 4px",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: 13.5,
              }}
            >
              <span style={{ color: C.dim }}>בקופה</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>
                {pot}₪ · {potChips} ג&apos;יטונים
              </b>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 10,
                alignItems: "flex-end",
              }}
            >
              <label style={{ flex: 1, fontSize: 11.5, color: C.dim }}>
                כניסות שהכנתי
                <input
                  value={entriesCount}
                  onChange={(e) => setEntriesCount(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  style={{
                    ...inputStyle,
                    marginTop: 3,
                    width: "100%",
                    textAlign: "center",
                  }}
                />
              </label>
              <div
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 12.5,
                  color: C.dim,
                  paddingBottom: 9,
                }}
              >
                בשימוש <b style={{ color: C.cream }}>{entriesUsed}</b> · נותרו{" "}
                <b style={{ color: C.brass }}>{entriesLeft === null ? "—" : entriesLeft}</b>{" "}
                בחוץ
              </div>
            </div>
            <button
              onClick={() => waSend(bitReport)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "none",
                fontSize: 14.5,
                fontWeight: 700,
                cursor: "pointer",
                background: "#25D366",
                color: "#06301B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Send size={17} />
              שלח עדכון ביט לוואטסאפ
            </button>
            <button
              onClick={() => setShare({ raw: bitReport })}
              style={{
                width: "100%",
                marginTop: 7,
                padding: 9,
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                background: "transparent",
                color: C.dim,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              תצוגה מקדימה של הדוח
            </button>
          </div>

          {anyCash && (
            <div
              style={{
                marginTop: 10,
                background: C.card,
                border: `1px solid ${netSum === 0 && cashSumChips === potChips ? C.line : C.brass}`,
                borderRadius: 12,
                padding: 13,
                fontSize: 13.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ color: C.dim }}>יצא (ג&apos;יטונים)</span>
                <b
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: cashSumChips === potChips ? C.cream : C.brass,
                  }}
                >
                  {cashSumChips} / {potChips}
                </b>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  color: netSum === 0 && cashSumChips === potChips ? C.win : C.brass,
                  fontWeight: 600,
                }}
              >
                {netSum === 0 && cashSumChips === potChips ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
                {cashSumChips !== potChips
                  ? `הג'יטונים לא תואמים לקופה — פער ${fmtGap(r2((cashSumChips - potChips) / cps))}₪`
                  : netSum === 0
                    ? "מאוזן"
                    : `פער ${fmtGap(netSum)}₪`}
              </div>
            </div>
          )}

          <button
            onClick={saveNight}
            disabled={!settled.length}
            style={{
              ...(settled.length ? brassCta : brassCtaMuted),
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              fontSize: 16,
              cursor: settled.length ? "pointer" : "not-allowed",
            }}
          >
            סיים · שמור · שלח סיכום
          </button>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11.5,
              color: C.dim,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} color={C.win} />
              המשחק נשמר אוטומטית
            </span>
            <button
              onClick={() => {
                if (confirm("לבטל את המשחק הפעיל? הנתונים שלו יימחקו.")) {
                  setPlayers([]);
                  setTips([]);
                  setCoupleFills([]);
                  setMenuIdx(null);
                }
              }}
              style={{
                background: "none",
                border: "none",
                color: C.loss,
                fontSize: 11.5,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              בטל משחק
            </button>
          </div>
        </>
      )}

      {share && (
        <ShareSheet
          title={share.final ? `סיכום פוקר ${share.d}.${share.mo}` : `עדכון ביט ${dLbl}`}
          text={share.raw !== undefined ? share.raw : toWhatsApp(share.entries, share, null, A)}
          settlement={share.settlement}
          onClose={() => setShare(null)}
        />
      )}

      {prompt && (
        <div
          style={{
            position: "fixed",
            bottom: 76,
            left: 12,
            right: 12,
            zIndex: 30,
            maxWidth: 616,
            margin: "0 auto",
            background: C.card,
            border: `1px solid ${C.brass}`,
            borderRadius: 14,
            padding: "11px 13px",
            boxShadow: "0 6px 24px rgba(0,0,0,.5)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {prompt.name} נכנס עוד {prompt.amt}₪
            </div>
            <div style={{ fontSize: 11.5, color: C.dim }}>לשלוח עדכון לקבוצה?</div>
          </div>
          <button
            onClick={() => {
              waOpen(bitReport);
              setPrompt(null);
            }}
            style={{
              flexShrink: 0,
              background: "#25D366",
              color: "#06301B",
              border: "none",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Send size={15} />
            שלח
          </button>
          <button
            onClick={() => setPrompt(null)}
            style={{
              flexShrink: 0,
              background: C.feltDeep,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: 9,
              color: C.dim,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
