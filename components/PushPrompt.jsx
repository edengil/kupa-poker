"use client";

import React, { useEffect, useState } from "react";
import { C } from "../lib/poker/colors";
import { brassCta } from "../lib/poker/festive";
import { matchViewerToPlayer } from "../lib/poker/personalHighlights";
import { getPushSupport, getPushSubscription, subscribePush } from "../lib/pushClient";
import { PUSH_PROMPT_KEY, nextPushPrompt } from "../lib/pushPrompt";

const visitId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let decidedThisLoad = false;
let decidedView = null;

function readPrompt() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_PROMPT_KEY) || "null");
  } catch {
    return null;
  }
}

function writePrompt(state) {
  try {
    localStorage.setItem(PUSH_PROMPT_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * בקשה אחת, בפתיחה הבאה של האפליקציה.
 * הלחיצה פותחת את חלון ההרשאה של הדפדפן. סירוב משאיר את הרשימה שבפנים.
 */
export function PushPrompt({ supabase, groupId, db, viewerAuth }) {
  const [view, setView] = useState(null);

  useEffect(() => {
    if (!decidedThisLoad) {
      const support = getPushSupport();
      const permission = typeof Notification === "undefined" ? "default" : Notification.permission;
      decidedView = nextPushPrompt(readPrompt(), { permission, support, visitId });
      writePrompt(decidedView);
      decidedThisLoad = true;
    }
    setView(decidedView);
  }, []);

  useEffect(() => {
    if (!groupId || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (getPushSupport() !== "supported") return;
    let alive = true;
    (async () => {
      const existing = await getPushSubscription();
      if (existing || !alive) return;
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || !alive) return;
      await subscribePush(supabase, groupId, user, playerName(db, viewerAuth));
    })();
    return () => {
      alive = false;
    };
  }, [supabase, groupId, db, viewerAuth]);

  if (!view?.show || !groupId) return null;

  const allow = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const result = await subscribePush(supabase, groupId, user, playerName(db, viewerAuth));
    const choice = result === "subscribed" ? "granted" : result === "denied" ? "denied" : view.choice;
    const next = { ...view, show: false, choice, asked: true };
    writePrompt(next);
    setView(next);
  };

  if (view.mode === "install") {
    return (
      <p data-testid="push-prompt-install" style={hintStyle}>
        באייפון ההתראה שמחוץ לאפליקציה מופיעה אחרי שהאתר במסך הבית. שיתוף, ואז הוסף למסך הבית. בפתיחה משם תופיע בקשת האישור.
      </p>
    );
  }

  return (
    <div data-testid="push-prompt" style={cardStyle}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>התראות מחוץ לאפליקציה</div>
      <p style={{ margin: "0 0 12px", color: C.dim, lineHeight: 1.5 }}>
        אפשר התראות כדי שיופיעו גם מחוץ לאפליקציה, גם כשהאתר סגור.
      </p>
      <button type="button" data-testid="push-prompt-allow" onClick={allow} style={{ ...brassCta, borderRadius: 12, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}>
        אפשר התראות
      </button>
    </div>
  );
}

function playerName(db, viewerAuth) {
  if (!db || !viewerAuth) return null;
  return matchViewerToPlayer(db, viewerAuth);
}

const cardStyle = {
  margin: "8px 0 0",
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${C.brass}`,
  background: C.card,
  color: C.cream,
};

const hintStyle = {
  margin: "8px 0 0",
  fontSize: 13,
  color: C.dim,
  textAlign: "center",
  lineHeight: 1.6,
};
