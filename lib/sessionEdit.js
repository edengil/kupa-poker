import { AL, canon } from "./poker/helpers.js";

/**
 * שימור שדות לפי שם (ממצא ביקורת 11): טקסט הסיכום מבטא רק שם ונטו,
 * אבל רשומת ערב שמור נושאת גם buyin/chips/tipsGiven/buyinEvents —
 * נתוני הרקע של החלוקה והסטטיסטיקה. עד גל 5 השמירה מגיליון העריכה
 * החליפה את הרשומות בפרסור הערום והשדות נמחקו בשקט (והחלוקה הידנית
 * של הערב איבדה את הבסיס שלה). עכשיו כל רשומה שנפרסה משויכת לרשומת
 * המקור של אותו שם קנוני (תור־צריכה, כמו שאר מיפויי ההעברות בקובץ
 * התשלומים) ויורשת את כל שדותיה; מהטקסט מנצחים רק name/amount/combined.
 * שחקן שנמחק מהטקסט נעלם, שחקן חדש נשאר כמו שנפרס, ושינוי שם בטקסט
 * מנתק את השיוך (השימור הוא לפי שם — במכוון).
 */
function preserveEntryFields(db, session, entries) {
  const A = AL(db || {});
  const queues = new Map();
  for (const e of session.entries || []) {
    const key = canon(e.name, A);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(e);
  }
  return (entries || []).map((e) => {
    const queue = queues.get(canon(e.name, A));
    if (!queue || !queue.length) return e;
    const orig = queue.shift();
    const merged = { ...orig, name: e.name, amount: e.amount };
    /* combined נכנס רק אם הוא אמיתי מהטקסט או כבר קיים במקור —
       כדי שפתיחה+שמירה בלי שינוי תהיה זהות מלאה גם בצורת השדות
       (רשומת ערב חי לא נושאת combined כשהוא false). */
    if (e.combined || "combined" in orig) merged.combined = e.combined;
    return merged;
  });
}

/** עדכון ערב קיים בלי ליצור כפילות או למחוק טיפים/חלוקה. */
export function applySessionEdit(db, session, { raw, entries, date }) {
  const updated = {
    ...session,
    id: session.id,
    raw,
    entries: preserveEntryFields(db, session, entries),
    d: date.d,
    mo: date.mo,
    y: date.y,
    iso: date.iso,
  };
  const sessions = (db.sessions || []).map((s) => (s.id === session.id ? updated : s));
  return {
    ...db,
    sessions: [...sessions].sort((a, b) => String(a.iso).localeCompare(String(b.iso))),
    deletedSessionIds: (db.deletedSessionIds || []).filter((id) => id !== session.id),
  };
}
