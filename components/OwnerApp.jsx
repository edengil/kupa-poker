"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PokerApp from "./PokerApp";
import AppErrorBoundary from "./AppErrorBoundary";
import { reportBeacon } from "../lib/diagReport";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeSupabaseStore, flushStore, clearLocalCache, forgetStoreKey, seedStoreLive, snapshotStoreLive, publishStoreKey, store, LIVE_KEY, DB_KEY, CONFIG_KEY } from "../lib/store";
import { liveFingerprint, mergeLiveStates, decideLivePoll } from "../lib/liveMerge";
import { updateGroupCas } from "../lib/groupCas";
import { createBroadcaster, watchPresence } from "../lib/realtime";
import { resolveRootLanding } from "../lib/rootLanding";
import Viewers from "./Viewers";
import ViewerStats from "./ViewerStats";
import InstallButton from "./InstallButton";
import { PushPrompt } from "./PushPrompt";
import { RsvpList } from "./Rsvp";
import { EGMark, EGByline, EGSplash } from "./Logo";
import { authShell, brassCta } from "../lib/poker/festive";
import { C as festiveC } from "../lib/poker/colors";
import { getConfig, onConfig, setConfig, loadConfig } from "../lib/poker/config";
import { buildPlanInviteText } from "../lib/planInvite";
import { track } from "../lib/analytics";

const C = {
  feltDeep: festiveC.feltDeep,
  card: festiveC.card,
  line: festiveC.line,
  brass: festiveC.brass,
  cream: festiveC.cream,
  dim: festiveC.dim,
  loss: festiveC.loss,
};

const SESSION_TIMEOUT_MS = 4000;

/** getSession עם מבוי־זמן: בספארי/PWA הקריאה נתקעת לפעמים עד שנוגעים במסך
    (מתועד גם בהערת המסלול המהיר למטה). אחרי 4 שניות מוותרים על ההמתנה —
    אבל ניסוי H: timeout הוא לא "אין סשן". התוצאה מסומנת ב־timedOut, והקורא
    נשאר במצב המתנה; הסשן האמיתי מגיע דרך onAuthStateChange. (הגרסה הקודמת,
    ניסוי D, החזירה סשן־null מזויף — והיפוך הפאזה ל־signedOut הריץ את כל
    אפקט ה־boot מחדש כשהסשן האמיתי נחת, מגבר remount־ים בפתיחה.) */
function getSessionWithTimeout(supabase) {
  return Promise.race([
    supabase.auth
      .getSession()
      .then(({ data }) => ({ data, timedOut: false }))
      .catch(() => ({ data: { session: null }, timedOut: false })),
    new Promise((resolve) =>
      setTimeout(() => resolve({ data: { session: null }, timedOut: true }), SESSION_TIMEOUT_MS)
    ),
  ]);
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
  const [saveStatus, setSaveStatus] = useState("saved");
  const [online, setOnline] = useState([]); // מי צופה עכשיו — נוכחות חיה
  const [viewerAuth, setViewerAuth] = useState(null);
  const broadcasterRef = useRef(null);
  const groupRef = useRef(null); // גישה יציבה לקבוצה מתוך callbacks
  const lastLiveRef = useRef(undefined); // הלייב האחרון שידוע לדף — להשוואה מול פינגים
  const lastLiveFpRef = useRef(undefined); // טביעה בלי ts
  const checkingLiveRef = useRef(false); // מונע checkLive חופפים שמרעננים פעמיים

  /* אין יותר הרכבה מחדש של העץ על עדכון מרוחק: רענוני רקע מפרסמים את מפתח
     החנות שהשתנה (publishStoreKey), ו־PokerApp/LiveTab מאמצים את הערך החדש
     למצב במקום. ההרכבה הישנה (key על PokerApp) הבהבה, החזירה מסך טעינה
     ואיבדה גלילה ומצב חולף על כל סימון שולם של צופה או יציאה מהבוט. */

  /* משואת אבחון (fix/diag-capture): כל שינוי פאזה/קבוצה בעליית הבעלים */
  const groupSlug = group?.slug ?? null;
  useEffect(() => {
    reportBeacon("owner-phase", groupSlug ? `${phase} group=${groupSlug}` : phase);
  }, [phase, groupSlug]);

  /* ------------------------------ סשן ------------------------------ */
  useEffect(() => {
    let alive = true;
    getSessionWithTimeout(supabase).then(({ data, timedOut }) => {
      if (!alive) return;
      if (!data.session) {
        /* ניסוי H: ב־timeout לא הופכים פאזה — נשארים בהמתנה והסשן האמיתי
           יגיע דרך onAuthStateChange למטה (משתמש מחובר יאומת שם; מנותק
           באמת יקבל שם session=null ויעבור למסך ההתחברות). */
        if (timedOut) return;
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

  /* האם הלייב במסד שונה ממה שמוצג? אם כן — זורעים את הממוזג במטמון החנות
     והזריעה מפרסמת את המפתח, וטאב הלייב מאמץ אותו למצב במקום.
     נקרא מפינג של הבוט, מסקר קבוע, ומחזרה לדף. lastLiveRef מתעדכן גם בכל
     כתיבה מקומית, כדי שהשינויים של עצמנו לא ייחשבו "חיצוניים".

     חשוב: קודם קוראים מהשרת ורק אם אין שינוי חיצוני עושים flush.
     flush לפני הקריאה היה דורס יציאות שהבוט בדיוק כתב (המסך המקומי
     עדיין בלי ג'יטונים) — ואז ההשוואה ראתה "אין שינוי" והכפתור נשאר כבוי.
     השוואה בלי שדה ts — הוא משתנה בכל שמירה ולא אומר שינוי אמיתי. */
  const checkLive = useCallback(async () => {
    const row = groupRef.current;
    if (!row || checkingLiveRef.current) return;
    checkingLiveRef.current = true;
    try {
      const { data, error } = await supabase
        .from("groups")
        .select("live")
        .eq("id", row.id)
        .single();
      if (error) return;
      const s = JSON.stringify(data?.live ?? null);
      const fp = liveFingerprint(data?.live ?? null);
      const localSnap = snapshotStoreLive();
      const decision = decideLivePoll(localSnap, data?.live ?? null, lastLiveFpRef.current);

      if (decision.action === "record") {
        lastLiveRef.current = s;
        lastLiveFpRef.current = fp;
        return;
      }
      if (decision.action === "flush") {
        lastLiveRef.current = s;
        lastLiveFpRef.current = fp;
        await flushStore();
        return;
      }

      /* אחרי ה-fetch ייתכן שהמשתמש ערך שוב — ממזגים את המצב העדכני, לא את הסנאפשוט הישן. */
      const latestLocal = snapshotStoreLive();
      if (latestLocal === null) {
        lastLiveRef.current = s;
        lastLiveFpRef.current = fp;
        await flushStore();
        return;
      }

      let nextLive = data?.live ?? null;
      const mergeBase = latestLocal ?? localSnap;
      if (decision.merge && mergeBase && nextLive) {
        /* הכתיבה עוברת דרך CAS (ממצא 9): המיזוג נבנה בתוך ה־build מול
           השורה הטרייה בכל ניסיון — כתיבה שנוחתת בין הקריאה שלמעלה
           לכתיבה (למשל של הבוט) כבר לא נדרסת בעיוורון. */
        try {
          let mergedLive = null;
          const res = await updateGroupCas(supabase, row.id, (freshRow) => {
            const freshLive = freshRow?.live ?? null;
            if (!freshLive) return null;
            mergedLive = mergeLiveStates(mergeBase, freshLive);
            return { live: mergedLive };
          });
          if (res.ok && !res.skipped && mergedLive) {
            nextLive = mergedLive;
          } else {
            if (!res.ok) console.warn("live merge write failed: conflict");
            nextLive = data?.live ?? null;
          }
        } catch (e) {
          console.warn("live merge write failed:", e?.message || e);
          nextLive = data?.live ?? null;
        }
      }
      lastLiveRef.current = JSON.stringify(nextLive);
      lastLiveFpRef.current = liveFingerprint(nextLive);
      forgetStoreKey(LIVE_KEY);
      /* הזריעה מפרסמת את מפתח הלייב — הטאב מאמץ את הממוזג במקום, בלי הרכבה */
      seedStoreLive(nextLive);
    } catch {
    } finally {
      checkingLiveRef.current = false;
    }
  }, [supabase]);

  /* -------------------- איתור או יצירה של הקבוצה --------------------
     שורת הקבוצה נשמרת ב-localStorage: בביקור חוזר האפליקציה עולה מיידית
     מהמטמון, והרשת רק מאמתת ברקע. */
  const signedOut = phase === "signedOut";
  useEffect(() => {
    let alive = true;

    const boot = (row, broadcaster) => {
      configureStore(
        makeSupabaseStore(supabase, row.id, {
          onStatus: setSaveStatus,
          onFlush: (patch, meta) => {
            // כתיבה שלנו שנגעה בלייב — מעדכנים את נקודת הייחוס לפני הפינג
            if (patch && "live" in patch) {
              lastLiveRef.current = JSON.stringify(patch.live ?? null);
              lastLiveFpRef.current = liveFingerprint(patch.live ?? null);
              /* flush אימץ יציאות מהבוט למטמון — הזריעה מפרסמת את המפתח
                 וטאב הלייב מאמץ אותן למצב במקום. הפרסום הוא מה שמניע את
                 העדכון עכשיו: lastLiveFp כבר תואם לשרת, ו־checkLive לבדו
                 לא היה מזהה שינוי. */
              if (meta?.adoptedRemoteLive) {
                seedStoreLive(patch.live);
              }
            }
            /* ערבים שחולצו מהשרת בזמן flush כבר במטמון החנות (המיזוג כתב
               אותו) — פרסום המפתח מאמץ אותם למסך במקום, בלי הרכבה מחדש */
            if (meta?.adoptedRemoteData) {
              publishStoreKey(DB_KEY);
            }
            broadcaster.ping();
          },
          // מטמון ישן: לא עושים flush של data ישן לשרת (זה מה שמחק ערבים).
          // החנות כבר החליפה את המטמון בערך הטרי מהשרת לפני הקריאה לכאן —
          // מפרסמים את המפתח והמסך מאמץ את הטרי במקום.
          onStale: async (key) => {
            if (key === DB_KEY || key === LIVE_KEY) {
              publishStoreKey(key);
              return;
            }
            if (key === CONFIG_KEY) {
              await loadConfig(); // טוען מחדש מהמטמון הטרי ומודיע למאזיני הקונפיג
              return;
            }
            await flushStore();
          },
        })
      );
      groupRef.current = row;
      setGroup(row);
      setPhase("ready");
      /* boot חוזר עם קבוצה שונה מהמטמון (אימות מול המסד החליף שורה):
         PokerApp כבר מורכב עם החנות הקודמת — פרסום המפתח מאמץ את נתוני
         הקבוצה הנכונה במקום. ב־boot ראשון אין עוד מנוי, וזה no-op. */
      publishStoreKey(DB_KEY);
    };

    const cacheKey = "poker:cache:group";

    // כל כתיבה שנחתה משדרת ping לצופים, בלי לשלוח את הנתונים עצמם.
    // ובכיוון ההפוך: פינג מבחוץ (וואטסאפ / סימון שולם של צופה) מרענן.
    const mkBroadcaster = (slug) => {
      const b = createBroadcaster(supabase, slug, () => {
        checkLive();
        /* סימוני תשלום מעדכנים data ולא live — מרעננים גם את ההיסטוריה:
           שוכחים את מטמון ה־DB וקוראים שוב; הקריאה מחזירה מיד את העותק
           המקומי ומאמתת מול השרת ברקע, ואם השרת זז — onStale מפרסם את
           המפתח והמסך מאמץ את הטרי במקום, בלי הרכבה מחדש. */
        forgetStoreKey(DB_KEY);
        void store.get(DB_KEY);
      });
      broadcasterRef.current = b;
      return b;
    };

    /* מסלול מהיר: עולים מהמטמון מיד, עוד לפני בדיקת הסשן.
       getSession בספארי/PWA נתקע לפעמים עד שנוגעים במסך — אסור לחכות לו.
       אם יתברר שאין סשן, האפקט של הסשן למעלה יעביר למסך התחברות. */
    let cachedRow = null;
    try {
      cachedRow = JSON.parse(localStorage.getItem(cacheKey) || "null");
    } catch {}
    if (cachedRow?.id && cachedRow?.slug) {
      boot(cachedRow, mkBroadcaster(cachedRow.slug));
      checkLive(); // קובע נקודת ייחוס ללייב
    }

    (async () => {
      const { data: sessionData } = await getSessionWithTimeout(supabase);
      const user = sessionData.session?.user;
      if (!user) return;

      // אימות מול המסד — גם במסלול המהיר, ליישור המטמון.
      // ההכרעה בעלים/צופה/קבוצה־ראשונה חיה ב־resolveRootLanding (נבדקת שם):
      // בעלים עולה כרגיל; צופה בלי קבוצה בבעלותו מנותב לקבוצה שצפה בה,
      // וקבוצה חדשה נוצרת רק למשתמש בלי שום שיוך.
      const landing = await resolveRootLanding(supabase, user.id, newSlug);

      if (landing.kind === "error") {
        if (alive && !cachedRow) {
          setMessage(landing.message);
          setPhase("error");
        }
        return;
      }

      if (landing.kind === "viewer") {
        // נוחתים על אותו משטח צפייה שהוא מכיר מהדפדפן — לא על מסך מנהלים
        // ריק. זה גם נתיב הפתיחה של האפליקציה המותקנת (start_url="/").
        if (alive) window.location.replace(`/g/${landing.slug}`);
        return;
      }

      const row = landing.row;

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
  }, [supabase, signedOut, checkLive]);

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
     החור — בדיוק כמו אצל הצופים. העדכון עצמו נוחת באימוץ־במקום דרך
     checkLive, בלי הרכבה מחדש גם כשהדף גלוי. */
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
        checkLive();
        start();
      } else stop();
    };
    const onFocus = () => {
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
  }, [phase, checkLive]);

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
    const onOnline = () => {
      flushStore();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("online", onOnline);
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

  /* שליחה לקבוצה עם טוקן סשן — אמין יותר מעוגיות בלבד במובייל/PWA. */
  const sendToWhatsAppGroup = useCallback(async (text) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("לא מחובר — התחבר מחדש ונסה שוב");
    const res = await fetch("/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = [body.error, body.detail].filter(Boolean).join(" — ");
      const err = new Error(msg || "השליחה לקבוצה נכשלה");
      err.code = body.code || "whapi_send";
      err.shareFallback = Boolean(body.shareFallback);
      throw err;
    }
    return body;
  }, [supabase]);

  /* נשבר שיא בערב שנשמר → הבוט מכריז בקבוצה. נכשל בשקט — ההכרזה
     היא בונוס, ושמירת הערב חשובה ממנה. */
  const notifyRecords = useCallback(async (lines) => {
    try {
      await sendToWhatsAppGroup(`🤖 שיא חדש! 🏆\n\n${lines.join("\n")}`);
    } catch (e) {
      console.warn("record announce failed:", e.message);
    }
  }, [sendToWhatsAppGroup]);

  /* נקבע ערב חדש (או עודכן) → הזמנה לקבוצה עם הלינק, שהחברים יאשרו הגעה. */
  const notifyPlan = useCallback(async (plan, { isUpdate } = {}) => {
    const slug = groupRef.current?.slug;
    if (!slug) throw new Error("אין קישור קבוצה — רענן את העמוד");
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const text = buildPlanInviteText(plan, { isUpdate, baseUrl: base, slug });
    track("evening_planned", { is_update: !!isUpdate });
    try {
      await sendToWhatsAppGroup(text);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      err.inviteText = text;
      throw err;
    }
  }, [sendToWhatsAppGroup]);

  const signIn = useCallback(async () => {
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${site}/auth/callback` },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (await flushStore() === false) return;
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
      <ShareBar
        slug={group.slug}
        groupId={group.id}
        supabase={supabase}
        onSignOut={signOut}
        onSlugChange={(next) => {
          setGroup((g) => {
            const row = { ...g, slug: next };
            try {
              localStorage.setItem("poker:cache:group", JSON.stringify(row));
            } catch {}
            groupRef.current = row;
            return row;
          });
          broadcasterRef.current?.dispose();
          broadcasterRef.current = createBroadcaster(supabase, next, checkLive);
        }}
      />
      {saveStatus !== "saved" && (
        <div role="status" aria-live="polite" style={{ textAlign: "center", padding: 8, color: saveStatus === "error" ? C.loss : C.dim, fontSize: 13 }}>
          {({ pending: "ממתין לשמירה… (גם בלי רשת — יעלה כשתתחבר)", saving: "שומר…", error: "השמירה לשרת נכשלה. הנתונים נשמרו במכשיר — השאר פתוח או לחץ לנסות שוב." })[saveStatus]}
          {saveStatus === "error" && <button type="button" onClick={() => flushStore()} style={{ marginInlineStart: 10 }}>נסה לשמור שוב</button>}
        </div>
      )}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 13px" }}>
        <InstallButton />
        <PushPrompt supabase={supabase} groupId={group?.id} db={group?.data} viewerAuth={viewerAuth} />
        <Viewers supabase={supabase} online={online} groupId={group.id} />
      </div>
      <AppErrorBoundary>
      <PokerApp
        viewerAuth={viewerAuth}
        onTabChange={(t) => {
          if (t === "live") checkLive();
        }}
        statsPanel={
          <ViewerStats supabase={supabase} online={online} groupId={group.id} />
        }
        onGameStart={notifyStart}
        onRecords={notifyRecords}
        onPlanShared={notifyPlan}
        renderRsvps={(planIso, onRows) => (
          <RsvpList supabase={supabase} groupId={group.id} planIso={planIso} onRows={onRows} />
        )}
      />
      </AppErrorBoundary>
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
/* מיוצא גם כ־named export בשביל בדיקת הרינדור (test/ownerAppRender.test.js) —
   זה הרכיב שבו ישב באג ה־useMemo של 24.10, והוא מתרנדר רק בנתיב הבעלים המחובר. */
export function ShareBar({ slug, groupId, supabase, onSignOut, onSlugChange }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareHistory, setShareHistory] = useState(() => getConfig().shareHistory !== false);

  /* כתובת השיתוף נגזרת מה־slug — בלי state ואפקט סנכרון. */
  const url = useMemo(() => {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return base ? `${base}/g/${slug}` : "";
  }, [slug]);

  useEffect(() => onConfig((c) => setShareHistory(c.shareHistory !== false)), []);

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

  const toggleHistory = () => {
    const next = !shareHistory;
    setConfig({ shareHistory: next });
    setShareHistory(next);
  };

  const rotate = async () => {
    if (busy) return;
    const ok = confirm(
      "להחליף את לינק הצפייה?\n\nהלינק הישן יפסיק לעבוד מיד.\nאם הבוט בוואטסאפ משתמש באותו slug — צריך לעדכן גם ב-Vercel את KUPA_GROUP_SLUG ולעשות Redeploy."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const next = newSlug();
      const { error } = await supabase.from("groups").update({ slug: next }).eq("id", groupId);
      if (error) throw error;
      try {
        localStorage.removeItem(`poker:cache:pub:${slug}`);
      } catch {}
      onSlugChange?.(next);
    } catch (e) {
      alert(e?.message || "החלפת הלינק נכשלה");
    } finally {
      setBusy(false);
    }
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
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
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
            type="button"
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12, color: C.dim }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={shareHistory} onChange={toggleHistory} style={{ accentColor: C.brass }} />
            שתף גם היסטוריה לצופים
          </label>
          <button
            type="button"
            onClick={rotate}
            disabled={busy}
            style={{
              marginInlineStart: "auto",
              background: "none",
              border: "none",
              color: C.loss,
              fontSize: 12,
              cursor: busy ? "wait" : "pointer",
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            {busy ? "מחליף…" : "החלף לינק"}
          </button>
        </div>
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
