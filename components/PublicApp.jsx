"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import PokerApp, { PokerTable } from "./PokerApp";
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

// גיבוי ל-WebSocket. בטלפון הערוץ נופל כשהמסך ננעל או שעוברים אפליקציה,
// ולא תמיד מתאושש — בלי הסקר הזה הצופים היו נתקעים על תמונה ישנה.
const POLL_MS = 12000;

export default function PublicApp({ slug, snapshot: initial }) {
  const supabase = getSupabase();

  // מגדירים את האחסון בזמן הרינדור הראשון, לפני שהאפליקציה מנסה לקרוא ממנו
  useState(() => {
    configureStore(makeReadOnlyStore(initial));
    return true;
  });

  const [live, setLive] = useState(initial?.live ?? null);
  const [fresh, setFresh] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* ------------------------------------------------------------------
     PokerApp נטען פעם אחת ולא מקשיב לשינויים מבחוץ, אז רענון שלו נעשה
     בהחלפת key. זה קורה רק כשהטבלה עצמה השתנתה — משחק חי זורם דרך
     הפאנל למעלה בלי לגעת בו, אחרת כל עדכון היה מחזיר את הצופה לטאב הראשון.
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
      setFresh(true);
      setTimeout(() => setFresh(false), 2500);
    }
  }, [supabase, slug]);

  // ערוץ השידור — עדכון מיידי כשהוא חי
  useEffect(() => subscribeToGroup(supabase, slug, refresh), [supabase, slug, refresh]);

  // סקר תקופתי — רץ רק כשהמסך גלוי, כדי לא לבזבז סוללה ברקע
  useEffect(() => {
    let timer = null;
    const start = () => {
      stop();
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh(); // משלימים מיד את מה שהוחמץ ברקע
        start();
      } else {
        stop();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // שעון לטיימר של המשחק החי
  useEffect(() => {
    if (!live?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [live?.startedAt]);

  const running = live?.players?.length > 0;
  const pot = running ? live.players.reduce((s, p) => s + (+p.buyin || 0), 0) : 0;
  const cps = 2; // 50₪ = 100 צ'יפים

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

      {running && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "13px 13px 0" }}>
          <h2 style={{ margin: "0 2px 9px", fontSize: 15, fontWeight: 700, color: C.brass }}>
            ♠ משחק עכשיו
          </h2>
          <PokerTable
            players={live.players}
            cps={cps}
            addAmt={live.addAmt || 50}
            pot={pot}
            potChips={pot * cps}
            onSeat={() => {}}
            startedAt={live.startedAt}
            elapsed={live.startedAt ? now - live.startedAt : 0}
          />
        </div>
      )}

      <PokerApp key={generation} readOnly />
    </>
  );
}
