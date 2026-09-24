"use client";

import { AlertTriangle, CheckCircle2 } from "../icons";
import { C } from "../../../lib/poker/colors";
import { fmtGap } from "../../../lib/poker/format";
import { r2 } from "../../../lib/poker/helpers";
import { brassCta, brassCtaMuted } from "../../../lib/poker/festive";
import { labelAction } from "../../../lib/liveActionLog";

/** מאזן יציאות, סיום הערב, ויומן הביטולים לפני החלוקה. */
export function LiveDistributionPanel({
  anyCash,
  netSum,
  cashSumChips,
  potChips,
  cps,
  canFinish,
  onFinish,
  actionLog,
  onUndo,
  onCancelGame,
}) {
  return (
    <>
      {anyCash && (
        <div
          style={{
            marginTop: 10,
            background: C.card,
            border: `1px solid ${netSum === 0 && cashSumChips === potChips ? C.line : C.brass}`,
            borderRadius: 12,
            padding: 13,
            fontSize: 13.5,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ color: C.dim }}>יצא (ג&apos;יטונים)</span>
            <b
              style={{
                fontVariantNumeric: "tabular-nums",
                color: cashSumChips === potChips ? C.cream : C.brass,
              }}
            >
              {cashSumChips} / {potChips}
            </b>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: netSum === 0 && cashSumChips === potChips ? C.win : C.brass,
              fontWeight: 600,
            }}
          >
            {netSum === 0 && cashSumChips === potChips ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            {cashSumChips !== potChips
              ? `הג'יטונים לא תואמים לקופה — פער ${fmtGap(r2((cashSumChips - potChips) / cps))}₪`
              : netSum === 0
                ? "מאוזן"
                : `פער ${fmtGap(netSum)}₪`}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onFinish}
        disabled={!canFinish}
        data-testid="live-finish"
        aria-label="סיים ערב"
        style={{
          ...(canFinish ? brassCta : brassCtaMuted),
          width: "100%",
          marginTop: 12,
          padding: 14,
          borderRadius: 12,
          fontSize: 16,
          cursor: canFinish ? "pointer" : "not-allowed",
        }}
      >
        סיים · שמור · שלח סיכום
      </button>
      {!canFinish && (
        <p role="status" style={{ color: C.dim, fontSize: 13 }}>
          יש להשלים ג׳יטונים ביציאה לכל השחקנים, כולל 0 למי שהפסיד הכול.
        </p>
      )}
      {actionLog.length > 0 && (
        <details style={{ marginTop: 10, color: C.dim, fontSize: 12 }}>
          <summary style={{ cursor: "pointer" }}>יומן פעולות ({actionLog.length})</summary>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 18, lineHeight: 1.7 }}>
            {[...actionLog].reverse().slice(0, 8).map((a) => (
              <li key={a.id}>{labelAction(a)}</li>
            ))}
          </ul>
        </details>
      )}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11.5,
          color: C.dim,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <CheckCircle2 size={13} color={C.win} />
          המשחק נשמר אוטומטית
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {actionLog.length > 0 && (
            <button
              type="button"
              onClick={onUndo}
              title={labelAction(actionLog[actionLog.length - 1])}
              data-testid="live-undo"
              aria-label="בטל אחרון"
              style={{
                background: "none",
                border: "none",
                color: C.brass,
                fontSize: 11.5,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              בטל אחרון
            </button>
          )}
          <button
            onClick={onCancelGame}
            style={{
              background: "none",
              border: "none",
              color: C.loss,
              fontSize: 11.5,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            בטל משחק
          </button>
        </span>
      </div>
    </>
  );
}
