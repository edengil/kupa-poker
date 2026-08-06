"use client";

import React, { useEffect, useMemo, useState } from "react";

/* ============================================================================
   טאב "צפיות" — למנהל בלבד.

   מציג מי פתח את הלינק, כמה פעמים, כמה זמן נשאר ובמה הסתכל. הנתונים מגיעים
   מיומן group_views: כל ביקור הוא שורה עם זמן כניסה, זמן "נראה לאחרונה"
   ורצף הטאבים שנצפו. הנוכחות החיה מגיעה מ-OwnerApp כ-prop — מנוי אחד לכל
   הדף; מנוי שני לאותו ערוץ מפיל את ספריית ה-realtime.
   ============================================================================ */

const C = {
  feltDeep: "#0A2B21",
  card: "#15493A",
  cardHi: "#1B5644",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
  win: "#5BC38C",
};

const TAB_LABEL = {
  table: "טבלה",
  players: "שחקנים",
  records: "שיאים",
  live: "לייב",
  input: "הזנה",
  sessions: "ערבים",
  stats: "צפיות",
};

const fmtTime = (v) =>
  new Date(v).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

const fmtDate = (v) => {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function fmtDur(ms) {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "פחות מדק׳";
  if (mins < 60) return `${mins} דק׳`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} שע׳ ${m} דק׳` : `${h} שע׳`;
}

const ago = (v) => {
  if (!v) return "";
  const mins = Math.floor((Date.now() - new Date(v)) / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return fmtDate(v);
};

/* משך ביקור: מהכניסה ועד "נראה לאחרונה". ביקור בלי left_at (גרסה ישנה של
   היומן, או דף שנחטף באמצע) נספר כאפס כדי לא לנפח את הסכום. */
const visitMs = (row) => {
  if (!row.left_at) return 0;
  return Math.max(0, new Date(row.left_at) - new Date(row.at));
};

/* משך קצר — לזמן על כל טאב, שם דקות עגולות לא מספיקות */
function fmtShort(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} שנ׳`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} דק׳`;
  return `${Math.floor(m / 60)} שע׳ ${m % 60} דק׳`;
}

/* כמה זמן בכל טאב: כל רשומת טאב חיה עד הרשומה הבאה, והאחרונה עד היציאה.
   רצף באותו טאב מתמזג לקטע אחד. */
function tabSpans(row) {
  const list = (row.tabs || []).filter((t) => t && t.tab);
  const end = row.left_at ? new Date(row.left_at) : null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const stop = i + 1 < list.length ? new Date(list[i + 1].at) : end;
    const ms = stop ? Math.max(0, stop - new Date(list[i].at)) : 0;
    const last = out[out.length - 1];
    if (last && last.tab === list[i].tab) last.ms += ms;
    else out.push({ tab: list[i].tab, ms });
  }
  return out;
}

/* המכשיר נשמר על רשומת הטאב הראשונה של הביקור */
const deviceOf = (row) => row.tabs?.[0]?.d || null;

export default function ViewerStats({ supabase, online = [], groupId }) {
  const [rows, setRows] = useState(null); // null = טוען
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("group_views")
        .select("user_id, name, email, at, left_at, tabs")
        .eq("group_id", groupId)
        .order("at", { ascending: false })
        .limit(500);
      if (!alive) return;
      setRows(error ? [] : data);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, groupId]);

  const people = useMemo(() => {
    if (!rows) return [];
    const byPerson = new Map();
    for (const row of rows) {
      const key = row.user_id || row.email || "אנונימי";
      let p = byPerson.get(key);
      if (!p) {
        p = {
          key,
          userId: row.user_id,
          name: row.name,
          email: row.email,
          visits: [],
          totalMs: 0,
          closedVisits: 0,
          tabCounts: {},
          tabMs: {},
          devices: new Set(),
        };
        byPerson.set(key, p);
      }
      p.visits.push(row);
      p.totalMs += visitMs(row);
      if (row.left_at) p.closedVisits += 1;
      const dev = deviceOf(row);
      if (dev) p.devices.add(dev);
      for (const t of row.tabs || []) {
        p.tabCounts[t.tab] = (p.tabCounts[t.tab] || 0) + 1;
      }
      for (const s of tabSpans(row)) {
        p.tabMs[s.tab] = (p.tabMs[s.tab] || 0) + s.ms;
      }
    }
    // הפעילים לאחרונה למעלה
    return [...byPerson.values()].sort(
      (a, b) => new Date(b.visits[0].at) - new Date(a.visits[0].at)
    );
  }, [rows]);

  const label = (p) => p.name || (p.email || "").split("@")[0] || "אנונימי";
  const onlineIds = new Set(online.map((o) => o.id));
  const totalVisits = rows?.length || 0;

  return (
    <div style={{ marginTop: 4 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 2px 4px", color: C.cream }}>
        צפיות
      </h2>
      <p style={{ color: C.dim, fontSize: 12, margin: "0 2px 12px" }}>
        {online.length
          ? `${online.length} צופים ברגע זה · ${totalVisits} כניסות ביומן`
          : `${totalVisits} כניסות ביומן`}
      </p>

      {online.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 2px 12px" }}>
          {online.map((o) => (
            <span
              key={o.id}
              style={{
                background: C.cardHi,
                border: `1px solid ${C.win}55`,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12.5,
                color: C.cream,
              }}
            >
              ● {o.name || o.email || "אנונימי"}
            </span>
          ))}
        </div>
      )}

      {rows === null ? (
        <p style={{ color: C.dim, fontSize: 13, margin: "20px 2px" }}>טוען…</p>
      ) : !people.length ? (
        <p style={{ color: C.dim, fontSize: 13, margin: "20px 2px" }}>
          אף אחד עוד לא פתח את הלינק.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {people.map((p) => {
            const open = openKey === p.key;
            // בעיקר לפי זמן אמיתי בכל טאב; אם אין מדידות זמן — לפי ספירת מעברים
            const byMs = Object.entries(p.tabMs)
              .filter(([, ms]) => ms > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);
            const topTabs = byMs.length
              ? byMs.map(([t, ms]) => `${TAB_LABEL[t] || t} ${fmtShort(ms)}`).join(" · ")
              : Object.entries(p.tabCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([t]) => TAB_LABEL[t] || t)
                  .join(" · ");
            const avgMs = p.closedVisits ? p.totalMs / p.closedVisits : null;
            const devices = [...p.devices].join(" · ");
            return (
              <div
                key={p.key}
                style={{
                  background: C.card,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setOpenKey(open ? null : p.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "right",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: C.cream }}>
                      {label(p)}
                      {onlineIds.has(p.userId) && (
                        <span style={{ color: C.win, fontSize: 11, marginInlineStart: 6 }}>
                          ● צופה עכשיו
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                      {p.visits.length} כניסות · סה״כ {fmtDur(p.totalMs)}
                      {avgMs != null ? ` · ממוצע ${fmtDur(avgMs)}` : ""}
                      {devices ? ` · ${devices}` : ""}
                    </div>
                    {topTabs && (
                      <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                        בעיקר: {topTabs}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11.5, color: C.dim, flex: "0 0 auto" }}>
                    {ago(p.visits[0].at)}
                  </span>
                </button>

                {open && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "4px 14px 11px" }}>
                    {p.visits.slice(0, 20).map((v, i) => {
                      const seq = tabSpans(v)
                        .map((s) => `${TAB_LABEL[s.tab] || s.tab}${s.ms > 0 ? ` ${fmtShort(s.ms)}` : ""}`)
                        .join(" ← ");
                      const dev = deviceOf(v);
                      return (
                        <div
                          key={i}
                          style={{
                            padding: "8px 0",
                            borderBottom: `1px solid ${C.line}44`,
                            fontSize: 12.5,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", color: C.cream }}>
                            <span>
                              {fmtDate(v.at)} · נכנס {fmtTime(v.at)}
                              {v.left_at ? ` · יצא ~${fmtTime(v.left_at)}` : ""}
                            </span>
                            <span style={{ color: C.dim }}>{fmtDur(v.left_at ? visitMs(v) : null)}</span>
                          </div>
                          {(seq || dev) && (
                            <div style={{ color: C.dim, marginTop: 3, fontSize: 11.5 }}>
                              {dev ? `${dev}${seq ? " · " : ""}` : ""}
                              {seq ? `צפה ב: ${seq}` : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {p.visits.length > 20 && (
                      <p style={{ color: C.dim, fontSize: 11.5, margin: "8px 0 0" }}>
                        מוצגות 20 הכניסות האחרונות מתוך {p.visits.length}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
