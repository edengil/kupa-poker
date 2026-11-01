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
  if (!player) return player;
  const target = r2(+newBuyin || 0);
  const current = r2(+player.buyin || 0);
  if (target === current) return player;

  const events = Array.isArray(player.buyinEvents) ? player.buyinEvents : null;
  if (!events || !events.length) return { ...player, buyin: target };

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

  const kept = next.filter((e, j) => e.amount > 0 || j === 0);
  let run = 0;
  const buyinEvents = kept.map((e) => {
    run = r2(run + e.amount);
    return { ...e, total: run, pot: withPot(e, savings5) };
  });
  return { ...player, buyin: target, buyinEvents };
}
