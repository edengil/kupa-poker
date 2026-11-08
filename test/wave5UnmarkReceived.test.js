import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markReceipt } from "../lib/paymentTracking.js";
import { sessionConfirmations } from "../lib/nightConfirmations.js";
import { collectNotices } from "../lib/notifications.js";
import { LastSettlementCard } from "../components/poker/LastSettlementCard.jsx";

/* ============================================================================
   גל 5 (החלטת עדן 6, ממצא 32): כלי ביטול סימון «התקבל» —
   מחזיר את ההעברה ל־pending באותם כללי הרשאה ואירועים כמו הסימון.
   (בנתוני ערב 24.10 עצמו לא נוגעים — הסימון שם הוא החלטה נפרדת של עדן.)
   ============================================================================ */

const baseSession = {
  id: "unmark-night",
  iso: "2026-11-05",
  d: 5,
  mo: 11,
  y: 2026,
  entries: [
    { name: "דן לוי", amount: -50 },
    { name: "ירין מלאך", amount: 50 },
  ],
};

describe("ביטול received — לוגיקה", () => {
  it("סימון ואז ביטול: השורה חוזרת ל־pending וההתראה חוזרת", () => {
    const marked = markReceipt(baseSession, 0, true, "ירין מלאך");
    expect(sessionConfirmations(marked).rows[0].closed).toBe(true);
    const dbMarked = { roster: [], aliases: {}, yearly: [], sessions: [marked] };
    expect(
      collectNotices(dbMarked, new Date(2026, 10, 6, 12)).some((i) => i.kind === "transfer")
    ).toBe(false);

    const unmarked = markReceipt(marked, 0, false, "ירין מלאך");
    const view = sessionConfirmations(unmarked);
    expect(view.rows[0].closed).toBe(false);
    expect(view.rows[0].received).toBe(false);
    expect(view.pendingCount).toBe(1);
    const dbOpen = { roster: [], aliases: {}, yearly: [], sessions: [unmarked] };
    expect(
      collectNotices(dbOpen, new Date(2026, 10, 6, 12)).some(
        (i) => i.kind === "transfer" && i.sessionId === "unmark-night"
      )
    ).toBe(true);
    /* הביטול לא מוסיף אירוע confirmation — כמו ביטול paid */
    const confs = (unmarked.payments.confirmations || []).filter((e) => e.action === "received");
    expect(confs).toHaveLength(1);
  });
});

describe("ביטול received — כפתור בכרטיס החלוקה", () => {
  const marked = markReceipt(baseSession, 0, true, "ירין מלאך");
  const db = { roster: [], aliases: {}, yearly: [], sessions: [marked] };
  const render = (props) =>
    renderToString(
      React.createElement(LastSettlementCard, {
        db,
        commit: null,
        readOnly: true,
        onMarkPayment: async () => true,
        ...props,
      })
    );

  it("המקבל רואה את כפתור הביטול", () => {
    expect(render({ viewerName: "ירין מלאך" })).toContain("unmark-received-0");
  });

  it("המעביר לא רואה אותו (הרשאת הביטול = הרשאת הסימון: המקבל/בן־זוג/מנהל)", () => {
    expect(render({ viewerName: "דן לוי" })).not.toContain("unmark-received-0");
  });

  it("צד שלישי לא רואה אותו; המנהל כן", () => {
    expect(render({ viewerName: "אופיר סנה" })).not.toContain("unmark-received-0");
    expect(render({ viewerName: "אופיר סנה", isAdmin: true })).toContain("unmark-received-0");
  });

  it("בלי סימון received — אין כפתור", () => {
    const open = { roster: [], aliases: {}, yearly: [], sessions: [baseSession] };
    const html = renderToString(
      React.createElement(LastSettlementCard, {
        db: open,
        commit: null,
        readOnly: true,
        viewerName: "ירין מלאך",
        onMarkPayment: async () => true,
      })
    );
    expect(html).not.toContain("unmark-received-0");
  });
});
