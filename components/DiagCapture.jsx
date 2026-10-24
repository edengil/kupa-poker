"use client";

/* ============================================================================
   לוכד שגיאות גלובלי — חלק מבילד האבחון הזמני (fix/diag-capture).

   מותקן מוקדם ככל האפשר: ההתקנה רצה כבר בטעינת המודול (לפני ההידרציה),
   וה־useEffect הוא גיבוי בלבד. לוכד window.onerror, הבטחות שנדחו בלי
   טיפול, וקריאות console.error — ושולח הכול ל־/api/diag דרך reportDiag
   (שם גם מגבלת 5 השליחות לטעינה, שמגינה מלולאות).
   ============================================================================ */

import { useEffect } from "react";
import { reportDiag } from "../lib/diagReport";

let installed = false;

function describeArg(a) {
  if (a instanceof Error) return a.message;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export function installDiagCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportDiag("error", event.error || new Error(event.message || "unknown error"));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportDiag("unhandledrejection", reason instanceof Error ? reason : new Error(describeArg(reason)));
  });

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    try {
      const errArg = args.find((a) => a instanceof Error);
      reportDiag("console.error", errArg || new Error(args.map(describeArg).join(" ").slice(0, 1000)));
    } catch {
      /* לעולם לא לשבור את הלוג המקורי */
    }
    originalError(...args);
  };
}

/* התקנה בטעינת המודול — לפני שהאפליקציה עולה, כדי לתפוס גם שגיאות הידרציה */
installDiagCapture();

export default function DiagCapture() {
  useEffect(() => {
    installDiagCapture();
  }, []);
  return null;
}
