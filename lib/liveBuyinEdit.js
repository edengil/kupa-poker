/* עריכה ישירה של סכום הקנייה בכרטיס שחקן בלייב (הקשה על הסכום → הקלדת סכום כולל חדש).
   זו פעולת תיקון רישום, לא קנייה חדשה — לכן:
   • אין אירוע קנייה נוסף ואין שינוי במספר הכניסות/ריבאיים במצב הרגיל.
   • סכום האירועים נשאר שווה ל־buyin, וחלקי הקופה (pot) נשארים 5% מהסכומים —
     אחרת תצוגת הג'יטונים ((buyin − Σ pot) × cps) היתה נשברת, כמו שקורה היום
     בכפתור המינוס שמשאיר את האירועים לא נגועים.

   מנגנון האירועים: מתאימים את האירוע האחרון בהפרש; אם ההפרש השלילי גדול
   מהאירוע האחרון, ממשיכים אחורה (LIFO — סדר הביטול), ואירוע שהתאפס נמחק,
   חוץ מהראשון שתמיד נשאר (גם בסכום 0). מספר האירועים לא משתנה בעריכה הרגילה,
   ולכן pickBuyinEvents במיזוג (הרשימה הארוכה מנצחת, בשוויון המקומית) לא מחיה
   את העריכה מחדש. */

const r2 = (v) => Math.round(v * 100) / 100;

/** תקרה שפויה לסכום קנייה כולל לשחקן בערב אחד. */
export const MAX_BUYIN_EDIT = 100000;

/**
 * מפרסר קלט עריכה. מחזיר { ok: true, value } או { ok: false } —
 * קלט ריק/לא מספרי/שלילי/מעל התקרה נדחה, והקורא חוזר לערך הקודם בלי שינוי.
 */
export function parseBuyinEditInput(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { ok: false };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  const value = r2(Number(s));
  if (!Number.isFinite(value) || value < 0 || value > MAX_BUYIN_EDIT) {
    return { ok: false };
  }
  return { ok: true, value };
}

function withPot(event, savings5) {
  /* אירוע נושא חלק קופה אם מתג ה־5% דלוק, או אם כבר היה לו חלק (המתג כובה
     באמצע הערב — מה שכבר נלקח לקופה נשאר חלק מהרשומה). */
  const hasPot = savings5 || event.pot != null;
  return hasPot && event.amount > 0 ? r2(event.amount * 0.05) : undefined;
}

/**
 * מחיל עריכת סכום כולל על שחקן: buyin = newBuyin, והאירועים מתואמים.
 * ערך זהה לנוכחי → מחזיר את אותו אובייקט (no-op, בלי רשומת יומן אצל הקורא).
 * שחקן בלי buyinEvents (רשומה ישנה) → רק buyin משתנה; לא ממציאים היסטוריה.
 */
export function applyBuyinEdit(player, newBuyin, { savings5 = false } = {}) {
  return applyBuyinEditWithChanges(player, newBuyin, { savings5 }).player;
}

/**
 * כמו applyBuyinEdit, ומחזיר גם את רשימת השינויים באירועים — זהות כל
 * אירוע שנגעו בו (חותמת at + מיקום + סכום לפני/אחרי + צילום האירוע
 * המקורי). כפתור המינוס בלייב רושם את הרשימה ביומן, כדי שהביטול ישחזר
 * לפי זהות האירועים ולא לפי מיקום (גל 4, פריטים 4.3+4.4).
 * after: null = האירוע הוסר בעריכה (התאפס ואינו הראשון).
 */
export function applyBuyinEditWithChanges(player, newBuyin, { savings5 = false } = {}) {
  if (!player) return { player, changes: [] };
  const target = r2(+newBuyin || 0);
  const current = r2(+player.buyin || 0);
  if (target === current) return { player, changes: [] };

  const events = Array.isArray(player.buyinEvents) ? player.buyinEvents : null;
  if (!events || !events.length) return { player: { ...player, buyin: target }, changes: [] };

  let delta = r2(target - current);
  const next = events.map((e) => ({ ...e, amount: r2(+e?.amount || 0) }));
  for (let idx = next.length - 1; idx >= 0 && delta !== 0; idx--) {
    const merged = r2(next[idx].amount + delta);
    if (merged < 0) {
      delta = merged;
      next[idx].amount = 0;
    } else {
      next[idx].amount = merged;
      delta = 0;
    }
  }

  const keptIdx = new Set();
  const kept = next.filter((e, j) => {
    const keep = e.amount > 0 || j === 0;
    if (keep) keptIdx.add(j);
    return keep;
  });
  const changes = [];
  for (let j = 0; j < events.length; j++) {
    const before = r2(+events[j]?.amount || 0);
    const after = keptIdx.has(j) ? next[j].amount : null;
    if (after === null || after !== before) {
      changes.push({
        at: events[j]?.at,
        index: j,
        before,
        after,
        event: { ...events[j], amount: before },
      });
    }
  }

  let run = 0;
  const buyinEvents = kept.map((e) => {
    run = r2(run + e.amount);
    return { ...e, total: run, pot: withPot(e, savings5) };
  });
  return { player: { ...player, buyin: target, buyinEvents }, changes };
}

/** מנרמל רשימת אירועים: total מצטבר + pot נגזר מהסכום (אירוע שהיה לו pot
    שומר עליו ביחס לסכומו החדש; אירוע בלי pot לא מקבל). */
export function recomputeBuyinEvents(events) {
  let run = 0;
  return (events || []).map((e) => {
    const amount = r2(+e?.amount || 0);
    run = r2(run + amount);
    return {
      ...e,
      amount,
      total: run,
      pot: e?.pot != null && amount > 0 ? r2(amount * 0.05) : undefined,
    };
  });
}

/**
 * משחזר שינויים שנרשמו ב־applyBuyinEditWithChanges — לפי זהות (at +
 * סכום־אחרי), לא לפי מיקום: אירוע שהוסר מוחזר למקומו היחסי, אירוע
 * ששונה מקבל חזרה את סכומו ואת ה־pot המקוריים. אירוע שלא נמצא (אירוע
 * זר התערב בינתיים) מדולג — הקורא מסנכרן את הסכום אחר כך.
 */
export function restoreBuyinEventChanges(events, changes) {
  const out = (events || []).map((e) => ({ ...e }));
  const list = [...(changes || [])].sort((a, b) => (b.index || 0) - (a.index || 0));
  for (const ch of list) {
    if (ch.after === null) {
      // האירוע הוסר בעריכה — מחזירים אותו למקום היחסי לפי האינדקס המקורי
      const at = Math.min(Math.max(0, ch.index || 0), out.length);
      out.splice(at, 0, { ...ch.event });
      continue;
    }
    let idx = -1;
    for (let j = out.length - 1; j >= 0; j--) {
      if (out[j].at === ch.at && r2(+out[j].amount || 0) === r2(ch.after)) { idx = j; break; }
    }
    if (idx === -1) {
      for (let j = out.length - 1; j >= 0; j--) {
        if (out[j].at === ch.at) { idx = j; break; }
      }
    }
    if (idx !== -1) out[idx] = { ...out[idx], amount: ch.before, pot: ch.event?.pot };
  }
  return recomputeBuyinEvents(out);
}

/**
 * מסנכרן שחקן לסכום קנייה יעד כשהאירועים הם נקודת המוצא: ההפרש מחושב
 * מול סכום האירועים בפועל (לא מול buyin הרשום) — כך שגם אם אירוע זר
 * נכנס/יצא בינתיים, אחרי הסנכרון Σevents = buyin תמיד (גל 4, 4.4).
 */
export function syncBuyinEvents(player, targetBuyin) {
  if (!player) return player;
  const target = r2(+targetBuyin || 0);
  const events = Array.isArray(player.buyinEvents) ? player.buyinEvents : null;
  if (!events || !events.length) return { ...player, buyin: target };
  const sum = r2(events.reduce((s, e) => s + (+e?.amount || 0), 0));
  if (sum === target) {
    return { ...player, buyin: target, buyinEvents: recomputeBuyinEvents(events) };
  }
  return applyBuyinEdit({ ...player, buyin: sum, buyinEvents: events }, target, { savings5: false });
}
