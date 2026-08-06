"use client";

import React, { useCallback, useEffect, useState } from "react";

/* ============================================================================
   אישורי הגעה לערב מתוכנן.

   המנהל קובע תאריך בלשונית הלייב (נשמר ב-data.plan), והחברים עונים מהלינק:
   מגיע / אולי / לא מגיע. התשובות יושבות בטבלת game_rsvps, שורה לאדם, עם
   plan_iso — כך שקביעת ערב חדש מתחילה ספירה נקייה בלי למחוק כלום.
   ============================================================================ */

const C = {
  card: "#15493A",
  cardHi: "#1B5644",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
  win: "#5BC38C",
  loss: "#E27A63",
  feltDeep: "#0A2B21",
};

const STATUS = [
  ["yes", "מגיע ✅"],
  ["maybe", "אולי 🤔"],
  ["no", "לא מגיע ❌"],
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
        <span style={{ fontSize: 12, color: C.dim }}>אף אחד עוד לא ענה.</span>
      )}
    </div>
  );
}

/* ------------------------- צד המנהל: רק הרשימה ------------------------- */
export function RsvpList({ supabase, groupId, planIso }) {
  const [rows] = useRsvps(supabase, groupId, planIso);
  return <Groups rows={rows} />;
}

/* --------------------- צד הצופה: הצבעה + הרשימה --------------------- */
export function RsvpCard({ supabase, groupId, plan }) {
  const [rows, refresh] = useRsvps(supabase, groupId, plan?.iso);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(false);
  };

  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.brass}66`,
        borderRadius: 14,
        padding: "12px 14px",
        margin: "11px 0",
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.brass, marginBottom: 2 }}>
        ♠ ערב פוקר מתוכנן
      </div>
      <div style={{ fontSize: 13.5, color: C.cream, marginBottom: plan.note ? 2 : 10 }}>
        {planLabel(plan)}
      </div>
      {plan.note && (
        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10 }}>{plan.note}</div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {STATUS.map(([st, label]) => (
          <button
            key={st}
            onClick={() => vote(st)}
            disabled={busy}
            style={{
              flex: 1,
              padding: "9px 6px",
              borderRadius: 10,
              border: `1px solid ${mine === st ? STATUS_COLOR[st] : C.line}`,
              background: mine === st ? `${STATUS_COLOR[st]}22` : "transparent",
              color: mine === st ? STATUS_COLOR[st] : C.cream,
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: mine === st ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Groups rows={rows} />
    </section>
  );
}
