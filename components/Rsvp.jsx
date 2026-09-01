"use client";

import React, { useCallback, useEffect, useState } from "react";
import { C } from "./poker/colors";
import { festiveCard, festiveGlow, brassCta, sectionEyebrow } from "./poker/festive";
import { wazeShortUrl } from "./poker/hosts";

/* ============================================================================
   אישורי הגעה לערב מתוכנן.

   המנהל קובע תאריך בלשונית הלייב (נשמר ב-data.plan), והחברים עונים מהלינק:
   מגיע / אולי / לא מגיע. התשובות יושבות בטבלת game_rsvps, שורה לאדם, עם
   plan_iso — כך שקביעת ערב חדש מתחילה ספירה נקייה בלי למחוק כלום.
   ============================================================================ */

const STATUS = [
  ["yes", "מאשר הגעה", "♠"],
  ["maybe", "אולי", "·"],
  ["no", "לא מגיע", ""],
];
const STATUS_LABEL = { yes: "מגיעים", maybe: "אולי", no: "לא מגיעים" };
const STATUS_COLOR = { yes: C.win, maybe: C.brass, no: C.loss };

export const planLabel = (plan) => {
  if (!plan?.iso) return "";
  const d = new Date(plan.iso + "T12:00:00");
  const weekday = d.toLocaleDateString("he-IL", { weekday: "long" });
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${weekday} · ${date}${plan.time ? ` · ${plan.time}` : ""}`;
};

/** מיקום + הערות — תומך גם בתוכניות ישנות שבהן note שימש למיקום */
export function planPlace(plan) {
  if (!plan) return { location: "", note: "" };
  if (plan.location) return { location: plan.location, note: plan.note || "" };
  /* תוכניות ישנות: כתובת מארח נשמרה ב-note */
  if (plan.note && /^אצל\s/.test(plan.note)) {
    return { location: plan.note, note: "" };
  }
  return { location: "", note: plan.note || "" };
}

function useRsvps(supabase, groupId, planIso) {
  const [rows, setRows] = useState([]);

  const refresh = useCallback(async () => {
    if (!groupId || !planIso) return;
    const { data, error } = await supabase
      .from("game_rsvps")
      .select("user_id, name, email, status, updated_at")
      .eq("group_id", groupId)
      .eq("plan_iso", planIso);
    if (!error && data) setRows(data);
  }, [supabase, groupId, planIso]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  return [rows, refresh];
}

function Groups({ rows }) {
  const label = (p) => p.name || (p.email || "").split("@")[0] || "אנונימי";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {["yes", "maybe", "no"].map((st) => {
        const list = rows.filter((r) => r.status === st);
        if (!list.length) return null;
        return (
          <div key={st} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: STATUS_COLOR[st], fontWeight: 700, minWidth: 62 }}>
              {STATUS_LABEL[st]} ({list.length})
            </span>
            {list.map((r) => (
              <span
                key={r.user_id}
                style={{
                  background: C.cardHi,
                  border: `1px solid ${STATUS_COLOR[st]}44`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 12,
                  color: C.cream,
                }}
              >
                {label(r)}
              </span>
            ))}
          </div>
        );
      })}
      {!rows.length && (
        <span style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
          ♠ עדיין מחכים לאישורים — תהיה הראשון?
        </span>
      )}
    </div>
  );
}

/* ------------------------- צד המנהל: רק הרשימה ------------------------- */
export function RsvpList({ supabase, groupId, planIso }) {
  const [rows] = useRsvps(supabase, groupId, planIso);
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 11,
        borderTop: `1px solid ${C.line}`,
      }}
    >
      <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>♠</span>
        מי מגיע
      </div>
      <Groups rows={rows} />
    </div>
  );
}

/* --------------------- צד הצופה: הצבעה + הרשימה --------------------- */
export function RsvpCard({ supabase, groupId, plan }) {
  const [rows, refresh] = useRsvps(supabase, groupId, plan?.iso);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justVoted, setJustVoted] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setMe(data.session?.user || null);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (!plan?.iso || !groupId) return null;

  const mine = me && rows.find((r) => r.user_id === me.id)?.status;
  const { location, note } = planPlace(plan);
  const wazeUrl = wazeShortUrl(location);
  const confirmed = mine === "yes";

  const vote = async (status) => {
    if (!me || busy) return;
    setBusy(true);
    await supabase.from("game_rsvps").upsert(
      {
        group_id: groupId,
        user_id: me.id,
        plan_iso: plan.iso,
        status,
        name: me.user_metadata?.full_name ?? me.user_metadata?.name ?? null,
        email: me.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,user_id" }
    );
    await refresh();
    setJustVoted(status);
    setBusy(false);
  };

  return (
    <section
      style={{
        ...festiveCard,
        padding: "16px 15px 14px",
        margin: "11px 0",
      }}
    >
      <style>{`
        @keyframes rsvpGlow {
          0%, 100% { opacity: .35; transform: scale(1); }
          50% { opacity: .55; transform: scale(1.04); }
        }
        @keyframes rsvpSpade {
          0%, 100% { transform: rotate(-8deg) translateY(0); opacity: .12; }
          50% { transform: rotate(-4deg) translateY(-3px); opacity: .2; }
        }
        @keyframes rsvpPop {
          0% { transform: scale(.92); opacity: 0; }
          60% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* מוטיב חגיגי עדין ברקע */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -18,
          left: -8,
          fontSize: 88,
          color: C.brass,
          animation: "rsvpSpade 4.5s ease-in-out infinite",
          pointerEvents: "none",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        ♠
      </div>
      <div
        aria-hidden
        style={{
          ...festiveGlow,
          background: `radial-gradient(ellipse at 85% 0%, ${C.brass}28 0%, transparent 55%)`,
          animation: "rsvpGlow 3.8s ease-in-out infinite",
        }}
      />

      <div style={{ position: "relative" }}>
        <div style={{ ...sectionEyebrow, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>♠</span>
          הזמנה לערב
        </div>

        <div style={{
          fontSize: 18,
          fontWeight: 800,
          color: C.cream,
          marginBottom: 4,
          lineHeight: 1.25,
        }}>
          {confirmed ? "נתראה בשולחן!" : "בא לערב פוקר?"}
        </div>
        <div style={{
          fontSize: 13,
          color: C.dim,
          marginBottom: 12,
          lineHeight: 1.4,
        }}>
          {confirmed
            ? "המקום שלך שמור. אפשר תמיד לעדכן."
            : "אשרו הגעה — נשמח לראות אתכם מסביב לשולחן."}
        </div>

        <div style={{
          background: `${C.feltDeep}99`,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: "11px 12px",
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.brass, marginBottom: location || note ? 6 : 0 }}>
            {planLabel(plan)}
          </div>
          {location && (
            <div style={{ fontSize: 13, color: C.cream, marginBottom: note ? 6 : 0, lineHeight: 1.45 }}>
              <div>📍 {location}</div>
              {wazeUrl && (
                <>
                  <div style={{ marginTop: 4, color: C.dim }}>ניווט בווייז:</div>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: C.brass, wordBreak: "break-all" }}
                  >
                    {wazeUrl}
                  </a>
                </>
              )}
            </div>
          )}
          {note && (
            <div style={{
              fontSize: 13,
              color: C.cream,
              lineHeight: 1.45,
              paddingTop: location ? 8 : 0,
              borderTop: location ? `1px solid ${C.line}` : "none",
              marginTop: location ? 2 : 0,
            }}>
              <span style={{ color: C.brass, fontWeight: 700 }}>הערות · </span>
              {note}
            </div>
          )}
        </div>

        {justVoted === "yes" && (
          <div style={{
            animation: "rsvpPop .45s ease-out",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            color: C.win,
            marginBottom: 10,
          }}>
            ♠ מעולה — נתראה בערב!
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {(() => {
            const [st, label, icon] = STATUS[0];
            const active = mine === st;
            return (
              <button
                onClick={() => vote(st)}
                disabled={busy}
                style={{
                  ...(active
                    ? {
                        background: `${C.win}28`,
                        color: C.win,
                        border: `1px solid ${C.win}`,
                        boxShadow: "none",
                        fontWeight: 800,
                        fontFamily: "inherit",
                        cursor: busy ? "wait" : "pointer",
                      }
                    : { ...brassCta, border: `1px solid ${C.brass}aa`, cursor: busy ? "wait" : "pointer" }),
                  width: "100%",
                  padding: "14px 14px",
                  borderRadius: 12,
                  fontSize: 16,
                }}
              >
                {icon} {label}
              </button>
            );
          })()}
          <div style={{ display: "flex", gap: 8 }}>
            {STATUS.slice(1).map(([st, label]) => {
              const active = mine === st;
              return (
                <button
                  key={st}
                  onClick={() => vote(st)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: "11px 10px",
                    borderRadius: 11,
                    border: `1px solid ${active ? STATUS_COLOR[st] : C.line}`,
                    background: active ? `${STATUS_COLOR[st]}22` : "transparent",
                    color: active ? STATUS_COLOR[st] : C.cream,
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 600,
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{
          borderTop: `1px solid ${C.line}`,
          paddingTop: 11,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim, marginBottom: 7 }}>
            מי מגיע
          </div>
          <Groups rows={rows} />
        </div>
      </div>
    </section>
  );
}
