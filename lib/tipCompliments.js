/* מחמאות לטיפים בוואטסאפ — משפטים מלאים שמרגישים טוב.
   {name} ו-{amount} מוחלפים בזמן שליחה.
   שקית ערבוב בלי חזרה ברצף עד שכל האפשרויות נוצלו. */

export const TIP_COMPLIMENTS = [
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

/**
 * בוחר משפט מחמאה הבא לפי שקית ב-live.tipComplimentBag.
 * @returns {{ template: string, bag: number[], last: number }}
 */
export function nextTipCompliment(live) {
  const n = TIP_COMPLIMENTS.length;
  let bag = Array.isArray(live?.tipComplimentBag) ? [...live.tipComplimentBag] : [];
  if (!bag.length) {
    bag = Array.from({ length: n }, (_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const last = live?.tipComplimentLast;
    if (last != null && bag[0] === last && bag.length > 1) {
      const swap = 1 + Math.floor(Math.random() * (bag.length - 1));
      [bag[0], bag[swap]] = [bag[swap], bag[0]];
    }
  }
  const idx = bag.shift();
  return {
    template: TIP_COMPLIMENTS[idx] || TIP_COMPLIMENTS[0],
    bag,
    last: idx,
  };
}

/** ממלא שם וסכום במשפט (בלי "ג'"). */
export function formatTipCompliment(template, name, amount) {
  return String(template || "")
    .replaceAll("{name}", name)
    .replaceAll("{amount}", String(amount));
}
