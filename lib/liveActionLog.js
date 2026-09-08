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
    default: {
      const _exhaustive = action.t;
      return String(_exhaustive || "פעולה");
    }
  }
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
    default:
      break;
  }

  return {
    players: nextPlayers,
    tips,
    coupleFills: nextFills,
    actionLog: log,
  };
}

/** בוחר איזה יומן לשמור במיזוג לייב מקומי/שרת. */
export function pickActionLog(localLog, remoteLog, preferRemote) {
  const a = Array.isArray(localLog) ? localLog : [];
  const b = Array.isArray(remoteLog) ? remoteLog : [];
  if (preferRemote && b.length) return b;
  return a.length >= b.length ? a : b;
}
