"use client";

import { useEffect } from "react";
import {
  configureStore,
  makeSupabaseStore,
  flushStore,
  forgetStoreKey,
  seedStoreLive,
  publishStoreKey,
  store,
  LIVE_KEY,
  DB_KEY,
  CONFIG_KEY,
} from "@/lib/store";
import { liveFingerprint } from "@/lib/liveMerge";
import { createBroadcaster } from "@/lib/realtime";
import { resolveRootLanding } from "@/lib/rootLanding";
import { getSessionWithTimeout } from "@/lib/sessionTimeout";
import { loadConfig } from "@/lib/poker/config";
import { reportDiag } from "@/lib/diagReport";
import { newSlug } from "./newSlug";

/* זרימת ה־boot של מסך הבעלים — חולצה מ־OwnerApp (גל 8, 8.2):
   איתור או יצירה של הקבוצה, עלייה מהירה מהמטמון עם אימות מול המסד,
   חיווט החנות (store) והשדר (broadcaster). אותו קוד בדיוק; ה־hook
   מקבל מ־OwnerApp את הלקוח, הפאזה, checkLive, המגדירים והרפים. */
export function useGroupBoot({
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
}) {
  /* -------------------- איתור או יצירה של הקבוצה --------------------
     שורת הקבוצה נשמרת ב-localStorage: בביקור חוזר האפליקציה עולה מיידית
     מהמטמון, והרשת רק מאמתת ברקע. */
  useEffect(() => {
    /* פריט 1.5: שער signedOut בגוף האפקט. האפקט תלוי ב־signedOut אבל בלי
       השער הזה, כשהסשן פג והפאזה התהפכה ל־signedOut האפקט רץ שוב — והמסלול
       המהיר עלה מהמטמון (boot + ready) ומסך הבעלים הוצג במקום התחברות.
       כשמנותקים באמת: לא עולים מהמטמון, לא מאמתים, נשארים במסך ההתחברות. */
    if (signedOut) return;
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
        /* סימוני תשלום מעדכנים data ולא live — מרעננים גם את ההיסטוריה.
           רגרסיית B2/C8: קודם שוטפים כתיבות ממתינות לשרת (ה־flush ממזג תחת
           CAS ולא דורס כתיבות שרת), ורק אז שוכחים את המטמון וקוראים שוב —
           forget לפני flush היה זורק סימון תשלום שעוד לא נכתב, בשקט.
           ה־flush רץ גם כשאין ממתין (no-op מהיר), כדי שהסדר יישמר תמיד. */
        void (async () => {
          await flushStore();
          forgetStoreKey(DB_KEY);
          void store.get(DB_KEY);
        })();
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
          /* גל 6 (6.3): את טקסט השגיאה הגולמי שולחים לאבחון בלבד — המסך
             מציג הודעה עברית נקייה עם מזהה־לקוח של האירוע, לא טקסט Postgres. */
          reportDiag("root-landing", new Error(landing.message));
          setMessage("האירוע נרשם באבחון");
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
}
