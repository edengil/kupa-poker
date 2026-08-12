"use client";

import React, { useEffect, useMemo, useState } from "react";
import { store } from "../../lib/store";
import { buildReport, buildSettlement } from "../../lib/report";
import { settle, isCashOnly, transferVerb } from "../../lib/settlement";
import { C } from "./colors";
import { fmt } from "./format";
import { r2, AL, canon, toWhatsApp, waOpen, waSend } from "./helpers";
import { getConfig, onConfig, setConfig, LIVE_KEY } from "./config";
import { brokenRecords } from "./brokenRecords";
import { IconBtn, Empty, RoundBtn, inputStyle } from "./ui";
import { ShareSheet } from "./ShareSheet";
import { PlanCard } from "./PlanCard";
import { BotToggle } from "./BotToggle";
import { PokerTable } from "./PokerTable";
import {
  AlertTriangle, CheckCircle2, Plus, Minus, Send, UserPlus, Coins, X,
} from "./icons";

/* טאב לייב — חולץ מ-PokerApp.jsx. */
export function LiveTab({
  db,
  commit,
  onGameStart,
  renderRsvps,
  onRecords,
  onPlanShared
}) {
  const A = AL(db);
  const known = useMemo(() => {
    const dates = db.sessions.map(s => s.iso).sort();
    const latest = dates.length ? dates[dates.length - 1] : null;
    // חלון "החודשים האחרונים": ~100 ימים אחורה מהערב האחרון
    const cutoff = latest ? new Date(new Date(latest).getTime() - 100 * 864e5).toISOString().slice(0, 10) : "0000-00-00";
    const recent = {},
      allc = {};
    for (const s of db.sessions) {
      const seen = new Set();
      for (const e of s.entries) {
        const n = canon(e.name, A);
        if (seen.has(n)) continue;
        seen.add(n);
        allc[n] = (allc[n] || 0) + 1;
        if (s.iso >= cutoff) recent[n] = (recent[n] || 0) + 1;
      }
    }
    const names = new Set(Object.keys(allc));
    (db.roster || []).forEach(n => names.add(canon(n, A)));
    // הכי פעילים לאחרונה קודם, אחר כך לפי סה"כ, ואז א"ב
    return [...names].sort((a, b) => (recent[b] || 0) - (recent[a] || 0) || (allc[b] || 0) - (allc[a] || 0) || a.localeCompare(b, "he"));
  }, [db]);
  const [cfg, setCfg] = useState(getConfig());
  useEffect(() => onConfig(setCfg), []);
  const cps = cfg.chipsPerShekel || 2;
  const [players, setPlayers] = useState([]); // {name, buyin(₪), cashout(chips string)}
  const [name, setName] = useState("");
  const [addAmt, setAddAmt] = useState(50);
  const [entriesCount, setEntriesCount] = useState(""); // כניסות שהכנתי (מלאי כולל)
  const [share, setShare] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(null); // חותמת זמן התחלת המשחק
  const [prompt, setPrompt] = useState(null); // הצעה לשלוח עדכון אחרי כניסה
  const [nowTs, setNowTs] = useState(Date.now()); // מתקתק לטיימר החי

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
    store.set(LIVE_KEY, JSON.stringify({
      players,
      entriesCount,
      addAmt,
      startedAt,
      ts: Date.now()
    }));
  }, [players, entriesCount, addAmt, startedAt, hydrated]);

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
  const addPlayer = nm => {
    nm = nm.trim();
    if (!nm || players.some(p => p.name === nm)) return;
    setPlayers(p => {
      if (p.length === 0 && !startedAt) {
        setStartedAt(Date.now());
        // משחק נפתח — הבוט בקבוצה נדלק לבד, והצופים מקבלים התראה
        if (!getConfig().botOn) setConfig({ botOn: true });
        if (typeof onGameStart === "function") onGameStart();
      }
      return [...p, {
        name: nm,
        buyin: addAmt,
        cashout: ""
      }];
    });
    setName("");
  };
  const GRACE_MS = 10 * 60 * 1000; // 10 דק' חסד בתחילת המשחק — לא מציעים לשלוח
  const bump = (i, amt) => {
    setPlayers(p => p.map((x, j) => j === i ? {
      ...x,
      buyin: Math.max(0, r2((+x.buyin || 0) + amt))
    } : x));
    if (amt > 0 && startedAt && Date.now() - startedAt > GRACE_MS) {
      const nm = players[i] && players[i].name;
      setPrompt({
        name: nm,
        amt,
        id: Date.now()
      });
    }
  };
  const setField = (i, patch) => setPlayers(p => p.map((x, j) => j === i ? {
    ...x,
    ...patch
  } : x));
  const rm = i => setPlayers(p => p.filter((_, j) => j !== i));
  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  const potChips = pot * cps;
  const anyCash = players.some(p => p.cashout !== "");
  const nets = players.map(p => ({
    name: p.name,
    net: p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0))
  }));
  const settled = nets.filter(n => n.net !== null);
  const netSum = r2(settled.reduce((s, n) => s + n.net, 0));
  const cashSumChips = players.reduce((s, p) => s + (p.cashout === "" ? 0 : +p.cashout || 0), 0);

  // מונה כניסות: כניסה אחת = 50₪. בשימוש = הקופה חלקי 50. נותרו = שהכנתי פחות בשימוש.
  const ENTRY = 50;
  const entriesUsed = r2(pot / ENTRY);
  const entriesPrepared = entriesCount === "" ? null : +entriesCount || 0;
  const entriesLeft = entriesPrepared === null ? null : r2(entriesPrepared - entriesUsed);

  // דוח ביט מתעדכן — בפורמט הקבוצה
  // אותו מפרמט בדיוק שהבוט בוואטסאפ משתמש בו — כדי ששני הטקסטים לא יתפצלו
  const bitReport = useMemo(() => buildReport({
    players,
    entriesCount,
    startedAt,
    now: nowTs,
    cps
  }), [players, entriesCount, startedAt, nowTs, cps]);
  function saveNight() {
    const entries = nets.filter(n => n.net !== null && n.net !== 0).map(n => ({
      name: n.name,
      amount: n.net
    }));
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
      startedAt: startedAt || null,
      endedAt
    };
    const roster = [...new Set([...(db.roster || []), ...players.map(p => p.name)])];
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
      roster
    });
    store.set(LIVE_KEY, "");
    // החלוקה מחושבת כאן ונשמרת לתצוגה מקדימה. היא לא נשלחת לשום מקום
    // עד שתאשר אותה במסך השיתוף.
    const split = buildSettlement(settle(players, cps), {
      now: endedAt,
      isCashOnly,
      transferVerb
    });
    setShare({
      entries,
      d,
      mo,
      final: true,
      startedAt: startedAt || null,
      endedAt,
      settlement: split
    });
    setPlayers([]);
    setEntriesCount("");
    setStartedAt(null);
    setOutCount("");
    // הערב נסגר — הבוט חוזר לישון עד המשחק הבא
    if (getConfig().botOn) setConfig({ botOn: false });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(BotToggle, {
    on: !!cfg.botOn,
    onChange: v => setConfig({
      botOn: v
    })
  }), players.length === 0 && /*#__PURE__*/React.createElement(PlanCard, {
    db: db,
    commit: commit,
    renderRsvps: renderRsvps,
    onPlanShared: onPlanShared
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11.5,
      color: C.dim,
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(UserPlus, {
    size: 13
  }), "\u05D4\u05D5\u05E1\u05E3 \u05E9\u05D7\u05E7\u05DF (\u05D7\u05D3\u05E9 \u05D0\u05D5 \u05E7\u05D9\u05D9\u05DD)"), /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    onKeyDown: e => e.key === "Enter" && addPlayer(name),
    placeholder: "\u05E9\u05DD",
    style: {
      ...inputStyle,
      marginTop: 4,
      width: "100%"
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => addPlayer(name),
    style: {
      background: C.brass,
      color: C.feltDeep,
      border: "none",
      borderRadius: 9,
      padding: "11px 15px",
      fontWeight: 700,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 18
  }))), known.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 10,
      maxHeight: 88,
      overflowY: "auto"
    }
  }, known.filter(k => !players.some(p => p.name === k)).map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => addPlayer(k),
    style: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 16,
      background: C.feltDeep,
      border: `1px solid ${C.line}`,
      color: C.cream,
      cursor: "pointer"
    }
  }, k))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      fontSize: 12.5,
      color: C.dim
    }
  }, /*#__PURE__*/React.createElement(Coins, {
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "1 \u05E9\"\u05D7 = ", cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      marginRight: "auto"
    }
  }, [2, 4].map(v => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setConfig({
      chipsPerShekel: v
    }),
    style: {
      fontSize: 12,
      padding: "3px 9px",
      borderRadius: 7,
      cursor: "pointer",
      border: "none",
      fontWeight: cps === v ? 700 : 500,
      background: cps === v ? C.brass : C.feltDeep,
      color: cps === v ? C.feltDeep : C.cream
    }
  }, "\xD7", v))))), players.length === 0 ? /*#__PURE__*/React.createElement(Empty, {
    text: "\u05D4\u05D5\u05E1\u05E3 \u05E9\u05D7\u05E7\u05E0\u05D9\u05DD \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05E2\u05E8\u05D1 \u05D7\u05D9. \u05DB\u05DC \u05DB\u05E0\u05D9\u05E1\u05D4 \u05DE\u05D5\u05E1\u05D9\u05E4\u05D4 \u05DB\u05E1\u05E3 \u05DC\u05E7\u05D5\u05E4\u05D4, \u05D5\u05D4\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD \u05DE\u05EA\u05E2\u05D3\u05DB\u05E0\u05D9\u05DD \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA."
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05E1\u05DB\u05D5\u05DD \u05DB\u05E0\u05D9\u05E1\u05D4:"), [25, 50, 100].map(u => /*#__PURE__*/React.createElement("button", {
    key: u,
    onClick: () => setAddAmt(u),
    style: {
      fontSize: 13,
      padding: "6px 12px",
      borderRadius: 8,
      cursor: "pointer",
      border: "none",
      fontWeight: addAmt === u ? 700 : 500,
      background: addAmt === u ? C.brass : C.card,
      color: addAmt === u ? C.feltDeep : C.cream
    }
  }, u, "\u20AA")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim,
      fontSize: 12
    }
  }, "= ", addAmt * cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement(PokerTable, {
    players: players,
    cps: cps,
    addAmt: addAmt,
    pot: pot,
    potChips: potChips,
    onSeat: i => bump(i, addAmt),
    startedAt: startedAt,
    elapsed: startedAt ? nowTs - startedAt : 0
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, players.map((p, i) => {
    const net = p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: "10px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 15
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, net !== null && /*#__PURE__*/React.createElement("b", {
      style: {
        color: net >= 0 ? C.win : C.loss,
        fontVariantNumeric: "tabular-nums"
      }
    }, fmt(net), "\u20AA"), /*#__PURE__*/React.createElement(IconBtn, {
      onClick: () => rm(i),
      danger: true
    }, /*#__PURE__*/React.createElement(X, {
      size: 14
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(RoundBtn, {
      onClick: () => bump(i, -addAmt)
    }, /*#__PURE__*/React.createElement(Minus, {
      size: 14
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        minWidth: 70
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        fontSize: 15
      }
    }, +p.buyin || 0, "\u20AA"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: C.dim,
        fontVariantNumeric: "tabular-nums"
      }
    }, (+p.buyin || 0) * cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement(RoundBtn, {
      onClick: () => bump(i, addAmt)
    }, /*#__PURE__*/React.createElement(Plus, {
      size: 14
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginRight: "auto"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: C.dim
      }
    }, "\u05D9\u05E6\u05D0 (\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD)"), /*#__PURE__*/React.createElement("input", {
      value: p.cashout,
      onChange: e => setField(i, {
        cashout: e.target.value.replace(/\D/g, "")
      }),
      placeholder: "\u2014",
      style: {
        ...inputStyle,
        width: 66,
        textAlign: "center",
        padding: "7px 4px"
      }
    }))));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8,
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05D1\u05E7\u05D5\u05E4\u05D4"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontVariantNumeric: "tabular-nums"
    }
  }, pot, "\u20AA \xB7 ", potChips, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      flex: 1,
      fontSize: 11.5,
      color: C.dim
    }
  }, "\u05DB\u05E0\u05D9\u05E1\u05D5\u05EA \u05E9\u05D4\u05DB\u05E0\u05EA\u05D9", /*#__PURE__*/React.createElement("input", {
    value: entriesCount,
    onChange: e => setEntriesCount(e.target.value.replace(/\D/g, "")),
    placeholder: "0",
    style: {
      ...inputStyle,
      marginTop: 3,
      width: "100%",
      textAlign: "center"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: "center",
      fontSize: 12.5,
      color: C.dim,
      paddingBottom: 9
    }
  }, "\u05D1\u05E9\u05D9\u05DE\u05D5\u05E9 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.cream
    }
  }, entriesUsed), " \xB7 \u05E0\u05D5\u05EA\u05E8\u05D5 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.brass
    }
  }, entriesLeft === null ? "—" : entriesLeft), " \u05D1\u05D7\u05D5\u05E5")), /*#__PURE__*/React.createElement("button", {
    onClick: () => waSend(bitReport),
    style: {
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
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Send, {
    size: 17
  }), "\u05E9\u05DC\u05D7 \u05E2\u05D3\u05DB\u05D5\u05DF \u05D1\u05D9\u05D8 \u05DC\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShare({
      raw: bitReport
    }),
    style: {
      width: "100%",
      marginTop: 7,
      padding: 9,
      borderRadius: 10,
      border: `1px solid ${C.line}`,
      background: "transparent",
      color: C.dim,
      fontSize: 12.5,
      cursor: "pointer"
    }
  }, "\u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4 \u05E9\u05DC \u05D4\u05D3\u05D5\u05D7")), anyCash && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      background: C.card,
      border: `1px solid ${netSum === 0 && cashSumChips === potChips ? C.line : C.brass}`,
      borderRadius: 12,
      padding: 13,
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05D9\u05E6\u05D0 (\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD)"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontVariantNumeric: "tabular-nums",
      color: cashSumChips === potChips ? C.cream : C.brass
    }
  }, cashSumChips, " / ", potChips)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      color: netSum === 0 && cashSumChips === potChips ? C.win : C.brass,
      fontWeight: 600
    }
  }, netSum === 0 && cashSumChips === potChips ? /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 16
  }) : /*#__PURE__*/React.createElement(AlertTriangle, {
    size: 16
  }), cashSumChips !== potChips ? `הג'יטונים לא תואמים לקופה — פער ${fmt(r2((cashSumChips - potChips) / cps))}₪` : netSum === 0 ? "מאוזן" : `פער ${fmt(netSum)}₪`)), /*#__PURE__*/React.createElement("button", {
    onClick: saveNight,
    disabled: !settled.length,
    style: {
      width: "100%",
      marginTop: 12,
      padding: 14,
      borderRadius: 12,
      border: "none",
      fontSize: 16,
      fontWeight: 700,
      cursor: settled.length ? "pointer" : "not-allowed",
      background: settled.length ? C.brass : C.card,
      color: settled.length ? C.feltDeep : C.dim
    }
  }, "\u05E1\u05D9\u05D9\u05DD \xB7 \u05E9\u05DE\u05D5\u05E8 \xB7 \u05E9\u05DC\u05D7 \u05E1\u05D9\u05DB\u05D5\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 11.5,
      color: C.dim
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 13,
    color: C.win
  }), "\u05D4\u05DE\u05E9\u05D7\u05E7 \u05E0\u05E9\u05DE\u05E8 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (confirm("לבטל את המשחק הפעיל? הנתונים שלו יימחקו.")) setPlayers([]);
    },
    style: {
      background: "none",
      border: "none",
      color: C.loss,
      fontSize: 11.5,
      cursor: "pointer",
      textDecoration: "underline",
      fontFamily: "inherit"
    }
  }, "\u05D1\u05D8\u05DC \u05DE\u05E9\u05D7\u05E7"))), share && /*#__PURE__*/React.createElement(ShareSheet, {
    title: share.final ? `סיכום פוקר ${share.d}.${share.mo}` : `עדכון ביט ${dLbl}`,
    text: share.raw !== undefined ? share.raw : toWhatsApp(share.entries, share, null, A),
    settlement: share.settlement,
    onClose: () => setShare(null)
  }), prompt && /*#__PURE__*/React.createElement("div", {
    style: {
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
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, prompt.name, " \u05E0\u05DB\u05E0\u05E1 \u05E2\u05D5\u05D3 ", prompt.amt, "\u20AA"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: C.dim
    }
  }, "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05E2\u05D3\u05DB\u05D5\u05DF \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4?")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      waOpen(bitReport);
      setPrompt(null);
    },
    style: {
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
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Send, {
    size: 15
  }), "\u05E9\u05DC\u05D7"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPrompt(null),
    style: {
      flexShrink: 0,
      background: C.feltDeep,
      border: `1px solid ${C.line}`,
      borderRadius: 10,
      padding: 9,
      color: C.dim,
      cursor: "pointer",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement(X, {
    size: 15
  }))));
}
