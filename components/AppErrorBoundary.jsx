"use client";

/* ============================================================================
   Error Boundary סביב PokerApp — חלק מבילד האבחון הזמני (fix/diag-capture).

   עד היום שגיאת רינדור ב־PokerApp הפילה את כל הדף בלי להשאיר עקבות.
   כאן: השגיאה נשלחת ל־/api/diag (componentDidCatch) והמשתמש רואה מסך
   שגיאה עם כפתור ניסיון חוזר במקום מסך שחור/לבן מת.
   ============================================================================ */

import React from "react";
import { reportDiag } from "../lib/diagReport";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportDiag("boundary", error, {
      componentStack: String(info?.componentStack || "").slice(0, 1000),
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          color: "#F3E9D2",
        }}
      >
        <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
          משהו נשבר בטעינה — השגיאה נשלחה לאבחון
        </p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          style={{
            background: "#D9A441",
            color: "#0A2B21",
            border: "none",
            borderRadius: 10,
            padding: "11px 26px",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          נסה שוב
        </button>
      </main>
    );
  }
}
