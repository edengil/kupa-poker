"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";
import { r2 } from "../../../lib/poker/helpers";
import { tipShownFor } from "../../../lib/liveMerge";
import { playerTipEvents, isManualTip } from "../../../lib/manualTips";
import { playerChips } from "../../../lib/liveView";
import {
  partnerOf,
  DEFAULT_FILL_CHIPS,
  fillCountFor,
  canonCoupleName,
  summarizeCoupleFills,
  formatFillBadge,
  shortCoupleName,
} from "../../../lib/poker/coupleFills";
import { IconBtn, RoundBtn, inputStyle } from "../ui";
import { LiveExitField } from "./LiveExitField";
import { Plus, Minus, X } from "../icons";

/* שורת שחקן בטבלת הלייב — חולצה מ־LiveTab.jsx (B1). כל המצב והפעולות מגיעים כפרופס מהטאב. */
export function LivePlayerRow({
  p,
  index: i,
  group,
  prevGroup,
  players,
  coupleFills,
  tips,
  aliases: A,
  cps,
  menuIdx,
  setMenuIdx,
  tipPickerIdx,
  setTipPickerIdx,
  tipAmt,
  setTipAmt,
  tipListName,
  setTipListName,
  tipDelConfirm,
  setTipDelConfirm,
  longPressRef,
  cashoutDraftRef,
  doCoupleFill,
  addManualTip,
  deleteManualTip,
  bump,
  addAmt,
  rm,
  setField,
  commitCashout,
}) {
  const prev = prevGroup ? { group: prevGroup } : null;
  const showGap =
    prev &&
    ((prev.group === "win" && (group === "even" || group === "lose" || group === "open")) ||
      (prev.group === "even" && (group === "lose" || group === "open")) ||
      (prev.group === "lose" && group === "open"));
  const net =
    p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0));
  const partnerName = partnerOf(p.name);
  const showFill =
    !!partnerName &&
    players.some((q) => canonCoupleName(q.name) === partnerName);
  const fillEvents = fillCountFor(coupleFills, p.name);
  const fillSummaries = showFill ? summarizeCoupleFills(coupleFills, p.name) : [];
  const partnerShort = partnerName ? shortCoupleName(partnerName) : "";
  const meShort = shortCoupleName(p.name);
  const shownTip = tipShownFor(p, tips, A);
  return (
    <React.Fragment key={p.name + ":" + i}>
    {showGap && (
      <div
        aria-hidden
        style={{ height: 8, borderTop: `1px dashed ${C.line}`, margin: "2px 8px 0" }}
      />
    )}
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* לחיצה ארוכה = מילוי 30 ממני לשותף; לחיצה קצרה = תפריט כיוונים */}
          <b
            style={{ fontSize: 15, userSelect: "none", touchAction: "manipulation" }}
            onPointerDown={() => {
              if (!showFill) return;
              longPressRef.current = setTimeout(() => doCoupleFill(p.name), 550);
            }}
            onPointerUp={() => {
              if (longPressRef.current) clearTimeout(longPressRef.current);
            }}
            onPointerLeave={() => {
              if (longPressRef.current) clearTimeout(longPressRef.current);
            }}
            onClick={() => {
              if (!showFill) return;
              setMenuIdx(menuIdx === i ? null : i);
            }}
          >
            {p.name}
          </b>
          {showFill && (
            <button
              type="button"
              title={`${meShort} → ${partnerShort} · ${DEFAULT_FILL_CHIPS}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuIdx(menuIdx === i ? null : i);
              }}
              style={{
                background: "transparent",
                border: `1px solid ${C.line}`,
                color: C.dim,
                borderRadius: 6,
                fontSize: 11,
                padding: "2px 6px",
                cursor: "pointer",
                opacity: 0.7,
                fontFamily: "inherit",
              }}
            >
              ↔{fillEvents > 0 ? ` ${fillEvents}×${DEFAULT_FILL_CHIPS}` : ""}
            </button>
          )}
          {menuIdx === i && showFill && (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => doCoupleFill(p.name)}
                style={{
                  background: C.feltDeep,
                  border: `1px solid ${C.line}`,
                  color: C.cream,
                  borderRadius: 8,
                  fontSize: 11.5,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {meShort} → {partnerShort} · {DEFAULT_FILL_CHIPS}
              </button>
              <button
                type="button"
                onClick={() => doCoupleFill(partnerName)}
                style={{
                  background: C.feltDeep,
                  border: `1px solid ${C.line}`,
                  color: C.cream,
                  borderRadius: 8,
                  fontSize: 11.5,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {partnerShort} → {meShort} · {DEFAULT_FILL_CHIPS}
              </button>
            </span>
          )}
          {fillSummaries.map((row) => (
            <span
              key={row.label}
              style={{ fontSize: 11, color: C.dim, fontVariantNumeric: "tabular-nums" }}
              title={row.ats?.length ? row.ats.map((t) => formatFillBadge({ ...row, lastAt: t })).join("\n") : undefined}
            >
              {formatFillBadge(row)}
            </span>
          ))}
          {shownTip > 0 && (
            <button
              type="button"
              data-testid={`live-tip-label-${p.name}`}
              title="רשימת הטיפים של הערב"
              onClick={() => {
                setTipListName(tipListName === p.name ? null : p.name);
                setTipDelConfirm(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: C.dim,
                fontSize: 11,
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              טיפ {shownTip}
            </button>
          )}
          {/* הוספת טיפ ידנית — נראית תמיד, גם כשאין טיפים (גיבוי לנפילת הבוט) */}
          <button
            type="button"
            data-testid={`live-tip-open-${p.name}`}
            title="הוסף טיפ ידנית"
            onClick={() => {
              setTipPickerIdx(tipPickerIdx === i ? null : i);
              setTipAmt("");
            }}
            style={{
              background: "transparent",
              border: `1px solid ${C.line}`,
              color: C.dim,
              borderRadius: 6,
              fontSize: 11,
              padding: "2px 6px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + טיפ
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {net !== null && (
            <b
              style={{
                color: net >= 0 ? C.win : C.loss,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(net)}₪
            </b>
          )}
          <IconBtn onClick={() => rm(i)} danger>
            <X size={14} />
          </IconBtn>
        </div>
      </div>
      {tipPickerIdx === i && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 11.5, color: C.dim }}>טיפ בג&apos;יטונים:</span>
          <span
            data-testid={`live-tip-total-${p.name}`}
            style={{ fontSize: 11.5, color: C.dim, fontVariantNumeric: "tabular-nums" }}
          >
            סה״כ טיפים עד כה: {tipShownFor(p, tips, A)}
          </span>
          {[5, 10, 15, 20, 25, 30].map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`live-tip-quick-${v}`}
              onClick={() => setTipAmt(String(v))}
              style={{
                background: String(v) === tipAmt ? C.brass : "transparent",
                border: `1px solid ${C.line}`,
                color: String(v) === tipAmt ? "#0A2B21" : C.cream,
                borderRadius: 6,
                fontSize: 11.5,
                padding: "3px 8px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {v}
            </button>
          ))}
          <input
            data-testid="live-tip-input"
            type="number"
            inputMode="numeric"
            min="1"
            value={tipAmt}
            onChange={(e) => setTipAmt(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") addManualTip(i);
            }}
            placeholder="סכום"
            style={{ ...inputStyle, width: 76, padding: "4px 8px", fontSize: 12.5 }}
          />
          <button
            type="button"
            data-testid="live-tip-confirm"
            disabled={!+tipAmt}
            onClick={() => addManualTip(i)}
            style={{
              background: C.feltDeep,
              border: `1px solid ${C.line}`,
              color: C.cream,
              borderRadius: 8,
              fontSize: 11.5,
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: !+tipAmt ? 0.45 : 1,
            }}
          >
            הוסף טיפ
          </button>
          <button
            type="button"
            data-testid="live-tip-cancel"
            onClick={() => {
              setTipPickerIdx(null);
              setTipAmt("");
            }}
            style={{
              background: "transparent",
              border: `1px solid ${C.line}`,
              color: C.dim,
              borderRadius: 8,
              fontSize: 11.5,
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ביטול
          </button>
        </div>
      )}
      {tipListName === p.name && (
        <div
          style={{
            marginBottom: 8,
            borderTop: `1px dashed ${C.line}`,
            paddingTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {playerTipEvents(tips, p.name, A).length === 0 && (
            <span style={{ fontSize: 11.5, color: C.dim }}>
              אין אירועי טיפ מפורטים הערב
            </span>
          )}
          {playerTipEvents(tips, p.name, A).map((ev) => (
            <div
              key={ev.id}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
            >
              <span style={{ fontVariantNumeric: "tabular-nums" }}>טיפ {ev.amount}</span>
              <span style={{ color: C.dim, fontVariantNumeric: "tabular-nums" }}>
                {new Date(ev.at).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span style={{ color: C.dim }}>
                {isManualTip(ev) ? "מהאפליקציה" : "מהבוט"}
              </span>
              {isManualTip(ev) && tipDelConfirm !== ev.id && (
                <button
                  type="button"
                  data-testid={`live-tip-del-${ev.id}`}
                  onClick={() =>
                    ev.fromCashout ? setTipDelConfirm(ev.id) : deleteManualTip(ev.id)
                  }
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.line}`,
                    color: C.loss,
                    borderRadius: 6,
                    fontSize: 11,
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  מחק
                </button>
              )}
              {isManualTip(ev) && tipDelConfirm === ev.id && (
                <span
                  data-testid={`live-tip-del-confirm-${ev.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 11.5, color: C.dim }}>
                    הטיפ ירד מהיציאה — להחזיר {ev.cashDelta ?? ev.amount} ליציאה?
                  </span>
                  <button
                    type="button"
                    data-testid={`live-tip-del-yes-${ev.id}`}
                    onClick={() => deleteManualTip(ev.id, { restoreCashout: true })}
                    style={{
                      background: C.feltDeep,
                      border: `1px solid ${C.line}`,
                      color: C.cream,
                      borderRadius: 6,
                      fontSize: 11,
                      padding: "2px 8px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    החזר ליציאה
                  </button>
                  <button
                    type="button"
                    data-testid={`live-tip-del-no-${ev.id}`}
                    onClick={() => deleteManualTip(ev.id, { restoreCashout: false })}
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.line}`,
                      color: C.dim,
                      borderRadius: 6,
                      fontSize: 11,
                      padding: "2px 8px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    השאר את היציאה
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <RoundBtn onClick={() => bump(i, -addAmt)}>
            <Minus size={14} />
          </RoundBtn>
          <div style={{ textAlign: "center", minWidth: 70 }}>
            <div
              style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {+p.buyin || 0}₪
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: C.dim,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {playerChips(p, cps)} ג&apos;יטונים
            </div>
          </div>
          <RoundBtn onClick={() => bump(i, addAmt)}>
            <Plus size={14} />
          </RoundBtn>
        </div>
        <LiveExitField
          name={p.name}
          cashout={p.cashout}
          onFocus={() => {
            cashoutDraftRef.current[p.name] = p.cashout;
          }}
          onChange={(e) =>
            setField(i, {
              cashout: e.target.value.replace(/\D/g, ""),
            })
          }
          onBlur={(e) => commitCashout(i, e.target.value.replace(/\D/g, ""))}
        />
      </div>
    </div>
    </React.Fragment>
  );
}
