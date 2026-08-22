"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import PokerApp from "./PokerApp";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeSupabaseStore, flushStore, clearLocalCache, forgetStoreKey, LIVE_KEY } from "../lib/store";
import { createBroadcaster, watchPresence } from "../lib/realtime";
import Viewers from "./Viewers";
import ViewerStats from "./ViewerStats";
import InstallButton from "./InstallButton";
import { RsvpList, planLabel } from "./Rsvp";
import { EGMark, EGByline, EGSplash } from "./Logo";
import { authShell, brassCta } from "./poker/festive";
import { C as festiveC } from "./poker/colors";
import { inferLastView, isStandalone, shouldOpenAsViewer } from "../lib/viewerIdentity";

const C = {
  feltDeep: festiveC.feltDeep,
  card: festiveC.card,
  line: festiveC.line,
  brass: festiveC.brass,
  cream: festiveC.cream,
  dim: festiveC.dim,
  loss: festiveC.loss,
};

/** טביעת אצבע ללייב בלי ts — כדי ששמירה מקומית/מרוץ כתיבה לא יחשבו כשינוי חיצוני. */
function liveFingerprint(live) {
  if (live == null) return "";
  let obj = live;
  if (typeof live === "string") {
    if (live === "" || live === "null") return "";
    try {
      obj = JSON.parse(live);
    } catch {
      return live;
    }
  }
  if (obj && typeof obj === "object") {
    const { ts: _ts, ...rest } = obj;
    return JSON.stringify(rest);
  }
  return JSON.stringify(obj);
}

function tabIsVisible() {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

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
  const [online, setOnline] = useState([]); // מי צופה עכשיו — נוכחות חיה
  const [generation, setGeneration] = useState(0); // remount רק כשבאמת צריך (רקע / חזרה לדף)
  const [viewerAuth, setViewerAuth] = useState(null);
  const broadcasterRef = useRef(null);
  const groupRef = useRef(null); // גישה יציבה לקבוצה מתוך callbacks
  const lastLiveRef = useRef(undefined); // הלייב האחרון שידוע לדף — להשוואה מול פינגים
  const lastLiveFpRef = useRef(undefined); // טביעה בלי ts
  const pendingRemountRef = useRef(null); // null | "live" | "soft" — נדחה עד חזרה לדף
  const tabRef = useRef("table"); // הטאב הפתוח — נשמר בין רענונים
  const checkingLiveRef = useRef(false); // מונע checkLive חופפים שמרעננים פעמיים

  const remountApp = useCallback(() => {
    pendingRemountRef.current = null;
    setGeneration((g) => g + 1);
  }, []);

  /* רענון מלא של PokerApp — רק כשהדף לא בשימוש פעיל (מוסתר),
     אחרת מסמנים וממתינים לחזרה לטאב כדי לא לקפוץ באמצע לייב. */
  const requestRemount = useCallback(
    (opts = {}) => {
      const { forgetLive = false, force = false } = opts;
      if (!force && tabIsVisible()) {
        // לא מוחקים מטמון לייב כל עוד המשתמש על הדף
        pendingRemountRef.current = forgetLive ? "live" : "soft";
        return;
      }
      if (forgetLive) forgetStoreKey(LIVE_KEY);
      remountApp();
    },
    [remountApp]
  );

  /* ------------------------------ סשן ------------------------------ */
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        setPhase("signedOut");
        return;
      }
      const u = data.session.user;
      setViewerAuth({
        name: u.user_metadata?.name || null,
        full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        email: u.email || null,
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      if (!session) {
        setPhase("signedOut");
        setGroup(null);
        setViewerAuth(null);
      } else {
        const u = session.user;
        setViewerAuth({
          name: u.user_metadata?.name || null,
          full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          email: u.email || null,
        });
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  /* האם הלייב במסד שונה ממה שמוצג? אם כן — רענון (remount של PokerApp)
     רק כשהדף לא גלוי/פעיל; בזמן שימוש נדחה כדי לא לקפוץ את הלייב.
     נקרא מפינג של הבוט, מסקר קבוע, ומחזרה לדף. lastLiveRef מתעדכן גם בכל
     כתיבה מקומית, כדי שהשינויים של עצמנו לא ייחשבו "חיצוניים".

     חשוב: לפני ההשוואה שומרים כל שינוי מקומי שעדיין בתור (debounce).
     בלי זה, באמצע סגירת משחק הרענון היה טוען מהשרת גרסה ישנה ודורס את המסך.
     השוואה בלי שדה ts — הוא משתנה בכל שמירה ולא אומר שינוי אמיתי. */
  const checkLive = useCallback(async () => {
    const row = groupRef.current;
    if (!row || checkingLiveRef.current) return;
    checkingLiveRef.current = true;
    try {
      await flushStore();
      const { data, error } = await supabase
        .from("groups")
        .select("live")
        .eq("id", row.id)
        .single();
      if (error) return;
      const s = JSON.stringify(data?.live ?? null);
      const fp = liveFingerprint(data?.live ?? null);
      if (lastLiveRef.current === undefined) {
        lastLiveRef.current = s;
        lastLiveFpRef.current = fp;
        return;
      }
      if (lastLiveFpRef.current === fp) {
        // אותו תוכן (אולי ts אחר) — מיישרים בלי remount
        lastLiveRef.current = s;
        return;
      }
      lastLiveRef.current = s;
      lastLiveFpRef.current = fp;
      requestRemount({ forgetLive: true });
    } catch {
    } finally {
      checkingLiveRef.current = false;
    }
  }, [supabase, requestRemount]);

  /* -------------------- איתור או יצירה של הקבוצה --------------------
     שורת הקבוצה נשמרת ב-localStorage: בביקור חוזר האפליקציה עולה מיידית
     מהמטמון, והרשת רק מאמתת ברקע. */
  useEffect(() => {
    let alive = true;

    const boot = (row, broadcaster) => {
      configureStore(
        makeSupabaseStore(supabase, row.id, {
          onFlush: (patch) => {
            // כתיבה שלנו שנגעה בלייב — מעדכנים את נקודת הייחוס לפני הפינג
            if (patch && "live" in patch) {
              lastLiveRef.current = JSON.stringify(patch.live ?? null);
              lastLiveFpRef.current = liveFingerprint(patch.live ?? null);
            }
            broadcaster.ping();
          },
          // מטמון DB/config לא עדכני — קודם שומרים לייב מקומי; remount רק ברקע
          // כדי לא לקפוץ באמצע לייב. בלי forget על הלייב.
          onStale: async () => {
            await flushStore();
            requestRemount({ forgetLive: false });
          },
        })
      );
      groupRef.current = row;
      setGroup(row);
      setPhase("ready");
    };

    const cacheKey = "poker:cache:group";

    // כל כתיבה שנחתה משדרת ping לצופים, בלי לשלוח את הנתונים עצמם.
    // ובכיוון ההפוך: פינג שמגיע מבחוץ (פקודה בוואטסאפ) מרענן את המסך מיד.
    const mkBroadcaster = (slug) => {
      const b = createBroadcaster(supabase, slug, checkLive);
      broadcasterRef.current = b;
      return b;
    };

    /* מסלול מהיר: עולים מהמטמון מיד, עוד לפני בדיקת הסשן.
       getSession בספארי/PWA נתקע לפעמים עד שנוגעים במסך — אסור לחכות לו.
       אם יתברר שאין סשן, האפקט של הסשן למעלה יעביר למסך התחברות.

       צופה שהתקין למסך הבית נוחת על `/` (start_url הישן) — אם יש לו לינק
       צפייה שמור, לא מעלים לו אפליקציית מנהל ריקה. */
    const lastView = inferLastView();
    let cachedRow = null;
    try {
      cachedRow = JSON.parse(localStorage.getItem(cacheKey) || "null");
    } catch {}
    /* מטמון של קבוצה אחרת + לינק צפייה — ב-PWA זה כמעט תמיד צופה
       שנחת על `/` וקיבל קופה ריקה. לא מעלים את המעטפת הלא נכונה. */
    if (lastView && cachedRow?.slug && cachedRow.slug !== lastView && isStandalone()) {
      window.location.replace(`/g/${lastView}`);
      return () => {
        alive = false;
      };
    }
    if (cachedRow?.id && cachedRow?.slug) {
      boot(cachedRow, mkBroadcaster(cachedRow.slug));
      checkLive(); // קובע נקודת ייחוס ללייב
    }

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;

      // אימות מול המסד — גם במסלול המהיר, ליישור המטמון
      const { data: rows, error } = await supabase
        .from("groups")
        .select("id, slug, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        if (alive && !cachedRow) {
          setMessage(error.message);
          setPhase("error");
        }
        return;
      }

      let row = rows?.[0];
      const viewSlug = inferLastView();
      if (shouldOpenAsViewer(viewSlug, row?.slug)) {
        window.location.replace(`/g/${viewSlug}`);
        return;
      }
      if (!row) {
        /* צופה ב-PWA בלי קבוצה משלו: לא יוצרים לו קופה ריקה עם כל הטאבים. */
        if (viewSlug) {
          window.location.replace(`/g/${viewSlug}`);
          return;
        }
        if (isStandalone()) {
          if (alive && !cachedRow) {
            setMessage("אין קבוצה במסך הבית הזה. פתח את לינק הצפייה מהוואטסאפ והוסף אותו למסך הבית משם.");
            setPhase("error");
          }
          return;
        }
        const { data: created, error: insertError } = await supabase
          .from("groups")
          .insert({ owner_id: user.id, slug: newSlug() })
          .select("id, slug, name")
          .single();
        if (insertError) {
          if (alive && !cachedRow) {
            setMessage(insertError.message);
            setPhase("error");
          }
          return;
        }
        row = created;
      }

      try {
        localStorage.setItem(cacheKey, JSON.stringify(row));
      } catch {}

      if (!alive) return;
      if (cachedRow?.id === row.id && cachedRow?.slug === row.slug) return; // המטמון היה נכון

      // אין מטמון (או שהוא לא תואם) — עולים עם הנתונים מהמסד
      broadcasterRef.current?.dispose();
      boot(row, mkBroadcaster(row.slug));
      checkLive();
    })();
    return () => {
      alive = false;
    };
  }, [supabase, phase === "signedOut", checkLive]);

  // ניקוי הערוץ ביציאה
  useEffect(
    () => () => {
      broadcasterRef.current?.dispose();
      broadcasterRef.current = null;
    },
    []
  );

  /* גיבוי לפינגים: WebSocket בטלפון נופל כשהמסך ננעל ולא תמיד מתאושש,
     ואז עדכונים מהבוט לא מגיעים עד שיוצאים וחוזרים. סקר קל (שאילתת לייב
     אחת) כל 12 שניות כשהמסך גלוי + בדיקה מיידית בכל חזרה לדף סוגרים את
     החור — בדיוק כמו אצל הצופים.
     Remount בזמן שהדף גלוי נדחה; בחזרה מהרקע מריצים remount ממתינים. */
  useEffect(() => {
    if (phase !== "ready") return;
    let timer = null;
    const stop = () => timer && clearInterval(timer);
    const start = () => {
      stop();
      timer = setInterval(checkLive, 12000);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (pendingRemountRef.current) {
          if (pendingRemountRef.current === "live") forgetStoreKey(LIVE_KEY);
          remountApp();
        }
        checkLive();
        start();
      } else stop();
    };
    const onFocus = () => {
      if (pendingRemountRef.current) {
        if (pendingRemountRef.current === "live") forgetStoreKey(LIVE_KEY);
        remountApp();
      }
      checkLive();
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [phase, checkLive, remountApp]);

  /* נוכחות חיה — מנוי אחד לכל הדף. גם פאנל "מי צופה" וגם טאב "צפיות"
     מקבלים את אותה רשימה כ-prop. שני מנויים לאותו ערוץ היו מפילים את
     ספריית ה-realtime ("cannot add presence callbacks after subscribe"). */
  useEffect(() => {
    if (phase !== "ready" || !group?.slug) return;
    return watchPresence(supabase, group.slug, setOnline);
  }, [supabase, phase, group?.slug]);

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

  /* נקבע ערב חדש (או עודכן) → הזמנה לקבוצה עם הלינק, שהחברים יאשרו הגעה. */
  const notifyPlan = useCallback(async (plan, { isUpdate } = {}) => {
    try {
      const slug = groupRef.current?.slug;
      if (!slug) return;
      const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const head = isUpdate ? "עדכון לערב הפוקר! ♠" : "ערב פוקר מתוכנן! ♠";
      const location = plan.location || "";
      const note = plan.note || "";
      const text = [
        `🤖 ${head}`,
        planLabel(plan),
        ...(location ? [`📍 ${location}`] : []),
        ...(note ? [`📝 הערות: ${note}`] : []),
        "",
        "מגיעים? מאשרים הגעה כאן:",
        `${base}/g/${slug}`,
      ].join("\n");
      await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      console.warn("plan announce failed:", e.message);
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
    clearLocalCache();
    try {
      localStorage.removeItem("poker:cache:group");
    } catch {}
    await supabase.auth.signOut();
  }, [supabase]);

  if (phase === "loading") return <EGSplash />;
  if (phase === "error") return <Splash tone="error">{message || "משהו השתבש"}</Splash>;
  if (phase === "signedOut") return <SignIn onSignIn={signIn} />;

  return (
    <>
      <ShareBar slug={group.slug} onSignOut={signOut} />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 13px" }}>
        <InstallButton />
        <Viewers supabase={supabase} online={online} groupId={group.id} />
      </div>
      <PokerApp
        key={generation}
        viewerAuth={viewerAuth}
        initialTab={tabRef.current}
        onTabChange={(t) => {
          tabRef.current = t;
        }}
        statsPanel={
          <ViewerStats supabase={supabase} online={online} groupId={group.id} />
        }
        onGameStart={notifyStart}
        onRecords={notifyRecords}
        onPlanShared={notifyPlan}
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
    <main style={{ ...authShell }}>
      <div style={{ maxWidth: 340 }}>
        <EGMark size={84} style={{ margin: "0 auto" }} />
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "16px 0 6px", color: C.cream }}>
          קופה <span style={{ color: C.brass }}>—</span> פוקר
        </h1>
        <EGByline style={{ margin: "0 0 14px" }} />
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7, margin: "0 0 28px" }}>
          ♠ התחבר כדי לנהל את ערבי הקבוצה. אחרי ההתחברות תקבל לינק לשיתוף שהחברים
          יוכלו לפתוח בלי חשבון.
        </p>
        <button
          onClick={onSignIn}
          style={{
            ...brassCta,
            width: "100%",
            padding: "14px 18px",
            borderRadius: 14,
            fontSize: 16,
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
        background: `linear-gradient(180deg, ${C.card} 0%, ${C.feltDeep} 120%)`,
        borderBottom: `1px solid ${C.brass}44`,
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
        ...authShell,
        color: tone === "error" ? C.loss : C.dim,
        lineHeight: 1.7,
      }}
    >
      <div>{children}</div>
    </main>
  );
}
