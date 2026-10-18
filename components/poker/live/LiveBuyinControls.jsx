"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";

/**
 * פקדי קנייה בלייב — חולצו מ־LiveTab.jsx (פיצול 2026-10-16):
 * מתג 5% לקופת החיסכון + בורר סכום כניסה. מצגת טהורה, בלי state משלה.
 */
export function LiveBuyinControls({ savings5, onToggleSavings, addAmt, onAddAmt, cps }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
          fontSize: 13,
        }}
      >
        <button
          type="button"
          onClick={onToggleSavings}
          style={{
            fontSize: 13,
            padding: "6px 12px",
            borderRadius: 8,
            cursor: "pointer",
            border: "none",
            fontWeight: savings5 ? 700 : 500,
            background: savings5 ? C.brass : C.card,
            color: savings5 ? C.feltDeep : C.cream,
          }}
        >
          {savings5 ? "✓ " : ""}5% לקופת החיסכון
        </button>
        {savings5 && (
          <span style={{ color: C.brass, fontSize: 12 }}>
            השחקן מקבל {Math.round(addAmt * 0.95 * cps)} ג&apos;יטונים
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          fontSize: 13,
        }}
      >
        <span style={{ color: C.dim }}>סכום כניסה:</span>
        {[25, 50, 100].map((u) => (
          <button
            key={u}
            onClick={() => onAddAmt(u)}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
              border: "none",
              fontWeight: addAmt === u ? 700 : 500,
              background: addAmt === u ? C.brass : C.card,
              color: addAmt === u ? C.feltDeep : C.cream,
            }}
          >
            {u}₪
          </button>
        ))}
        <span style={{ color: C.dim, fontSize: 12 }}>
          = {addAmt * cps} ג&apos;יטונים
        </span>
      </div>
    </>
  );
}
