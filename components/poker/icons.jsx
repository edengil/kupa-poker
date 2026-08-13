"use client";

import React from "react";

/* ============================================================================
   אייקוני SVG קטנים (סגנון lucide).

   חולצו מ-PokerApp.jsx כחלק מריענון הדרגתי — אותם paths בדיוק,
   רק ב-JSX נקי במקום React.createElement.
   ============================================================================ */

function mkIcon(children) {
  return function Icon({ size = 18, color = "currentColor", style }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
      >
        {children}
      </svg>
    );
  };
}

export const Trash2 = mkIcon(
  <>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </>
);

export const AlertTriangle = mkIcon(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>
);

export const CheckCircle2 = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>
);

export const CalendarDays = mkIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </>
);

export const Pencil = mkIcon(<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />);

export const Users = mkIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </>
);

export const ChevronDown = mkIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronLeft = mkIcon(<path d="m15 18-6-6 6-6" />);
export const ChevronRight = mkIcon(<path d="m9 18 6-6-6-6" />);
export const Crown = mkIcon(<path d="M2 6l4 5 6-8 6 8 4-5v12H2z" />);
export const Plus = mkIcon(<path d="M12 5v14M5 12h14" />);
export const Minus = mkIcon(<path d="M5 12h14" />);

export const Share2 = mkIcon(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </>
);

export const Copy = mkIcon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);

export const TrendingUp = mkIcon(
  <>
    <path d="m22 7-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </>
);

export const X = mkIcon(<path d="M18 6 6 18M6 6l12 12" />);

export const Eye = mkIcon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const Trophy = mkIcon(
  <>
    <path d="M6 9a6 6 0 0 0 12 0V3H6z" />
    <path d="M6 5H3a3 3 0 0 0 3 4M18 5h3a3 3 0 0 1-3 4" />
    <path d="M12 15v3M8 21h8M10 18h4" />
  </>
);

export const Award = mkIcon(
  <>
    <circle cx="12" cy="8" r="6" />
    <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
  </>
);

export const Send = mkIcon(
  <>
    <path d="M22 2 11 13" />
    <path d="M22 2l-7 20-4-9-9-4z" />
  </>
);

export const Download = mkIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </>
);

export const Upload = mkIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </>
);

export const UserPlus = mkIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </>
);

export const Coins = mkIcon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.1 10.4a6 6 0 1 1-8.7 7.7" />
    <path d="M7 6h1v4M16.7 16H18v4" />
  </>
);

export const ClipboardPaste = mkIcon(
  <>
    <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
  </>
);

export const PlayCircle = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m10 8 6 4-6 4z" />
  </>
);

export const BarChart3 = mkIcon(
  <>
    <path d="M3 3v18h18" />
    <path d="M7 16v-5M12 16V8M17 16v-3" />
  </>
);
