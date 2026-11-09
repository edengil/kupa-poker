"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PokerApp from "./PokerApp";
import { ShareBar } from "./ShareBar";
import { newSlug } from "./newSlug";
import { useGroupBoot } from "./useGroupBoot";
import AppErrorBoundary from "./AppErrorBoundary";
import { reportBeacon, reportDiag } from "../lib/diagReport";
import { getSupabase } from "../lib/supabaseClient";
import { configureStore, makeSupabaseStore, flushStore, clearLocalCache, forgetStoreKey, seedStoreLive, snapshotStoreLive, publishStoreKey, store, LIVE_KEY, DB_KEY, CONFIG_KEY } from "../lib/store";
import { liveFingerprint, mergeLiveStates, decideLivePoll } from "../lib/liveMerge";
import { updateGroupCas } from "../lib/groupCas";
import { createBroadcaster, watchPresence } from "../lib/realtime";
import { resolveRootLanding } from "../lib/rootLanding";
import { getSessionWithTimeout } from "../lib/sessionTimeout";
import { hasAuthError, AUTH_ERROR_MESSAGE } from "../lib/authError";
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
import { setHosts } from "../lib/poker/hosts";
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

/* getSessionWithTimeout חי ב־lib/sessionTimeout — מקור־אמת אחד לשני
   משטחי הכניסה (כאן וב־PublicApp, פריט 1.5). */

export default function OwnerApp({ hosts } = {}) {
  /* רשימת המארחים מגיעה מהשרת (מקור ההגדרות KUPA_HOSTS_JSON) — מוזרקת
     למודול המארחים לפני שרינדור הילדים קורא אותה (גל 4ב, ממצא 17). */
  if (Array.isArray(hosts)) setHosts(hosts);
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
    } catch (e) {
      /* פריט 1.6: כשל ב־checkLive לא נבלע בשקט — warn + משואת אבחון, כדי
         שכשל עתידי בנתיב הזה (אותו נתיב של 1.1/1.2) לא יהיה בלתי־נראה. */
      console.warn("checkLive failed:", e?.message || e);
      reportBeacon("checklive-failed", String(e?.message || e));
    } finally {
      checkingLiveRef.current = false;
    }
  }, [supabase]);

  /* -------------------- איתור או יצירה של הקבוצה --------------------
     זרימת ה־boot (איתור/יצירת קבוצה, עלייה מהמטמון, חיווט החנות והשדר)
     חולצה ל־useGroupBoot (גל 8, 8.2) — אותו קוד בדיוק, ב־hook משלו. */
  const signedOut = phase === "signedOut";
  useGroupBoot({
    supabase,
    signedOut,
    checkLive,
    setSaveStatus,
    setGroup,
    setPhase,
    setMessage,
    groupRef,
    broadcasterRef,
    lastLiveRef,
    lastLiveFpRef,
  });

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
  if (phase === "error")
    return (
      <Splash tone="error">
        {/* גל 6 (6.3): הודעה עברית נקייה + מזהה אירוע לאבחון — בלי טקסט מסד. */}
        לא הצלחנו לטעון את הקבוצה כרגע. נסו שוב בעוד רגע.
        {message ? <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 8 }}>מזהה אירוע: {message}</div> : null}
        {/* פריט 1.4: מסך השגיאה הוא מסך נסה־שוב — כשל חולף בנחיתת השורש
            לא יוצר קבוצה ולא תוקע את המשתמש; רענון מנסה את ההכרעה מחדש. */}
        <div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              ...brassCta,
              marginTop: 18,
              padding: "12px 22px",
              borderRadius: 12,
              fontSize: 15,
            }}
          >
            נסה שוב
          </button>
        </div>
      </Splash>
    );
  if (phase === "signedOut")
    return (
      <SignIn
        onSignIn={signIn}
        failed={typeof window !== "undefined" && hasAuthError(window.location.search)}
      />
    );

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
export function SignIn({ onSignIn, failed = false }) {
  return (
    <main style={{ ...authShell }}>
      <div style={{ maxWidth: 340 }}>
        <EGMark size={84} style={{ margin: "0 auto" }} />
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "16px 0 6px", color: C.cream }}>
          קופה <span style={{ color: C.brass }}>—</span> פוקר
        </h1>
        <EGByline style={{ margin: "0 0 14px" }} />
        {failed && (
          <p role="alert" style={{ color: C.loss, fontSize: 15, lineHeight: 1.7, margin: "0 0 14px" }}>
            {AUTH_ERROR_MESSAGE}
          </p>
        )}
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

/* רצועת השיתוף (ShareBar) חולצה ל־components/ShareBar.jsx (גל 8, 8.2) */

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
