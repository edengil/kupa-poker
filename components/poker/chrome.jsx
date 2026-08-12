"use client";

import React from "react";
import { EGMark } from "../Logo";
import { C } from "./colors";
import { fmt } from "./format";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  PlayCircle,
  Trophy,
  Users,
} from "./icons";

/* ============================================================================
   מעטפת האפליקציה: כותרת, סרגל טאבים, מד איזון, סגנונות גלובליים.
   חולצו מ-PokerApp.jsx כחלק מריענון הדרגתי — התנהגות ועיצוב זהים.
   ============================================================================ */

export function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 4px 12px",
      }}
    >
      <EGMark size={42} />
      <div style={{ flex: 1 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 23,
            fontWeight: 800,
            letterSpacing: "-.5px",
          }}
        >
          קופה — פוקר
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: C.dim }}>
          מאזן חי · שיתוף בווטסאפ
        </p>
      </div>
    </header>
  );
}

export function TabBar({ tab, setTab, n, readOnly = false, hasStats = false }) {
  const WRITE_TABS = ["live", "input", "sessions"];
  const items = [
    ["table", "טבלה", BarChart3],
    ["players", "שחקנים", Users],
    ["records", "שיאים", Trophy],
    ["live", "לייב", PlayCircle],
    ["input", "הזנה", ClipboardPaste],
    ["sessions", "ערבים", CalendarDays],
    ...(hasStats ? [["stats", "צפיות", Eye]] : []),
  ].filter(([id]) => !readOnly || !WRITE_TABS.includes(id));

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: C.card,
        borderTop: `1px solid ${C.line}`,
        display: "flex",
        padding: "6px 8px calc(10px + env(safe-area-inset-bottom))",
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          flex: 1,
          gap: 2,
        }}
      >
        {items.map(([id, label, Icon]) => {
          const on = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "7px 2px",
                borderRadius: 11,
                border: "none",
                cursor: "pointer",
                background: on ? C.brass : "transparent",
                color: on ? C.feltDeep : C.dim,
                fontWeight: on ? 700 : 500,
                fontSize: 11,
              }}
            >
              <Icon size={19} />
              <span>
                {label}
                {id === "sessions" && n ? ` ${n}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** מד איזון מגיע/חייב בהזנת ערב. */
export function BalanceMeter({ bal }) {
  const { pos, neg, gap } = bal;
  const total = Math.max(pos, neg, 1);
  const ok = gap === 0;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${ok ? C.line : C.brass}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 8,
        }}
      >
        <span style={{ color: C.win }}>
          מגיע{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            {pos.toLocaleString()}
          </b>
        </span>
        <span style={{ color: C.loss }}>
          חייב{" "}
          <b style={{ fontVariantNumeric: "tabular-nums" }}>
            {neg.toLocaleString()}
          </b>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 6,
          overflow: "hidden",
          background: C.feltDeep,
        }}
      >
        <div style={{ width: `${(pos / total) * 50}%`, background: C.win }} />
        <div
          style={{
            width: `${(neg / total) * 50}%`,
            background: C.loss,
            marginRight: "auto",
          }}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13.5,
          fontWeight: 600,
          color: ok ? C.win : C.brass,
        }}
      >
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        {ok
          ? "הערב סגור מדויק"
          : `פער ${fmt(gap)} (${gap > 0 ? "עודף מגיע" : "עודף חייב"})`}
      </div>
    </div>
  );
}

/** סגנונות גלובליים של האפליקציה (פונט, פוקוס, סקרולבר). */
export function Style() {
  // dangerouslySetInnerHTML — כמו ב-layout: מונע הבדלי encoding של מרכאות ב-hydration
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;}
    textarea::placeholder,input::placeholder{color:${C.dim};opacity:.7;}
    button:focus-visible,textarea:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid ${C.brass};outline-offset:2px;}
    textarea:focus,input:focus,select:focus{border-color:${C.brass};}
    ::-webkit-scrollbar{width:8px;height:6px;}
    ::-webkit-scrollbar-thumb{background:${C.line};border-radius:8px;}
    .hscroll::-webkit-scrollbar{height:5px;}
    option{background:${C.feltDeep};color:${C.cream};}
    @media (prefers-reduced-motion:reduce){*{transition:none!important;}}
  `,
      }}
    />
  );
}
