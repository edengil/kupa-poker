"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import PokerApp from "./PokerApp";
import LiveNow from "./LiveNow";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeReadOnlyStore } from "../lib/store";
import { subscribeToGroup, fetchSnapshot } from "../lib/realtime";

const C = {
  card: "#15493A",
  line: "#2C6B54",
  brass: "#D9A441",
  dim: "#9DBBAC",
  win: "#5BC38C",
};

export default function PublicApp({ slug, snapshot: initial }) {
  const supabase = getSupabase();

  // מגדירים את האחסון בזמן הרינדור הראשון, לפני שהאפליקציה מנסה לקרוא ממנו
  useState(() => {
    configureStore(makeReadOnlyStore(initial));
    return true;
  });

  const [live, setLive] = useState(initial?.live ?? null);
  const [fresh, setFresh] = useState(false);

  /* ------------------------------------------------------------------
     PokerApp נטען פעם אחת ולא מקשיב לשינויים מבחוץ, אז רענון שלו נעשה
     בהחלפת key — הוא נבנה מחדש וקורא את הנתונים החדשים מהאחסון.
     זה קורה רק כשהטבלה עצמה השתנתה. משחק חי זורם דרך LiveNow בלי לגעת בו,
     אחרת כל עדכון היה מחזיר את הצופה לטאב הראשון.
     ------------------------------------------------------------------ */
  const [generation, setGeneration] = useState(0);
  const dataRef = useRef(JSON.stringify(initial?.data ?? null));

  const refresh = useCallback(async () => {
    const next = await fetchSnapshot(supabase, slug);
    if (!next) return;

    setLive(next.live ?? null);

    const serialized = JSON.stringify(next.data ?? null);
    if (serialized !== dataRef.current) {
      dataRef.current = serialized;
      configureStore(makeReadOnlyStore(next));
      setGeneration((g) => g + 1);
    }

    setFresh(true);
    setTimeout(() => setFresh(false), 2500);
  }, [supabase, slug]);

  useEffect(() => subscribeToGroup(supabase, slug, refresh), [supabase, slug, refresh]);

  // חזרה למסך אחרי שהיה ברקע — משלימים מה שהוחמץ
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <>
      <div style={{ background: C.card, borderBottom: `1px solid ${C.line}`, padding: "9px 13px" }}>
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontSize: 13,
            color: fresh ? C.win : C.dim,
            transition: "color .3s",
          }}
        >
          <span style={{ color: fresh ? C.win : C.brass }}>♠</span>
          <span>{fresh ? "עודכן" : "צפייה בלבד · מתעדכן לבד"}</span>
        </div>
      </div>

      {live?.players?.length > 0 && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 13px" }}>
          <LiveNow live={live} />
        </div>
      )}

      <PokerApp key={generation} readOnly />
    </>
  );
}
