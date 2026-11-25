/* כרטיס הערב בדף הערבים (18.11, לפי החלטות עדן):
   • שורת הקופה קיימת רק בתצוגת המנהל (adminSessionConfirmations) —
     הנתיב המשותף לצופים (sessionConfirmations) לא מקבל אותה ואת סכומיה.
   • המונה «נסגרו X מתוך Y» כולל את שורת הקופה (החלטה 3).
   • עריכת «בפועל» מהכרטיס עוברת דרך withActual: שורת הקופה מתעדכנת,
     סימון הקופה (potPaid) שורד תמיד, וסימוני שחקנים נודדים לפי זהות
     העברה בדיוק כמו במסלול הדשבורד הקיים.
   • נעילת החלטה 4: שמירת חלוקה ידנית שמשנה העברה מסומנת נחסמת;
     אחרי ביטול הסימון אותה שמירה עוברת.
   • פרטיות: סיכום הוואטסאפ לקבוצה נשאר בלי קופה, והקרנת התשלומים
     לצופה מוציאה את potPaid ואת אירועי הקופה. */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  markTransfer,
  markReceipt,
  markPotPaid,
  markedTransfersBlockingSave,
  markedSaveBlockMessage,
  projectPaymentsForViewer,
} from "../lib/paymentTracking.js";
import {
  adminSessionConfirmations,
  latestNightAdminConfirmations,
  sessionConfirmations,
  potConfirmationStatusText,
} from "../lib/nightConfirmations.js";
import { withActual } from "../lib/poker/potEdits.js";
import { settlementTextForSession, POT_SINK_NAME } from "../lib/nightShare.js";

/* ערב בסגנון 17.11: קופה רשומה 65, עדן חייב ומנתב את הקופה דרכו */
const night1711 = {
  id: "n1711",
  iso: "2026-11-17",
  d: 17,
  mo: 11,
  y: 2026,
  entries: [
    { name: "עדן גיל", amount: -200 },
    { name: "אופיר סנה", amount: 300 },
    { name: "קובי סעדה", amount: -150 },
    { name: "דור לירז", amount: 50 },
  ],
  savingsPot: 65,
};

const markAllPlayers = (session, by = "עדן גיל") => {
  let s = session;
  paymentPlan(s).transfers.forEach((_, i) => {
    s = markTransfer(s, i, true, by);
  });
  return s;
};

describe("שורת הקופה בתצוגת המנהל בלבד", () => {
  it("מופיעה בתצוגת המנהל עם מעביר, סכום וסטטוס — ובנתיב המשותף אין לה זכר", () => {
    const admin = adminSessionConfirmations(night1711);
    expect(admin.potRow).toEqual(
      expect.objectContaining({
        pot: true,
        from: "עדן גיל",
        to: POT_SINK_NAME,
        amount: 65,
        closed: false,
      })
    );
    expect(admin.rows[admin.rows.length - 1]).toBe(admin.potRow);
    expect(admin.rows).toHaveLength(4);

    const shared = sessionConfirmations(night1711);
    expect(shared.rows).toHaveLength(3);
    expect(shared.rows.some((r) => r.pot || r.to === POT_SINK_NAME)).toBe(false);
    expect(JSON.stringify(shared.rows)).not.toContain(POT_SINK_NAME);
  });

  it("latestNightAdminConfirmations מחזיר את הערב האחרון עם שורת הקופה", () => {
    const view = latestNightAdminConfirmations([night1711]);
    expect(view.session.id).toBe("n1711");
    expect(view.potRow.amount).toBe(65);
    expect(latestNightAdminConfirmations([])).toBeNull();
  });

  it("בערב בלי קופה אין שורת קופה גם למנהל", () => {
    const plain = {
      id: "old",
      iso: "2026-07-02",
      d: 2,
      mo: 7,
      y: 2026,
      entries: [
        { name: "אופיר", amount: -30 },
        { name: "קובי", amount: 30 },
      ],
    };
    const admin = adminSessionConfirmations(plain);
    expect(admin.potRow).toBeNull();
    expect(admin.rows).toHaveLength(1);
  });
});

describe("המונה כולל את הקופה (החלטה 3)", () => {
  it("נסגר לגמרי רק כשגם ההפקדה לקופה סומנה", () => {
    let view = adminSessionConfirmations(night1711);
    expect(view.closedCount).toBe(0);
    expect(view.pendingCount).toBe(4);

    const playersMarked = markAllPlayers(night1711);
    view = adminSessionConfirmations(playersMarked);
    expect(view.closedCount).toBe(3);
    expect(view.pendingCount).toBe(1);
    expect(potConfirmationStatusText(view.potRow)).toBe("ממתין");

    const potMarked = markPotPaid(playersMarked, true, "עדן גיל");
    view = adminSessionConfirmations(potMarked);
    expect(view.closedCount).toBe(4);
    expect(view.pendingCount).toBe(0);
    expect(potConfirmationStatusText(view.potRow)).toBe("הופקד · עדן גיל");

    const potUnmarked = markPotPaid(potMarked, false);
    view = adminSessionConfirmations(potUnmarked);
    expect(view.closedCount).toBe(3);
    expect(view.potRow.closed).toBe(false);
  });
});

describe("עריכת בפועל מהכרטיס (withActual) — סימונים והקופה", () => {
  /* גל Pot Boost: הערב מסומן במלואו (כולל potPaid) ולכן מוקפא — עריכת
     ה«בפועל» אחרי ההקפאה לא מזינה את חישוב ההעברות בכלל. היא נראית רק
     בשורת הקופה של המנהל וביתרת הפנקס; תוכנית השחקנים היא השמורה. */
  it("הגדלה 65→80 אחרי הקפאה: שורת הקופה למנהל 80, potPaid שורד, תוכנית השחקנים לא זזה", () => {
    const marked = markPotPaid(markAllPlayers(night1711), true, "עדן גיל");
    const edited = withActual(marked, 80);
    expect(edited.savingsPotActual).toBe(80);
    const plan = paymentPlan(edited);
    expect(plan.potTransfer.amount).toBe(80);
    expect(plan.potPaid).toBe(true);
    const receivedBy = {};
    for (const t of plan.transfers) receivedBy[t.to] = (receivedBy[t.to] || 0) + t.amount;
    // התוכנית השמורה כמות שהיא: אופיר 245 + דור 40 = 285 — שום קיצוץ חדש
    expect(receivedBy["אופיר סנה"] + receivedBy["דור לירז"]).toBe(285);
    expect(adminSessionConfirmations(edited).potRow.amount).toBe(80);
    expect(adminSessionConfirmations(edited).potRow.closed).toBe(true);
  });

  it("הקטנה 65→50 אחרי הקפאה: potPaid שורד וכל הסימונים נשארים על התוכנית השמורה", () => {
    const marked = markPotPaid(markAllPlayers(night1711), true, "עדן גיל");
    const edited = withActual(marked, 50);
    const plan = paymentPlan(edited);
    expect(plan.potTransfer.amount).toBe(50);
    expect(plan.potPaid).toBe(true);
    expect(plan.transfers).toEqual(paymentPlan(marked).transfers);
    expect(plan.paid).toEqual(marked.payments.paid);
    const total = plan.transfers.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBe(285);
  });
});

describe("נעילת העברה מסומנת (החלטה 4)", () => {
  it("שמירה שמשנה העברה מסומנת נחסמת, עם הודעה שמציינת אותה", () => {
    const marked = markTransfer(night1711, 0, true, "עדן גיל");
    const blocked = markedTransfersBlockingSave(marked, [
      { from: "עדן גיל", to: "אופיר סנה", amount: 100, id: "x1" },
    ]);
    expect(blocked).toEqual([
      expect.objectContaining({ from: "עדן גיל", to: "אופיר סנה", amount: 135, paid: true }),
    ]);
    const message = markedSaveBlockMessage(blocked);
    expect(message).toContain("עדן גיל אל אופיר סנה · 135₪");
    expect(message).toContain("בטלו קודם את הסימון");
  });

  it("גם סימון «התקבל» נועל, וגם כשהשינוי עקיף (דרך תשלום ידני אחר)", () => {
    const marked = markReceipt(night1711, 1, true, "אופיר סנה");
    /* הסכומים כפולות־5 ותקינים במנוע §8 (41 הישן היה מתעגל ל־45 ועובר
       את זכאותו המעוגלת של דור, 40 — העורך דוחה אותו עוד לפני הנעילה). */
    const blocked = markedTransfersBlockingSave(marked, [
      { from: "קובי סעדה", to: "דור לירז", amount: 40, id: "x3" },
      { from: "קובי סעדה", to: "אופיר סנה", amount: 60, id: "x4" },
    ]);
    expect(blocked).toEqual([
      expect.objectContaining({ from: "קובי סעדה", to: "אופיר סנה", amount: 110, received: true }),
    ]);
  });

  it("שמירה שמשאירה את ההעברה המסומנת זהה אינה נחסמת", () => {
    const marked = markTransfer(night1711, 0, true, "עדן גיל");
    const blocked = markedTransfersBlockingSave(marked, [
      { from: "עדן גיל", to: "אופיר סנה", amount: 135, id: "x2" },
    ]);
    expect(blocked).toEqual([]);
  });

  it("אחרי ביטול הסימון אותה שמירה בדיוק עוברת", () => {
    const marked = markTransfer(night1711, 0, true, "עדן גיל");
    const payments = [{ from: "עדן גיל", to: "אופיר סנה", amount: 100, id: "x1" }];
    expect(markedTransfersBlockingSave(marked, payments)).toHaveLength(1);
    const unmarked = markTransfer(marked, 0, false);
    expect(markedTransfersBlockingSave(unmarked, payments)).toEqual([]);
  });

  it("בלי סימונים אין חסימה, ושמירה שלא משנה כלום אינה נחסמת", () => {
    expect(
      markedTransfersBlockingSave(night1711, [
        { from: "עדן גיל", to: "אופיר סנה", amount: 100, id: "x1" },
      ])
    ).toEqual([]);
    const marked = markTransfer(night1711, 0, true, "עדן גיל");
    expect(markedTransfersBlockingSave(marked, [])).toEqual([]);
  });
});

describe("פרטיות קופה — הקרנת צופה וסיכום לקבוצה", () => {
  it("הקרנת התשלומים לצופה מוציאה את potPaid ואת אירועי הקופה", () => {
    const marked = markPotPaid(markAllPlayers(night1711), true, "עדן גיל");
    const projected = projectPaymentsForViewer(marked.payments);
    expect("potPaid" in projected).toBe(false);
    expect(
      (projected.confirmations || []).some((e) => e.pot || Number(e.index) === -1)
    ).toBe(false);
    expect(JSON.stringify(projected)).not.toContain(POT_SINK_NAME);
  });

  it("סיכום החלוקה לקבוצה נשאר בלי שורת קופה ובלי סכומיה", () => {
    const text = settlementTextForSession(night1711, { manager: true });
    expect(text).not.toContain(POT_SINK_NAME);
    expect(text.length).toBeGreaterThan(0);
  });
});
