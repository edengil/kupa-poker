import {
  applyCoupleFill,
  DEFAULT_FILL_CHIPS,
} from "@/lib/poker/coupleFills";
import { applyManualTip, removeManualTip } from "@/lib/manualTips";
import { appendAction } from "@/lib/liveActionLog";

/* פעולות הטיפים והמילוי הזוגי של טאב הלייב — חולצו מ־LiveTab
   (גל 8, 8.2) כמפעל שמקבל את מצב הקומפוננטה ואת מגדיריו ומחזיר את
   המטפלים. אותו קוד בדיוק, בלי שום שינוי התנהגות. */
export function createLiveTipActions({
  players,
  tips,
  tipAmt,
  aliases,
  setPlayers,
  setTips,
  setCoupleFills,
  setActionLog,
  setMenuIdx,
  setTipPickerIdx,
  setTipAmt,
  setTipDelConfirm,
}) {
  /* מילוי זוגי: כל לחיצה = 30 ג'יטונים מהערימה של from לשותף.
     תפריט מאפשר לבחור כיוון (אני→שותף / שותף→אני). בלי תווית "תרומה". */
  function doCoupleFill(fromName) {
    const res = applyCoupleFill(players, fromName, DEFAULT_FILL_CHIPS);
    if (!res.ok) {
      if (res.reason === "missing_partner") {
        alert("בן/בת הזוג לא בשולחן — אי אפשר לרשום מילוי.");
      } else if (res.reason === "partner_cashed") {
        alert("אחד מבני הזוג כבר יצא והשני עדיין במשחק — מילוי זוגי אפשרי רק כששניהם באותו מצב.");
      }
      return;
    }
    setPlayers(res.players);
    setCoupleFills((f) => [...f, res.event]);
    setActionLog((log) =>
      appendAction(log, {
        t: "fill",
        from: res.event.from,
        to: res.event.to,
        chips: res.event.chips,
        // זהות האירוע — הביטול מסיר את המילוי הזה בדיוק (גל 4, 4.4)
        fillAt: res.event.at,
      })
    );
    setMenuIdx(null);
  }

  /* הוספת טיפ ידנית מהאפליקציה — גיבוי כשהבוט נפל. אותה סמנטיקה כמו הבוט
     (אירוע ליומן + tipsGiven בלבד — רישום בלבד, היציאה לא משתנה), בלי שום
     הכרזה לקבוצה. נשמר בנתיב מצב־הלייב הרגיל (tips שב־LIVE_KEY) ומתמזג
     לפי מזהה אירוע. */
  function addManualTip(i) {
    const p = players[i];
    if (!p) return;
    const res = applyManualTip({ players, tips, name: p.name, amount: tipAmt, aliases });
    if (!res.ok) return;
    setPlayers(res.players);
    setTips(res.tips);
    setActionLog((log) =>
      appendAction(log, { t: "tipAdd", name: p.name, event: res.event })
    );
    setTipPickerIdx(null);
    setTipAmt("");
  }
  function deleteManualTip(tipId, { restoreCashout = true } = {}) {
    const res = removeManualTip({ players, tips, tipId, aliases, restoreCashout });
    if (!res.ok) return;
    setPlayers(res.players);
    setTips(res.tips);
    setActionLog((log) =>
      appendAction(log, { t: "tipDel", name: res.event.name, event: res.event, cashoutRestored: restoreCashout })
    );
    setTipDelConfirm(null);
  }

  return { doCoupleFill, addManualTip, deleteManualTip };
}
