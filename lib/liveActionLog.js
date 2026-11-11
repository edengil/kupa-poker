/** יומן פעולות בלייב — ביטול כניסה/יציאה בלי למחוק שחקן והיסטוריה. */

import { restoreBuyinEventChanges, syncBuyinEvents } from "./liveBuyinEdit.js";

const MAX = 40;
const r2 = (v) => Math.round(v * 100) / 100;

export function appendAction(log, action) {
  const next = [...(log || []), { ...action, id: action.id || `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: action.at || Date.now() }];
  return next.length > MAX ? next.slice(next.length - MAX) : next;
}

export function labelAction(action) {
  if (!action) return "";
  switch (action.t) {
    case "seat":
      return `${action.name} נכנס · ${action.amount}₪`;
    case "buyin":
      return action.amount >= 0
        ? `${action.name} +${action.amount}₪`
        : `${action.name} ${action.amount}₪`;
    case "buyinEdit":
      return `${action.name} · קנייה תוקנה ל־${action.after}₪ (היה ${action.before?.buyin ?? "?"}₪)`;
    case "cashout":
      return `${action.name} יצא · ${action.chips} ג׳`;
    case "remove":
      return `${action.name} הוסר מהשולחן`;
    case "fill":
      return `מילוי ${action.chips}ג׳ · ${action.from} → ${action.to}`;
    case "tipAdd":
      return `${action.name} טיפ ${action.event?.amount ?? "?"}ג׳ (ידני)`;
    case "tipDel":
      return `מחיקת טיפ ${action.event?.amount ?? "?"}ג׳ · ${action.name} (ידני)`;
    case "waFail":
      /* כשל שליחת וואטסאפ — נפילה מסודרת: ההודעה לא הגיעה לקבוצה, והכשל
         גלוי למנהל כאן במקום להיבלע בשקט (ראו lib/wa/healthServer). */
      return "⚠️ הודעת הוואטסאפ לא נשלחה לקבוצה";
    default: {
      const _exhaustive = action.t;
      return String(_exhaustive || "פעולה");
    }
  }
}

/* עזרים לביטול טיפים ידניים — מימוש מקומי בלי לייבא מ־liveMerge כדי לא ליצור
   מעגל יבוא (liveMerge מייבא את pickActionLog מכאן). התאמת שחקנים לפי שם מדויק,
   כמו שאר הפעולות ביומן, עם נפילה לשם הקנוני ששמור על האירוע. */
function tipNames(action, ev) {
  return [action && action.name, ev && ev.name].filter(Boolean);
}

function tipPlayerIndex(players, names) {
  return (players || []).findIndex((p) => names.some((n) => p.name === n));
}

function tipLogSum(tips, names) {
  const set = new Set(names);
  return (tips || []).reduce(
    (s, t) => s + (t && set.has(t.name) ? +t.amount || 0 : 0),
    0
  );
}

/**
 * מבטל את הפעולה האחרונה. מחזיר מצב חדש או null אם אין מה לבטל.
 */
export function undoLast({ players = [], tips = [], coupleFills = [], actionLog = [] } = {}) {
  if (!actionLog.length) return null;
  const log = [...actionLog];
  const action = log.pop();
  let nextPlayers = players.map((p) => ({ ...p }));
  let nextFills = [...coupleFills];
  let nextTips = [...(tips || [])];
  let notice = null;

  switch (action.t) {
    case "seat": {
      nextPlayers = nextPlayers.filter((p) => p.name !== action.name);
      break;
    }
    case "waFail": {
      /* רשומת כשל וואטסאפ אינה פעולת מצב — אין מה להחזיר. אבל הביטול
         לא בולע אותה בשקט (גל 4, 4.4): המנהל מקבל הודעה מפורשת שהכשל
         היה ושאין מצב לשחזר. */
      notice = "⚠️ הפעולה האחרונה ביומן היא התראת כשל: הודעת הוואטסאפ לא נשלחה לקבוצה. אין מצב לבטל — הרשומה רק סומנה כנקראה.";
      break;
    }
    case "buyin": {
      const i = nextPlayers.findIndex((p) => p.name === action.name);
      if (i === -1) break;
      const p = nextPlayers[i];
      const amt = +action.amount || 0;
      const target = Math.max(0, r2((+p.buyin || 0) - amt));
      let events = Array.isArray(p.buyinEvents) ? p.buyinEvents.map((e) => ({ ...e })) : [];
      if (Array.isArray(action.eventChanges) && action.eventChanges.length) {
        /* ביטול מינוס (4.3): שחזור לפי זהות האירועים שהעריכה נגעה בהם */
        events = restoreBuyinEventChanges(events, action.eventChanges);
      } else if (amt > 0) {
        /* ביטול תוספת: מסירים את האירוע שהפעולה עצמה יצרה — לפי חותמת
           הזמן שלו (4.4). הקוד הישן הסיר את האירוע האחרון אם סכומו
           התאים, ומחק בכך אירוע של הבוט שנוסף אחרי פעולת האפליקציה
           באותו סכום. רשומת מורשת בלי חותמת שומרת על ההתנהגות הישנה. */
        let idx = -1;
        if (action.eventAt != null) {
          for (let j = events.length - 1; j >= 0; j--) {
            if (events[j].at === action.eventAt && r2(+events[j].amount || 0) === r2(amt)) { idx = j; break; }
          }
          if (idx === -1) {
            for (let j = events.length - 1; j >= 0; j--) {
              if (events[j].at === action.eventAt) { idx = j; break; }
            }
          }
        } else if (events.length && r2(+events[events.length - 1].amount || 0) === r2(amt)) {
          idx = events.length - 1;
        }
        if (idx !== -1) events = events.filter((_, j) => j !== idx);
      }
      /* בכל מקרה מסיימים מסונכרנים: Σevents = buyin גם אם אירוע זר
         (בוט/מכשיר שני) נכנס או יצא בין הפעולה לביטולה. */
      nextPlayers[i] = syncBuyinEvents({ ...p, buyinEvents: events }, target);
      break;
    }
    case "buyinEdit": {
      /* ביטול תיקון קנייה = שחזור מדויק של צילום ה"לפני" (buyin + אירועים),
         כי העריכה יכולה לגעת בכמה אירועים בבת אחת (התאמה אחורה). */
      const i = nextPlayers.findIndex((p) => p.name === action.name);
      if (i === -1 || !action.before) break;
      const beforeEvents = Array.isArray(action.before.buyinEvents)
        ? action.before.buyinEvents.map((e) => ({ ...e }))
        : action.before.buyinEvents;
      nextPlayers[i] = {
        ...nextPlayers[i],
        buyin: action.before.buyin,
        buyinEvents: beforeEvents,
      };
      break;
    }
    case "cashout": {
      const i = nextPlayers.findIndex((p) => p.name === action.name);
      if (i === -1) break;
      nextPlayers[i] = { ...nextPlayers[i], cashout: action.before ?? "" };
      break;
    }
    case "remove": {
      const at = Math.min(Math.max(0, +action.at || 0), nextPlayers.length);
      if (action.player) nextPlayers.splice(at, 0, action.player);
      break;
    }
    case "fill": {
      const chips = +action.chips || 0;
      const reverseAdj = (p, delta) => {
        if (!p) return p;
        if (p.cashout !== "" && p.cashout != null) {
          return { ...p, cashout: String(Math.max(0, (+p.cashout || 0) + delta)) };
        }
        return { ...p, stackAdj: r2((+p.stackAdj || 0) + delta) };
      };
      const fromI = nextPlayers.findIndex((p) => p.name === action.from);
      const toI = nextPlayers.findIndex((p) => p.name === action.to);
      if (fromI !== -1) nextPlayers[fromI] = reverseAdj(nextPlayers[fromI], chips);
      if (toI !== -1) nextPlayers[toI] = reverseAdj(nextPlayers[toI], -chips);
      /* מסירים מהרשימה את המילוי שהפעולה הזו יצרה — לפי זהותו (חותמת +
         כיוון + סכום), לא את האחרון ברשימה (גל 4, 4.4): מילוי ממכשיר
         שני שנרשם אחר כך לא נמחק בטעות. לא נמצא = הרשומה כבר איננה,
         ולא נוגעים במילוי זר. */
      let fillIdx = -1;
      for (let j = nextFills.length - 1; j >= 0; j--) {
        const f = nextFills[j];
        if (!f) continue;
        if (action.fillAt != null && f.at !== action.fillAt) continue;
        if (f.from === action.from && f.to === action.to && r2(+f.chips || 0) === chips) {
          fillIdx = j;
          break;
        }
      }
      if (fillIdx !== -1) nextFills = nextFills.filter((_, j) => j !== fillIdx);
      break;
    }
    case "tipAdd": {
      /* ביטול הוספת טיפ ידנית = הסרת האירוע מהיומן. לאירוע חדש אין מה
         להחזיר ליציאה (טיפ הוא רישום בלבד); לאירוע מורשת עם fromCashout —
         החזרת מה שירד מהיציאה, בדיוק כמו מחיקה ידנית עם החזר (הביטול
         הוא LIFO — אין עריכות בינתיים). */
      const ev = action.event;
      const id = ev && ev.id;
      if (!id) break;
      const found = nextTips.find((t) => t && t.id === id);
      if (!found) break;
      nextTips = nextTips.filter((t) => !(t && t.id === id));
      const names = tipNames(action, found);
      const i = tipPlayerIndex(nextPlayers, names);
      if (i !== -1) {
        const p = nextPlayers[i];
        const next = { ...p };
        if (found.fromCashout && next.cashout !== "" && next.cashout != null) {
          next.cashout = String((+next.cashout || 0) + (found.cashDelta ?? found.amount));
        }
        const sum = tipLogSum(nextTips, names);
        next.tipsGiven = Math.max(sum, r2((+p.tipsGiven || 0) - (+found.amount || 0)));
        nextPlayers[i] = next;
      }
      break;
    }
    case "tipDel": {
      /* ביטול מחיקת טיפ ידנית = החזרת האירוע ליומן בסדר כרונולוגי.
         אם המחיקה החזירה סכום ליציאה — מורידים אותו שוב (בדיוק מה שהוחזר). */
      const ev = action.event;
      if (!ev || !ev.id) break;
      const alreadyInLog = nextTips.some((t) => t && t.id === ev.id);
      if (!alreadyInLog) {
        nextTips = [...nextTips, { ...ev }].sort((a, b) => (+a.at || 0) - (+b.at || 0));
      }
      const names = tipNames(action, ev);
      const i = tipPlayerIndex(nextPlayers, names);
      if (i !== -1) {
        const p = nextPlayers[i];
        const next = { ...p };
        const sum = tipLogSum(nextTips, names);
        const add = alreadyInLog ? 0 : +ev.amount || 0;
        next.tipsGiven = Math.max(sum, r2((+p.tipsGiven || 0) + add));
        if (action.cashoutRestored && ev.fromCashout && next.cashout !== "" && next.cashout != null) {
          next.cashout = String(Math.max(0, (+next.cashout || 0) - (ev.cashDelta ?? ev.amount)));
        }
        nextPlayers[i] = next;
      }
      break;
    }
    default:
      break;
  }

  return {
    players: nextPlayers,
    tips: nextTips,
    coupleFills: nextFills,
    actionLog: log,
    /* הודעה למנהל כשהביטול אינו שינוי מצב (למשל waFail) — הקורא מציג
       אותה במקום שהפעולה "תיבלע" בשקט. */
    notice,
  };
}

/**
 * בוחר איזה יומן לשמור במיזוג לייב מקומי/שרת.
 * יומן מקומי ארוך יותר תמיד נשמר — אחרת ביטול/הסרה נעלמים אחרי remount מהבוט.
 */
export function pickActionLog(localLog, remoteLog, preferRemote) {
  const a = Array.isArray(localLog) ? localLog : [];
  const b = Array.isArray(remoteLog) ? remoteLog : [];
  if (a.length > b.length) return a;
  if (preferRemote && b.length) return b;
  return a.length >= b.length ? a : b;
}
