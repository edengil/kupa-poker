"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { summaryCardData } from "../../lib/poker/summaryCard";
import { buildSummaryCardSvg } from "../../lib/poker/summaryCardSvg";




export function SummaryCardButton({ db, scope }) {
  const data = useMemo(() => summaryCardData(db, scope), [db, scope]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  if (!data) return null;

  const share = async () => {
    setBusy(true);
    setNote("");
    try {
      const svg = buildSummaryCardSvg(data);
      const svgUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
      );
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = svgUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0A2B21";
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.drawImage(img, 0, 0, 1080, 1080);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("יצירת התמונה נכשלה");
        const fileName = `kupa-poker-${data.kind === "month" ? data.label : data.y}.png`;
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: data.title });
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          setNote("הכרטיס ירד כקובץ תמונה — אפשר לשלוח אותו לקבוצה 📤");
        }
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setNote("לא הצלחנו ליצור את הכרטיס כרגע — נסו שוב");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ margin: "10px 2px 0" }}>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        style={{
          width: "100%",
          padding: "11px 12px",
          borderRadius: 10,
          border: `1px solid ${C.brass}`,
          background: C.brass,
          color: C.feltDeep,
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "יוצר כרטיס…" : "🎴 שתף כרטיס סיכום מעוצב"}
      </button>
      {note && (
        <p role="status" style={{ fontSize: 12, color: C.dim, margin: "6px 2px 0" }}>
          {note}
        </p>
      )}
    </div>
  );
}
