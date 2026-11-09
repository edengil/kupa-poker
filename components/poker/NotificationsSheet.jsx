"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "@/lib/poker/colors";
import { brassCta } from "@/lib/poker/festive";
import { X } from "./icons";

/**
 * רשימת ההתראות. סימון העברה נשמר באותו אובייקט payments.
 * גל 5, פריט 5.2: המגירה מדווחת ל־onVisible אילו פריטים הוצגו בפועל
 * (נכנסו לאזור הגלילה הנראה) — רק הם מסומנים "נצפה" אצל ההורה, כך
 * שפתיחה חלקית של רשימה ארוכה משאירה באדג' על מה שלא נראה.
 */
export function NotificationsSheet({ items, onClose, onMark, onVisible }) {
  const [busyId, setBusyId] = useState(null);
  const list = items || [];
  const scrollRef = useRef(null);
  const nodesRef = useRef(new Map());
  const reportedRef = useRef(new Set());

  const reportVisible = useCallback(
    (ids) => {
      if (!onVisible) return;
      const fresh = (ids || []).filter(
        (id) => typeof id === "string" && !reportedRef.current.has(id)
      );
      if (!fresh.length) return;
      for (const id of fresh) reportedRef.current.add(id);
      onVisible(fresh);
    },
    [onVisible]
  );

  useEffect(() => {
    if (!onVisible) return;
    /* בלי IntersectionObserver (דפדפן ישן/סביבת בדיקה) — כל מה שנרנדר
       נחשב מוצג, כמו ההתנהגות הישנה. */
    if (typeof IntersectionObserver === "undefined") {
      reportVisible(list.map((item) => item.id));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-notice-id");
          if (id) reportVisible([id]);
          observer.unobserve(entry.target);
        }
      },
      { root: scrollRef.current, threshold: 0.6 }
    );
    for (const node of nodesRef.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [list, onVisible, reportVisible]);

  async function mark(item) {
    if (!onMark || busyId) return;
    setBusyId(item.id);
    try {
      await onMark(item);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      data-testid="notifications-sheet"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        ref={scrollRef}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "78vh",
          overflow: "auto",
          background: C.card,
          border: `1px solid ${C.brass}`,
          borderRadius: 16,
          padding: 16,
          color: C.cream,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div id="notifications-title" style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>
            התראות
          </div>
          <button
            type="button"
            aria-label="סגור"
            data-testid="notifications-close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: C.dim,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
          מייל יוצא רק אחרי שלוש כניסות בלי טיפול, פעם אחת לאותו פריט.
        </p>
        {list.length === 0 ? (
          <p data-testid="notifications-empty" style={{ margin: 0, color: C.dim }}>
            אין התראות פתוחות.
          </p>
        ) : (
          list.map((item) => (
            <article
              key={item.id}
              data-testid={`notice-${item.kind}`}
              data-notice-id={item.id}
              ref={(node) => {
                if (node) nodesRef.current.set(item.id, node);
                else nodesRef.current.delete(item.id);
              }}
              style={{
                borderTop: `1px solid ${C.line}`,
                padding: "12px 0",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{item.title}</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.45 }}>{item.body}</div>
              {item.actorRole ? (
                <div style={{ marginTop: 6, fontSize: 13, color: C.brass }}>
                  מי שצריך לפעול: {item.actorRole} · {item.actorName}
                </div>
              ) : null}
              {item.canMark ? (
                <button
                  type="button"
                  data-testid={`notice-mark-${item.action}`}
                  disabled={busyId === item.id}
                  onClick={() => mark(item)}
                  style={{ ...brassCta, marginTop: 10, borderRadius: 10, padding: "8px 14px", fontWeight: 800, cursor: "pointer" }}
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
