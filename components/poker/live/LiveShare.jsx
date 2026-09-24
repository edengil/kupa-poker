"use client";

import { Send, X } from "../icons";
import { ShareSheet } from "../ShareSheet";
import { C } from "../../../lib/poker/colors";
import { toWhatsApp, waOpen } from "../../../lib/poker/helpers";

/** כפתורי שליחת דוח הביט מתוך הערב החי. */
export function LiveBitShare({ onSendUpdate, onPreview }) {
  return (
    <>
      <button
        onClick={onSendUpdate}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          border: "none",
          fontSize: 14.5,
          fontWeight: 700,
          cursor: "pointer",
          background: "#25D366",
          color: "#06301B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Send size={17} />
        שלח עדכון ביט לוואטסאפ
      </button>
      <button
        onClick={onPreview}
        style={{
          width: "100%",
          marginTop: 7,
          padding: 9,
          borderRadius: 10,
          border: `1px solid ${C.line}`,
          background: "transparent",
          color: C.dim,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        תצוגה מקדימה של הדוח
      </button>
    </>
  );
}

/** גיליון השיתוף של הסיכום או של עדכון הביט. */
export function LiveShareSheet({ share, dLbl, aliases, onClose }) {
  if (!share) return null;
  return (
    <ShareSheet
      title={share.final ? `סיכום פוקר ${share.d}.${share.mo}` : `עדכון ביט ${dLbl}`}
      text={share.raw !== undefined ? share.raw : toWhatsApp(share.entries, share, null, aliases)}
      settlement={share.settlement}
      onClose={onClose}
    />
  );
}

/** שאלה קצרה אחרי כניסה: לשלוח את הדוח לקבוצה. */
export function LiveSendPrompt({ prompt, bitReport, onDismiss }) {
  if (!prompt) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 76,
        left: 12,
        right: 12,
        zIndex: 30,
        maxWidth: 616,
        margin: "0 auto",
        background: C.card,
        border: `1px solid ${C.brass}`,
        borderRadius: 14,
        padding: "11px 13px",
        boxShadow: "0 6px 24px rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {prompt.name} נכנס עוד {prompt.amt}₪
        </div>
        <div style={{ fontSize: 11.5, color: C.dim }}>לשלוח עדכון לקבוצה?</div>
      </div>
      <button
        onClick={() => {
          waOpen(bitReport);
          onDismiss();
        }}
        style={{
          flexShrink: 0,
          background: "#25D366",
          color: "#06301B",
          border: "none",
          borderRadius: 10,
          padding: "9px 14px",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Send size={15} />
        שלח
      </button>
      <button
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          background: C.feltDeep,
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: 9,
          color: C.dim,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
