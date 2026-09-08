"use client";

import { useEffect, useState } from "react";
import PokerApp from "./PokerApp";
import { configureStore } from "../lib/store";
import { buildSeedDb } from "./poker/seed";

const PREFIX = "poker:preview:";

/**
 * סביבת בדיקה מקומית.
 * ?failFlush=1 — set מצליח מקומית אבל flush נכשל (סימולציית ניתוק מהשרת).
 */
export default function PreviewApp({ failFlush = false }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const defaults = {
      "poker:db": JSON.stringify(buildSeedDb()),
      "poker:config": JSON.stringify({ chipsPerShekel: 2, defaultBuyin: 50, botOn: false }),
    };
    let pending = false;
    configureStore({
      get: async (key) => localStorage.getItem(PREFIX + key) ?? defaults[key] ?? null,
      set: async (key, value) => {
        localStorage.setItem(PREFIX + key, value ?? "");
        if (failFlush) pending = true;
        return true;
      },
      flush: async () => {
        if (failFlush) {
          pending = true;
          return false;
        }
        pending = false;
        return true;
      },
      hasPending: () => pending,
    });
    setReady(true);
  }, [failFlush]);

  return (
    <>
      <div
        role="status"
        data-testid="preview-banner"
        style={{ padding: 10, textAlign: "center", background: "#D9A441", color: "#0A2B21", fontSize: 13 }}
      >
        סביבת בדיקה מקומית · השינויים נשמרים בדפדפן בלבד · אין לשלוח הודעות לקבוצה
        {failFlush ? " · סימולציית כשל שמירה לשרת" : ""}
      </div>
      {ready && <PokerApp />}
    </>
  );
}
