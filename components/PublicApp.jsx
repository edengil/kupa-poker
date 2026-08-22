"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import PokerApp, { PokerTable } from "./PokerApp";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeReadOnlyStore } from "../lib/store";
import { subscribeToGroup, fetchSnapshot, joinPresence, logView, trackVisit } from "../lib/realtime";
import { getPushSupport, getPushSubscription, subscribePush, unsubscribePush } from "../lib/pushClient";
import InstallButton from "./InstallButton";
import { RsvpCard } from "./Rsvp";
import { EGMark, EGByline, EGSplash } from "./Logo";
import { authShell, brassCta } from "./poker/festive";
import { C as festiveC } from "./poker/colors";

const C = {
  feltDeep: festiveC.feltDeep,
  card: festiveC.card,
  line: festiveC.line,
  brass: festiveC.brass,
  cream: festiveC.cream,
  dim: festiveC.dim,
  win: festiveC.win,
  loss: festiveC.loss,
};

// גיבוי ל-WebSocket. בטלפון הערוץ נופל כשהמסך ננעל, ולא תמיד מתאושש.
const POLL_MS = 12000;

export default function PublicApp({ slug }) {
  const supabase = getSupabase();
  const [phase, setPhase] = useState("loading"); // loading | signedOut | ready | missing
  const [groupId, setGroupId] = useState(null);
  const [live, setLive] = useState(null);
  const [plan, setPlan] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [generation, setGeneration] = useState(0);
  const dataRef = useRef(null);
  const loggedRef = useRef(false);
  const visitRef = useRef(null); // מעדכן את שורת הביקור: יציאה וטאבים
  const tabRef = useRef("table"); // רענון נתונים לא מחזיר את הצופה לטבלה

  /* ---------------------- טעינה אחרי התחברות ----------------------
     העתק אחרון של התמונה נשמר ב-localStorage: בביקור חוזר הדף עולה מיד
     ממנו, והרשת רק מיישרת ברקע (בדיוק כמו רענון רגיל). */
  const load = useCallback(async () => {
    const cacheKey = `poker:cache:pub:${slug}`;

    const apply = (snap) => {
      configureStore(makeReadOnlyStore(snap));
      dataRef.current = JSON.stringify(snap.data ?? null);
      setGroupId(snap.id);
      setLive(snap.live ?? null);
      setPlan(snap.data?.plan ?? null);
      setPhase("ready");
    };

    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    } catch {}
    if (cached?.id) apply(cached);

    const snap = await fetchSnapshot(supabase, slug);
    if (!snap) {
      if (!cached?.id) setPhase("missing");
      return cached?.id ? cached : null;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(snap));
    } catch {}

    if (!cached?.id) {
      apply(snap);
      return snap;
    }

    // עלינו מהמטמון — מיישרים מול מה שחזר מהרשת
    setLive(snap.live ?? null);
    setPlan(snap.data?.plan ?? null);
    const serialized = JSON.stringify(snap.data ?? null);
    if (serialized !== dataRef.current) {
      dataRef.current = serialized;
      configureStore(makeReadOnlyStore(snap));
      setGeneration((g) => g + 1);
    }
    return snap;
  }, [supabase, slug]);

  useEffect(() => {
    let alive = true;

    /* מסלול מהיר: עולים מהמטמון מיד, עוד לפני בדיקת הסשן.
       getSession בספארי/PWA נתקע לפעמים עד שנוגעים במסך — אסור לחכות לו.
       אם יתברר שאין סשן, נעבור למסך ההתחברות מיד אחר כך. */
    try {
      const cached = JSON.parse(localStorage.getItem(`poker:cache:pub:${slug}`) || "null");
      if (cached?.id) {
        configureStore(makeReadOnlyStore(cached));
        dataRef.current = JSON.stringify(cached.data ?? null);
        setGroupId(cached.id);
        setLive(cached.live ?? null);
        setPlan(cached.data?.plan ?? null);
        setPhase("ready");
      }
    } catch {}

    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!alive) return;
      if (!user) {
        setPhase("signedOut");
        return;
      }
      const snap = await load();
      // רישום ביומן פעם אחת לטעינה, ולא בכל רענון של הנתונים.
      // השורה שנפתחת כאן ממשיכה להתעדכן כל הביקור: טאבים וזמן יציאה.
      if (snap && !loggedRef.current) {
        loggedRef.current = true;
        const viewId = await logView(supabase, snap.id, user);
        if (alive) visitRef.current = trackVisit(supabase, viewId);
        else visitRef.current?.stop?.();
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive && !session) setPhase("signedOut");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      visitRef.current?.stop?.();
      visitRef.current = null;
    };
  }, [supabase, load]);

  /* ------------------------- נוכחות חיה ------------------------- */
  useEffect(() => {
    if (phase !== "ready") return;
    let leave = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) return;
      leave = joinPresence(
        supabase,
        slug,
        {
          id: u.id,
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email,
          email: u.email,
        },
        () => {}
      );
    })();
    return () => leave && leave();
  }, [supabase, slug, phase]);

  /* --------------------------- רענון --------------------------- */
  const refresh = useCallback(async () => {
    const next = await fetchSnapshot(supabase, slug);
    if (!next) return;
    try {
      localStorage.setItem(`poker:cache:pub:${slug}`, JSON.stringify(next));
    } catch {}
    setLive(next.live ?? null);
    setPlan(next.data?.plan ?? null);
    const serialized = JSON.stringify(next.data ?? null);
    if (serialized !== dataRef.current) {
      dataRef.current = serialized;
      configureStore(makeReadOnlyStore(next));
      setGeneration((g) => g + 1);
      setFresh(true);
      setTimeout(() => setFresh(false), 2500);
    }
  }, [supabase, slug]);

  useEffect(() => {
    if (phase !== "ready") return;
    return subscribeToGroup(supabase, slug, refresh);
  }, [supabase, slug, refresh, phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    let timer = null;
    const stop = () => timer && clearInterval(timer);
    const start = () => {
      stop();
      timer = setInterval(refresh, POLL_MS);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else stop();
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, phase]);

  useEffect(() => {
    if (!live?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [live?.startedAt]);

  const signIn = async () => {
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${site}/auth/callback?next=/g/${slug}` },
    });
  };

  if (phase === "loading") return <EGSplash />;
  if (phase === "signedOut") return <SignIn onSignIn={signIn} />;
  if (phase === "missing")
    return <Splash tone="error">הלינק הזה לא מוביל לשום קבוצה.<br />בקש מהמנהל לינק מעודכן.</Splash>;

  const running = live?.players?.length > 0;
  const pot = running ? live.players.reduce((s, p) => s + (+p.buyin || 0), 0) : 0;
  const cps = 2;

  return (
    <>
      <div style={{ background: `linear-gradient(180deg, ${C.card} 0%, ${C.feltDeep} 140%)`, borderBottom: `1px solid ${C.brass}44`, padding: "9px 13px" }}>
        <div
          style={{
            maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 7, fontSize: 13,
            color: fresh ? C.win : C.dim, transition: "color .3s",
          }}
        >
          <span style={{ color: fresh ? C.win : C.brass }}>♠</span>
          <span>{fresh ? "עודכן עכשיו" : "צפייה בלבד · מתעדכן לבד"}</span>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "10px 13px 0" }}>
        <InstallButton />
        <NotifyBell supabase={supabase} groupId={groupId} />
        {plan?.iso >= new Date().toISOString().slice(0, 10) && !running && (
          <RsvpCard supabase={supabase} groupId={groupId} plan={plan} />
        )}
      </div>

      {running && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "13px 13px 0" }}>
          <h2 style={{ margin: "0 2px 9px", fontSize: 15, fontWeight: 700, color: C.brass }}>
            ♠ משחק עכשיו
          </h2>
          <PokerTable
            players={live.players} cps={cps} addAmt={live.addAmt || 50}
            pot={pot} potChips={pot * cps} onSeat={() => {}}
            startedAt={live.startedAt}
            elapsed={live.startedAt ? now - live.startedAt : 0}
          />
        </div>
      )}

      <PokerApp
        key={generation}
        readOnly
        initialTab={tabRef.current}
        onTabChange={(tab) => {
          tabRef.current = tab;
          visitRef.current?.onTab?.(tab);
        }}
      />
    </>
  );
}

/* ========================= התראות "המשחק התחיל" ========================= */
function NotifyBell({ supabase, groupId }) {
  const [state, setState] = useState("checking");
  // checking | off | on | busy | denied | needs-install | unsupported

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = getPushSupport();
      if (support !== "supported") {
        if (alive) setState(support === "needs-install" ? "needs-install" : "unsupported");
        return;
      }
      const sub = await getPushSubscription();
      if (alive) setState(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === "checking" || state === "unsupported" || !groupId) return null;

  if (state === "needs-install") {
    return (
      <p style={{ margin: 0, fontSize: 12, color: C.dim, textAlign: "center", lineHeight: 1.6 }}>
        רוצה התראה כשמתחיל משחק? הוסף את האתר למסך הבית
        (שיתוף ← הוסף למסך הבית) ואז הפעל התראות מכאן.
      </p>
    );
  }

  const toggle = async () => {
    if (state === "busy") return;
    const was = state;
    setState("busy");
    if (was === "on") {
      await unsubscribePush(supabase);
      setState("off");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      setState("off");
      return;
    }
    const result = await subscribePush(supabase, groupId, user);
    setState(result === "subscribed" ? "on" : result === "denied" ? "denied" : "off");
  };

  if (state === "denied") {
    return (
      <p style={{ margin: 0, fontSize: 12, color: C.dim, textAlign: "center" }}>
        ההתראות חסומות בדפדפן — אפשר לאפשר אותן בהגדרות האתר.
      </p>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={state === "busy"}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: 11,
        border: `1px solid ${state === "on" ? C.win : C.line}`,
        background: "transparent",
        color: state === "on" ? C.win : C.dim,
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {state === "busy"
        ? "רגע…"
        : state === "on"
        ? "🔔 תקבל התראה כשמתחיל משחק · לחץ לביטול"
        : "🔕 עדכן אותי כשמתחיל משחק"}
    </button>
  );
}

/* ============================ מסך התחברות ============================ */
function SignIn({ onSignIn }) {
  return (
    <main style={{ ...authShell }}>
      <div style={{ maxWidth: 340 }}>
        <EGMark size={84} style={{ margin: "0 auto" }} />
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "16px 0 6px", color: C.cream }}>
          קופה <span style={{ color: C.brass }}>—</span> פוקר
        </h1>
        <EGByline style={{ margin: "0 0 14px" }} />
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7, margin: "0 0 24px" }}>
          ♠ כדי לראות את הטבלה צריך להתחבר. זה לוקח שנייה, ואין צורך בהרשמה.
        </p>
        <button onClick={onSignIn} style={{
          ...brassCta,
          width: "100%", padding: "14px 18px", borderRadius: 14, fontSize: 16,
        }}>
          התחברות עם Google
        </button>
      </div>
    </main>
  );
}

function Splash({ children, tone }) {
  return (
    <main style={{
      ...authShell,
      color: tone === "error" ? C.loss : C.dim,
      lineHeight: 1.7,
    }}>
      <div>{children}</div>
    </main>
  );
}
