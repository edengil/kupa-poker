/** יומן פעולות בלייב — ביטול כניסה/יציאה בלי למחוק שחקן והיסטוריה. */

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

  switch (action.t) {
    case "seat": {
      nextPlayers = nextPlayers.filter((p) => p.name !== action.name);
      break;
    }
    case "buyin": {
      const i = nextPlayers.findIndex((p) => p.name === action.name);
      if (i === -1) break;
      const p = nextPlayers[i];
      const buyin = Math.max(0, r2((+p.buyin || 0) - (+action.amount || 0)));
      let events = Array.isArray(p.buyinEvents) ? [...p.buyinEvents] : [];
      if (action.amount > 0 && events.length) {
        const last = events[events.length - 1];
        if (+last.amount === +action.amount) events = events.slice(0, -1);
      }
      nextPlayers[i] = { ...p, buyin, buyinEvents: events };
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
      if (nextFills.length) nextFills = nextFills.slice(0, -1);
      break;
    }
    case "tipAdd": {
      /* ביטול הוספת טיפ ידנית = הסרת האירוע מהיומן + החזרת מה שירד מהיציאה,
         בדיוק כמו מחיקה ידנית עם החזר (הביטול הוא LIFO — אין עריכות בינתיים). */
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
