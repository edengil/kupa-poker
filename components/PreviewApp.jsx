"use client";

import { useEffect, useState } from "react";
import PokerApp from "./PokerApp";
import { configureStore } from "../lib/store";
import { buildSeedDb } from "./poker/seed";

const PREFIX = "poker:preview:";

export default function PreviewApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const defaults = {
      "poker:db": JSON.stringify(buildSeedDb()),
      "poker:config": JSON.stringify({ chipsPerShekel: 2, defaultBuyin: 50, botOn: false }),
    };
    configureStore({
      get: async (key) => localStorage.getItem(PREFIX + key) ?? defaults[key] ?? null,
      set: async (key, value) => {
        localStorage.setItem(PREFIX + key, value ?? "");
        return true;
      },
    });
    setReady(true);
  }, []);

  return <>
    <div role="status" style={{ padding: 10, textAlign: "center", background: "#D9A441", color: "#0A2B21", fontSize: 13 }}>
      סביבת בדיקה מקומית · השינויים נשמרים בדפדפן בלבד · אין לשלוח הודעות לקבוצה
    </div>
    {ready && <PokerApp />}
  </>;
}
