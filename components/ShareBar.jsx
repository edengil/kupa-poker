"use client";

import React, { useEffect, useMemo, useState } from "react";
import { C as festiveC } from "../lib/poker/colors";
import { getConfig, onConfig, setConfig } from "../lib/poker/config";
import { newSlug } from "./newSlug";

const C = {
  feltDeep: festiveC.feltDeep,
  card: festiveC.card,
  line: festiveC.line,
  brass: festiveC.brass,
  cream: festiveC.cream,
  dim: festiveC.dim,
  loss: festiveC.loss,
};

/* ========================= רצועת השיתוף למעלה ========================= */
/* חולצה מ־OwnerApp (גל 8, 8.2) לקובץ משלה. זה הרכיב שבו ישב באג
   ה־useMemo של 24.10 — בדיקת הרינדור (test/ownerAppRender.test.js)
   מרנדרת אותו ישירות מכאן. */
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
      "להחליף את לינק הצפייה?\n\nהלינק הישן יפסיק לעבוד מיד. הבוט והתזכורות ימשיכו לעבוד אוטומטית על הלינק החדש — אין צורך בשום עדכון נוסף."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const next = newSlug();
      /* גל 6 (6.1): שומרים את ה־slug היוצא ברשימת העוגנים שבקונפיג
         (prevSlugs), כדי שצרכני הבוט/התזכורות ימשיכו למצוא את השורה
         לפי ה־slug שבסביבה גם אחרי הסיבוב — בלי עדכון env ובלי Redeploy. */
      const { data: cur, error: readErr } = await supabase
        .from("groups")
        .select("config")
        .eq("id", groupId)
        .single();
      if (readErr) throw readErr;
      const prevConfig = cur?.config || {};
      const prevSlugs = Array.from(
        new Set([...(Array.isArray(prevConfig.prevSlugs) ? prevConfig.prevSlugs : []), slug])
      );
      const { error } = await supabase
        .from("groups")
        .update({ slug: next, config: { ...prevConfig, prevSlugs } })
        .eq("id", groupId);
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
