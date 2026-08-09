"use client";

import React from "react";

/* ============================================================================
   הלוגו של עדן — מותאם לפלטת האפליקציה.

   המקור (ערכת המיתוג) בא בטורקיז; כאן הגרדיאנט הוחלף לירוקי הלבד של
   השולחן, הטבעת והנקודה לפליז, והאותיות לקרם — אותם צבעים שכל שאר
   האפליקציה בנויה מהם. אותו SVG בדיוק משמש גם ליצירת אייקוני האפליקציה
   (scripts/make-icons.mjs) — אם משנים כאן, מריצים שוב npm run icons.
   ============================================================================ */

export function EGMark({ size = 64, className, style }) {
  const uid = React.useId ? React.useId().replace(/:/g, "") : "eg";
  const ink = `egFelt_${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Eden Gil"
      role="img"
      className={className}
      style={{
        flexShrink: 0,
        display: "block",
        filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.35))",
        ...style,
      }}
    >
      <defs>
        <linearGradient id={ink} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2C6B54" />
          <stop offset="0.55" stopColor="#15493A" />
          <stop offset="1" stopColor="#0A2B21" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${ink})`} />
      <circle cx="32" cy="32" r="26.5" stroke="rgba(217,164,65,0.45)" strokeWidth="1" />
      <path
        fill="#EFE7D2"
        d="M15.5 20h14.2c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H19.4v4.35h8.6c.8 0 1.35.5 1.35 1.25v1.4c0 .75-.55 1.25-1.35 1.25h-8.6v4.55h10.5c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H15.5c-.85 0-1.45-.55-1.45-1.35V21.35c0-.8.6-1.35 1.45-1.35z"
      />
      <path
        fill="#EFE7D2"
        d="M47.8 22.1c-2.2-2.55-5.55-4.05-9.3-4.05-7.35 0-12.85 5.35-12.85 13.05S31.15 44.1 38.5 44.1c3.55 0 6.75-1.3 9.05-3.55.55-.55.55-1.4.05-1.9l-1.45-1.4c-.5-.5-1.3-.5-1.8.05-1.55 1.5-3.55 2.3-5.85 2.3-4.55 0-7.7-3.2-7.7-7.95s3.15-7.95 7.7-7.95c2.2 0 4.1.75 5.55 2.1.45.4 1.15.4 1.6-.05l1.5-1.5c.5-.5.5-1.3 0-1.8z"
      />
      <path
        fill="#EFE7D2"
        d="M48.2 31.2h-7.4c-.85 0-1.45.6-1.45 1.4v1.7c0 .8.6 1.4 1.45 1.4H45v3.35c0 .75.55 1.3 1.3 1.3h1.55c.75 0 1.3-.55 1.3-1.3V32.6c0-.8-.6-1.4-1.4-1.4z"
      />
      <circle cx="50.5" cy="47.5" r="2.2" fill="#D9A441" />
    </svg>
  );
}

export default EGMark;
