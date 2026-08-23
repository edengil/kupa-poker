/* מחמאות לטיפים בוואטסאפ — משפטים מלאים שמרגישים טוב.
   {name} ו-{amount} מוחלפים בזמן שליחה.
   שקיות נפרדות לזכר/נקבה (אורן, עדן לירז וכו' — לא "תותח"/"גבר"). */

export const TIP_COMPLIMENTS_MALE = [
  "{name} תותח! 🔥 כל הכבוד על הטיפ {amount} 👏",
  "{name} מלך! 👑 כל הכבוד על הטיפ {amount} 💛",
  "{name} אלוף! 🏆 שיחקת אותה עם הטיפ {amount} 🔥",
  "{name} גבר! 💪 כל הכבוד על הפרגון · טיפ {amount} 👏",
  "{name} אין עליך! ⭐ כל הכבוד על הטיפ {amount} 🙌",
  "{name} לב של זהב! 💛 תודה על הטיפ {amount} ✨",
  "{name} כבוד! 🫡 כל הכבוד על הטיפ {amount} 👏",
  "{name} וואחד מלך! 👑🔥 כל הכבוד על הטיפ {amount}",
  "{name} שחקן אמיתי! ♠️ כל הכבוד על הפרגון · טיפ {amount} 👏",
  "{name} כזה נותנים! 💎 כל הכבוד על הטיפ {amount} 🙌",
  "{name} סחטיין עליך! 🔥 כל הכבוד על הטיפ {amount} 👏",
  "{name} אש! 🔥🔥 כל הכבוד על הטיפ {amount}",
  "{name} חבל על הזמן! 🚀 כל הכבוד על הפרגון · טיפ {amount}",
  "{name} מגיע לך במהלך! ✨ כל הכבוד על הטיפ {amount} 💛",
  "{name} פרגן כמו גדול! 🤝 כל הכבוד על הטיפ {amount} 👏",
  "{name} זה הסטנדרט! ♠️🔥 כל הכבוד על הטיפ {amount}",
  "{name} נשמה! 💫 כל הכבוד על הטיפ {amount} 🙌",
  "{name} כבוד גדול לשולחן! 🫡💛 כל הכבוד על הטיפ {amount}",
  "{name} תותח על! 💥 כל הכבוד על הטיפ {amount} 👏",
  "{name} מלך הפרגון! 👑 כל הכבוד על הטיפ {amount} 🔥",
  "{name} יא אלוף! 🏆 כל הכבוד על הטיפ {amount} 💛",
  "{name} פשוט כבוד! 🫡✨ כל הכבוד על הטיפ {amount}",
  "{name} כזה משאירים חותם! 💎 כל הכבוד על הטיפ {amount} 👏",
  "{name} גבר עם לב! 💪💛 כל הכבוד על הטיפ {amount}",
];

export const TIP_COMPLIMENTS_FEMALE = [
  "{name} תותחית! 🔥 כל הכבוד על הטיפ {amount} 👏",
  "{name} מלכה! 👑 כל הכבוד על הטיפ {amount} 💛",
  "{name} אלופה! 🏆 שיחקת אותה עם הטיפ {amount} 🔥",
  "{name} אין עלייך! ⭐ כל הכבוד על הטיפ {amount} 🙌",
  "{name} לב של זהב! 💛 תודה על הטיפ {amount} ✨",
  "{name} כבוד! 🫡 כל הכבוד על הטיפ {amount} 👏",
  "{name} וואחד מלכה! 👑🔥 כל הכבוד על הטיפ {amount}",
  "{name} שחקנית אמיתית! ♠️ כל הכבוד על הפרגון · טיפ {amount} 👏",
  "{name} כזה נותנות! 💎 כל הכבוד על הטיפ {amount} 🙌",
  "{name} סחטיין עלייך! 🔥 כל הכבוד על הטיפ {amount} 👏",
  "{name} אש! 🔥🔥 כל הכבוד על הטיפ {amount}",
  "{name} חבל על הזמן! 🚀 כל הכבוד על הפרגון · טיפ {amount}",
  "{name} מגיע לך במהלך! ✨ כל הכבוד על הטיפ {amount} 💛",
  "{name} פרגנה כמו גדולה! 🤝 כל הכבוד על הטיפ {amount} 👏",
  "{name} זה הסטנדרט! ♠️🔥 כל הכבוד על הטיפ {amount}",
  "{name} נשמה! 💫 כל הכבוד על הטיפ {amount} 🙌",
  "{name} כבוד גדול לשולחן! 🫡💛 כל הכבוד על הטיפ {amount}",
  "{name} תותחית על! 💥 כל הכבוד על הטיפ {amount} 👏",
  "{name} מלכת הפרגון! 👑 כל הכבוד על הטיפ {amount} 🔥",
  "{name} יא אלופה! 🏆 כל הכבוד על הטיפ {amount} 💛",
  "{name} פשוט כבוד! 🫡✨ כל הכבוד על הטיפ {amount}",
  "{name} כזה משאירות חותם! 💎 כל הכבוד על הטיפ {amount} 👏",
  "{name} אישה עם לב! 💪💛 כל הכבוד על הטיפ {amount}",
  "{name} מדהימה! ✨ כל הכבוד על הטיפ {amount} 👏",
];

/** תאימות לאחור — ברירת מחדל זכר */
export const TIP_COMPLIMENTS = TIP_COMPLIMENTS_MALE;

const bagKey = (female) => (female ? "tipComplimentBagF" : "tipComplimentBagM");
const lastKey = (female) => (female ? "tipComplimentLastF" : "tipComplimentLastM");

/**
 * בוחר משפט מחמאה לפי מגדר — שקיות נפרדות שלא יתערבבו.
 * @returns {{ template: string, bag: number[], last: number, female: boolean }}
 */
export function nextTipCompliment(live, { female = false } = {}) {
  const list = female ? TIP_COMPLIMENTS_FEMALE : TIP_COMPLIMENTS_MALE;
  const n = list.length;
  const bk = bagKey(female);
  const lk = lastKey(female);
  let bag = Array.isArray(live?.[bk]) ? [...live[bk]] : [];
  // תאימות לאחור: אם יש שקית ישנה בלי מגדר — משתמשים בה לזכר בלבד
  if (!bag.length && !female && Array.isArray(live?.tipComplimentBag)) {
    bag = [...live.tipComplimentBag];
  }
  if (!bag.length) {
    bag = Array.from({ length: n }, (_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const last = live?.[lk] ?? (!female ? live?.tipComplimentLast : null);
    if (last != null && bag[0] === last && bag.length > 1) {
      const swap = 1 + Math.floor(Math.random() * (bag.length - 1));
      [bag[0], bag[swap]] = [bag[swap], bag[0]];
    }
  }
  const idx = bag.shift();
  return {
    template: list[idx] || list[0],
    bag,
    last: idx,
    female,
    bagKey: bk,
    lastKey: lk,
  };
}

/** ממלא שם וסכום במשפט (בלי "ג'"). */
export function formatTipCompliment(template, name, amount) {
  return String(template || "")
    .replaceAll("{name}", name)
    .replaceAll("{amount}", String(amount));
}
