"use client";

import { C } from "../../../lib/poker/colors";
import { brassCta, sectionEyebrow } from "../../../lib/poker/festive";
import { inputStyle } from "../ui";
import { Coins, Plus, UserPlus } from "../icons";

/** כרטיס פתיחת ערב והוספת שחקן, כולל בחירת יחס הג'יטונים. */
export function LivePlayerSetupPanel({ name, setName, addPlayer, known, players, cps, setConfig }) {
  return (
    <div
      style={{
        background: `linear-gradient(165deg, ${C.cardHi} 0%, ${C.card} 100%)`,
        border: `1px solid ${C.brass}44`,
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>♠</span>
        {players.length === 0 ? "פתח ערב חי" : "הוסף לשולחן"}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 11.5,
              color: C.dim,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <UserPlus size={13} />
            הוסף שחקן (חדש או קיים)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer(name)}
            placeholder="שם"
            aria-label="שם שחקן ללייב"
            data-testid="live-player-name"
            style={{ ...inputStyle, marginTop: 4, width: "100%" }}
          />
        </div>
        <button
          type="button"
          onClick={() => addPlayer(name)}
          aria-label="הוסף שחקן"
          data-testid="live-add-player"
          style={{
            ...brassCta,
            borderRadius: 9,
            padding: "11px 15px",
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      {known.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 10,
            maxHeight: 88,
            overflowY: "auto",
          }}
        >
          {known
            .filter((k) => !players.some((p) => p.name === k))
            .map((k) => (
              <button
                key={k}
                onClick={() => addPlayer(k)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 16,
                  background: C.feltDeep,
                  border: `1px solid ${C.line}`,
                  color: C.cream,
                  cursor: "pointer",
                }}
              >
                {k}
              </button>
            ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          fontSize: 12.5,
          color: C.dim,
        }}
      >
        <Coins size={14} />
        <span>1 ש&quot;ח = {cps} ג&apos;יטונים</span>
        <div style={{ display: "flex", gap: 5, marginRight: "auto" }}>
          {[2, 4].map((v) => (
            <button
              key={v}
              onClick={() => setConfig({ chipsPerShekel: v })}
              style={{
                fontSize: 12,
                padding: "3px 9px",
                borderRadius: 7,
                cursor: "pointer",
                border: "none",
                fontWeight: cps === v ? 700 : 500,
                background: cps === v ? C.brass : C.feltDeep,
                color: cps === v ? C.feltDeep : C.cream,
              }}
            >
              ×{v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
