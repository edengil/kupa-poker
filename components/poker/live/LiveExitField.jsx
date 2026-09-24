"use client";

import { C } from "../../../lib/poker/colors";
import { inputStyle } from "../ui";

/** שדה יציאה בג'יטונים לשחקן אחד. */
export function LiveExitField({ name, cashout, onFocus, onChange, onBlur }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginRight: "auto",
      }}
    >
      <span style={{ fontSize: 11.5, color: C.dim }}>יצא (ג&apos;יטונים)</span>
      <input
        value={cashout}
        onFocus={onFocus}
        onChange={onChange}
        onBlur={onBlur}
        placeholder="—"
        aria-label={`יציאה ${name}`}
        data-testid={`live-cashout-${name}`}
        style={{
          ...inputStyle,
          width: 66,
          textAlign: "center",
          padding: "7px 4px",
        }}
      />
    </div>
  );
}
