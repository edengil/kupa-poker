import { canon, potForBuyin, r2 } from "@/lib/poker/helpers";
import { appendAction } from "@/lib/liveActionLog";
import {
  applyBuyinEdit,
  applyBuyinEditWithChanges,
  parseBuyinEditInput,
} from "@/lib/liveBuyinEdit";
import { setConfig } from "@/lib/poker/config";

/* פעולות השחקן והקנייה של טאב הלייב (הושבה, קנייה/תיקון, עריכת סכום,
   יציאה, הסרה) — חולצו מ־LiveTab (גל 8, 8.2) כמפעל שמקבל את מצב
   הקומפוננטה ואת מגדיריו ומחזיר את המטפלים. אותו קוד בדיוק. */
export function createLivePlayerActions({
  players,
  aliases,
  addAmt,
  savings5,
  startedAt,
  planSnap,
  db,
  commit,
  onGameStart,
  rsvpRowsRef,
  cashoutDraftRef,
  setPlayers,
  setActionLog,
  setName,
  setStartedAt,
  setPlanSnap,
  setPrompt,
}) {
  const A = aliases;
  const addPlayer = (nm) => {
    nm = canon(String(nm || "").trim(), A);
    if (!nm || players.some((p) => canon(p.name, A) === nm)) return;
    /* שחקן ראשון פותח את המשחק — מצלמים את ההזמנה ואת אישורי ההגעה
       לפני שהתוכנית נמחקת, כדי לשמור צילום נוכחות עם הערב. */
    const isGameStart = players.length === 0 && !startedAt;
    if (isGameStart) {
      // משחק נפתח — מדליקים את הבוט בשרת בוודאות, בלי להסתמך על המטמון
      // המקומי (שעלול לחשוב שהוא כבר דלוק כשבשרת הוא כבוי)
      setConfig({ botOn: true });
      if (typeof onGameStart === "function") onGameStart();
      // ההזמנה לערב כבר התממשה — מסירים כדי שלא יישאר "מחכה לערב"
      if (db.plan) commit({ ...db, plan: null });
    }
    if (isGameStart && !planSnap) {
      setPlanSnap(
        db.plan
          ? {
              planIso: db.plan.iso,
              location: db.plan.location,
              note: db.plan.note,
              rsvpRows: rsvpRowsRef.current,
            }
          : null
      );
    }
    setPlayers((p) => {
      if (p.length === 0 && !startedAt) {
        setStartedAt(Date.now());
      }
      // 5% לקופת החיסכון — החוב נשאר מלא, הקופה בנוסחה האחת (potForBuyin)
      const toPot = savings5 ? potForBuyin(addAmt) : 0;
      return [
        ...p,
        {
          name: nm,
          buyin: addAmt,
          cashout: "",
          buyinEvents: [{ amount: addAmt, at: Date.now(), total: addAmt, pot: toPot || undefined }],
        },
      ];
    });
    setActionLog((log) => appendAction(log, { t: "seat", name: nm, amount: addAmt }));
    setName("");
  };
  const GRACE_MS = 10 * 60 * 1000; // 10 דק' חסד בתחילת המשחק — לא מציעים לשלוח
  const bump = (i, amt) => {
    const at = Date.now();
    const nm = players[i] && players[i].name;
    // 5% לקופת החיסכון (רק בקנייה חיובית) — החוב נשאר מלא
    const toPot = savings5 && amt > 0 ? potForBuyin(amt) : 0;
    if (amt < 0) {
      /* מינוס הוא תיקון רישום, לא "קנייה שלילית": מנותב דרך מנגנון עריכת
         הקנייה (גל 4, 4.3) — האירועים מתכווצים יחד עם ה־buyin, כך
         ש־Σevents = buyin תמיד, ולוח הריבאיים ובדיקת האיזון מדויקים.
         שינויי האירועים נרשמים ביומן, והביטול ישחזר לפי זהות (4.4). */
      const p = players[i];
      if (!p) return;
      const target = Math.max(0, r2((+p.buyin || 0) + amt));
      const { player: nextP, changes } = applyBuyinEditWithChanges(p, target, { savings5 });
      if (nextP === p) return;
      setPlayers((list) => list.map((x, j) => (j === i ? nextP : x)));
      if (nm) {
        setActionLog((log) =>
          appendAction(log, { t: "buyin", name: nm, amount: amt, eventChanges: changes })
        );
      }
      return;
    }
    setPlayers((p) =>
      p.map((x, j) => {
        if (j !== i) return x;
        const buyin = Math.max(0, r2((+x.buyin || 0) + amt));
        const next = { ...x, buyin };
        if (amt > 0) {
          const events = [...(x.buyinEvents || [])];
          events.push({ amount: amt, at, total: buyin, pot: toPot || undefined });
          next.buyinEvents = events;
        }
        return next;
      })
    );
    // eventAt = חותמת האירוע שנוצר — הביטול מסיר לפי זהות, לא לפי מיקום (4.4)
    if (nm && amt) setActionLog((log) => appendAction(log, { t: "buyin", name: nm, amount: amt, ...(amt > 0 ? { eventAt: at } : {}) }));
    if (amt > 0 && startedAt && Date.now() - startedAt > GRACE_MS) {
      setPrompt({
        name: nm,
        amt,
        id: Date.now(),
      });
    }
  };
  /* עריכה ישירה של סכום הקנייה (הקשה על הסכום בכרטיס) — תיקון רישום:
     בלי חלון בקשת תשלום ובלי אירוע קנייה חדש; היומן שומר צילום "לפני"
     כדי שביטול ישחזר בדיוק. קלט לא תקין / ערך זהה → בלי שינוי ובלי יומן. */
  const editBuyin = (i, raw) => {
    const p = players[i];
    if (!p) return;
    const parsed = parseBuyinEditInput(raw);
    if (!parsed.ok) return;
    const prev = r2(+p.buyin || 0);
    if (parsed.value === prev) return;
    const before = {
      buyin: prev,
      buyinEvents: Array.isArray(p.buyinEvents)
        ? p.buyinEvents.map((e) => ({ ...e }))
        : p.buyinEvents,
    };
    setPlayers((list) =>
      list.map((x, j) => (j === i ? applyBuyinEdit(x, parsed.value, { savings5 }) : x))
    );
    setActionLog((log) =>
      appendAction(log, { t: "buyinEdit", name: p.name, before, after: parsed.value })
    );
  };
  const setField = (i, patch) =>
    setPlayers((p) =>
      p.map((x, j) =>
        j === i
          ? {
              ...x,
              ...patch,
            }
          : x
      )
    );
  const commitCashout = (i, nextCashout) => {
    const p = players[i];
    if (!p) return;
    const before =
      cashoutDraftRef.current[p.name] !== undefined
        ? cashoutDraftRef.current[p.name]
        : p.cashout;
    const chips = String(nextCashout ?? "");
    if (String(before ?? "") === chips) return;
    setField(i, { cashout: chips });
    setActionLog((log) =>
      appendAction(log, { t: "cashout", name: p.name, chips, before: before ?? "" })
    );
    delete cashoutDraftRef.current[p.name];
  };
  const rm = (i) => {
    const p = players[i];
    if (!p) return;
    setActionLog((log) =>
      appendAction(log, { t: "remove", name: p.name, at: i, player: { ...p } })
    );
    setPlayers((list) => list.filter((_, j) => j !== i));
  };

  return { addPlayer, bump, editBuyin, setField, commitCashout, rm };
}
