import React from "react";
import { C } from "../../lib/poker/colors";

/** כפתור סינון עגול — בשימוש בטאבי שיאים וסיכומים. */
export function ScopeChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.brass : C.line}`,
        background: active ? C.brass : "transparent",
        color: active ? C.feltDeep : C.dim,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
