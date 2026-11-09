"use client";

import { useState, useSyncExternalStore } from "react";
import PokerApp from "./PokerApp";
import { configureStore } from "@/lib/store";
import { buildSeedDb } from "@/lib/poker/seed";

const PREFIX = "poker:preview:";

/* מנוי שאינו משתנה לעולם — לקריאת "האם אנחנו בלקוח אחרי hydration"
   דרך useSyncExternalStore, כמו ב־PushPrompt. */
const subscribeNever = () => () => {};

/**
 * סביבת בדיקה מקומית.
 * ?failFlush=1 — set מצליח מקומית אבל flush נכשל (סימולציית ניתוק מהשרת).
 */
export default function PreviewApp({ failFlush = false, viewerName = "" }) {
  /* מימוש החנות נבנה פעם אחת באתחול state (בלי תופעות לוואי — רק סגירות
     מעל localStorage, שלא נקראות בשרת כי החנות מוגדרת רק בלקוח). */
  const [impl] = useState(() => {
    const defaults = {
      "poker:db": JSON.stringify(buildSeedDb()),
      "poker:config": JSON.stringify({ chipsPerShekel: 2, defaultBuyin: 50, botOn: false }),
    };
    let pending = false;
    return {
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
    };
  });
  /* העץ הראשון חייב להיות זהה בשרת ובלקוח (רק הבאנר): אתחול ready שהסתעף
     על typeof window נתן בשרת עץ בלי PokerApp ובלקוח עם PokerApp — שגיאת
     hydration ובניית העץ מחדש בלקוח בכל טעינה. במקום זה: צילום־שרת false
     וצילום־לקוח true ב־useSyncExternalStore; המעבר קורה אחרי ה־hydration,
     בלי שגיאה ובלי setState באפקט. הגדרת החנות ברינדור הראשון שבו
     mounted=true — לפני ש־PokerApp קיים בעץ וטוען נתונים ממנה. */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (mounted) configureStore(impl);

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
      {mounted && (
        <PokerApp viewerAuth={viewerName ? { full_name: viewerName } : null} />
      )}
    </>
  );
}
