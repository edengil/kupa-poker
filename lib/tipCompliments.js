/* מחמאות לטיפים בוואטסאפ — שקית ערבוב בלי חזרה ברצף עד שכל האפשרויות נוצלו. */

export const TIP_COMPLIMENTS = [
  "תותח",
  "מלך",
  "אלוף",
  "גבר",
  "כבוד",
  "וואחד מלך",
  "אין עליך",
  "שחקן אמיתי",
  "לב של זהב",
  "כזה נותנים",
];

/**
 * בוחר מחמאה הבאה לפי שקית ב-live.tipComplimentBag.
 * @returns {{ compliment: string, bag: number[], last: number }}
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
    compliment: TIP_COMPLIMENTS[idx] || TIP_COMPLIMENTS[0],
    bag,
    last: idx,
  };
}
