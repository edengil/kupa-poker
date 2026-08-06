"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import PokerApp from "./PokerApp";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeSupabaseStore, flushStore } from "../lib/store";
import { createBroadcaster } from "../lib/realtime";
import Viewers from "./Viewers";
import ViewerStats from "./ViewerStats";
import { RsvpList } from "./Rsvp";

const C = {
  feltDeep: "#0A2B21",
  card: "#15493A",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
  loss: "#E27A63",
};

/** מזהה קצר, קריא ולא ניתן לניחוש, שמופיע בלינק לשיתוף. */
function newSlug() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export default function OwnerApp() {
  const supabase = getSupabase();
  const [phase, setPhase] = useState("loading"); // loading | signedOut | ready | error
  const [group, setGroup] = useState(null);
  const [message, setMessage] = useState("");
  const broadcasterRef = useRef(null);
  const groupRef = useRef(null); // גישה יציבה לקבוצה מתוך callbacks

  /* ------------------------------ סשן ------------------------------ */
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && !data.session) setPhase("signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      if (!session) {
        setPhase("signedOut");
        setGroup(null);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  /* -------------------- איתור או יצירה של הקבוצה -------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;

      const { data: rows, error } = await supabase
        .from("groups")
        .select("id, slug, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        if (alive) {
          setMessage(error.message);
          setPhase("error");
        }
        return;
      }

      let row = rows?.[0];
      if (!row) {
        const { data: created, error: insertError } = await supabase
          .from("groups")
          .insert({ owner_id: user.id, slug: newSlug() })
          .select("id, slug, name")
          .single();
        if (insertError) {
          if (alive) {
            setMessage(insertError.message);
            setPhase("error");
          }
          return;
        }
        row = created;
      }

      // כל כתיבה שנחתה משדרת ping לצופים, בלי לשלוח את הנתונים עצמם
      const broadcaster = createBroadcaster(supabase, row.slug);
      broadcasterRef.current = broadcaster;

      // חשוב: מגדירים את שכבת האחסון לפני שהאפליקציה עולה ומנסה לקרוא
      configureStore(
        makeSupabaseStore(supabase, row.id, { onFlush: () => broadcaster.ping() })
      );
      if (alive) {
        groupRef.current = row;
        setGroup(row);
        setPhase("ready");
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, phase === "signedOut"]);

  // ניקוי הערוץ ביציאה
  useEffect(
    () => () => {
      broadcasterRef.current?.dispose();
      broadcasterRef.current = null;
    },
    []
  );

  /* ------------------ שמירה אחרונה לפני יציאה מהדף ------------------ */
  useEffect(() => {
    const flush = () => flushStore();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);

  /* פתיחת משחק בלייב → התראת פוש לצופים שנרשמו. השרת מאמת שזה אתה
     ודואג שלא תישלח יותר מהתראה אחת לערב. */
  const notifyStart = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const slug = groupRef.current?.slug;
      if (!token || !slug) return;
      await fetch("/api/notify-start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug }),
      });
    } catch (e) {
      console.warn("notify-start failed:", e.message);
    }
  }, [supabase]);

  /* נשבר שיא בערב שנשמר → הבוט מכריז בקבוצה. נכשל בשקט — ההכרזה
     היא בונוס, ושמירת הערב חשובה ממנה. */
  const notifyRecords = useCallback(async (lines) => {
    try {
      await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `🤖 שיא חדש! 🏆\n\n${lines.join("\n")}` }),
      });
    } catch (e) {
      console.warn("record announce failed:", e.message);
    }
  }, []);

  const signIn = useCallback(async () => {
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${site}/auth/callback` },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    await flushStore();
    await supabase.auth.signOut();
  }, [supabase]);

  if (phase === "loading") return <Splash>טוען…</Splash>;
  if (phase === "error") return <Splash tone="error">{message || "משהו השתבש"}</Splash>;
  if (phase === "signedOut") return <SignIn onSignIn={signIn} />;

  return (
    <>
      <ShareBar slug={group.slug} onSignOut={signOut} />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 13px" }}>
        <Viewers supabase={supabase} slug={group.slug} groupId={group.id} />
      </div>
      <PokerApp
        statsPanel={
          <ViewerStats supabase={supabase} slug={group.slug} groupId={group.id} />
        }
        onGameStart={notifyStart}
        onRecords={notifyRecords}
        renderRsvps={(planIso) => (
          <RsvpList supabase={supabase} groupId={group.id} planIso={planIso} />
        )}
      />
    </>
  );
}

/* ============================ מסך התחברות ============================ */
function SignIn({ onSignIn }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.feltDeep,
        color: C.cream,
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 52, lineHeight: 1, color: C.brass }}>♠</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "14px 0 6px" }}>קופה — פוקר</h1>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7, margin: "0 0 28px" }}>
          התחבר כדי לנהל את ערבי הקבוצה. אחרי ההתחברות תקבל לינק לשיתוף שהחברים
          יוכלו לפתוח בלי חשבון.
        </p>
        <button
          onClick={onSignIn}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            background: C.brass,
            color: C.feltDeep,
            fontFamily: "inherit",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          התחברות עם Google
        </button>
      </div>
    </main>
  );
}

/* ========================= רצועת השיתוף למעלה ========================= */
function ShareBar({ slug, onSignOut }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    setUrl(`${base}/g/${slug}`);
  }, [slug]);

  const copy = async () => {
    const text = `הטבלה של הקבוצה: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      style={{
        background: C.card,
        borderBottom: `1px solid ${C.line}`,
        padding: "9px 13px",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={copy}
          style={{
            flex: 1,
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
          {copied ? "הלינק הועתק" : "שליחת לינק לצפייה"}
        </button>
        <button
          onClick={onSignOut}
          style={{
            padding: "9px 12px",
            borderRadius: 11,
            border: "none",
            background: "transparent",
            color: C.dim,
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          יציאה
        </button>
      </div>
    </div>
  );
}

/* ============================== עזר ============================== */
function Splash({ children, tone }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.feltDeep,
        color: tone === "error" ? C.loss : C.dim,
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        lineHeight: 1.7,
      }}
    >
      <div>{children}</div>
    </main>
  );
}
