"use client";

import React, { useEffect, useState } from "react";

/* ============================================================================
   כפתור "התקן אפליקציה".

   בכרום/אנדרואיד/דסקטופ: תופס את אירוע beforeinstallprompt ומציג כפתור
   שמפעיל את חלון ההתקנה של הדפדפן. באייפון (ספארי לא תומך באירוע) מציג
   הסבר קצר של "שתף ← הוסף למסך הבית". אם כבר מותקן (standalone) — לא מוצג.

   הרכיב גם רושם את ה-service worker (שמשמש להתראות ואין בו שום cache), כדי
   שהדפדפן יכיר באתר כניתן להתקנה.
   ============================================================================ */

const C = {
  feltDeep: "#0A2B21",
  card: "#15493A",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
};

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);

const isIOS = () =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");

export default function InstallButton() {
  const [deferred, setDeferred] = useState(null);
  // idle: אין עדיין תמיכה ידועה · ready: אפשר להתקין · ios: הסבר לאייפון · hidden: מותקן/הותקן
  const [state, setState] = useState("idle");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setState("hidden");
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setState("ready");
    };
    const onInstalled = () => setState("hidden");

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // ספארי באייפון לא יורה beforeinstallprompt — נציג הסבר ידני
    if (isIOS()) setState("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "idle" || state === "hidden") return null;

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {}
    setDeferred(null);
    setState("hidden");
  };

  const label = state === "ios" ? "📲 התקן את האפליקציה בטלפון" : "📲 התקן אפליקציה";
  const onClick = state === "ios" ? () => setShowHelp((v) => !v) : install;

  return (
    <div style={{ margin: "8px 0 0" }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 11,
          border: `1px solid ${C.brass}`,
          background: "transparent",
          color: C.brass,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        {label}
      </button>
      {state === "ios" && showHelp && (
        <p
          style={{
            margin: "8px 2px 0",
            fontSize: 12.5,
            lineHeight: 1.7,
            color: C.dim,
            textAlign: "center",
          }}
        >
          פתח את תפריט השיתוף של ספארי (הריבוע עם החץ למעלה), גלול ובחר
          <b style={{ color: C.cream }}> „הוסף למסך הבית“</b>. תיפתח כמו אפליקציה רגילה.
        </p>
      )}
    </div>
  );
}
