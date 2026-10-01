"use client";

import { C } from "../../../lib/poker/colors";
import { inputStyle } from "../ui";
import { LiveBitShare } from "./LiveShare";

/** סיכום הקופה, מונה הכניסות וכפתורי שיתוף הביט. */
export function LivePotPanel({
  pot,
  potChips,
  entriesCount,
  setEntriesCount,
  entriesUsed,
  entriesLeft,
  bitReport,
  waSend,
  setShare,
}) {
  return (
    <div
      style={{
        marginTop: 12,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          fontSize: 13.5,
        }}
      >
        <span style={{ color: C.dim }}>בקופה</span>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>
          {pot}₪ · {potChips} ג&apos;יטונים
        </b>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          alignItems: "flex-end",
        }}
      >
        <label style={{ flex: 1, fontSize: 11.5, color: C.dim }}>
          כניסות שהכנתי
          <input
            value={entriesCount}
            onChange={(e) => setEntriesCount(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            style={{
              ...inputStyle,
              marginTop: 3,
              width: "100%",
              textAlign: "center",
            }}
          />
        </label>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 12.5,
            color: C.dim,
            paddingBottom: 9,
          }}
        >
          בשימוש <b style={{ color: C.cream }}>{entriesUsed}</b> · נותרו{" "}
          <b style={{ color: C.brass }}>{entriesLeft === null ? "—" : entriesLeft}</b> בחוץ
        </div>
      </div>
      <LiveBitShare
        onSendUpdate={() => waSend(bitReport)}
        onPreview={() => setShare({ raw: bitReport })}
      />
    </div>
  );
}
