"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";

/* מאתחל מדידת שימוש אנונימית פעם אחת בטעינת האפליקציה */
export default function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
