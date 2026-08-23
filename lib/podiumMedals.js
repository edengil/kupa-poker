/** מדליות מקום 1–3 לרשימת זוכים (כבר ממוינת יורד). תיקו = אותה מדליה; דילוג אולימפי. */
const PLACE = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * @template T
 * @param {T[]} itemsSortedDesc
 * @param {(item: T) => number} getScore
 * @returns {{ item: T, medal: string }[]}
 */
export function assignPodiumMedals(itemsSortedDesc, getScore) {
  const out = [];
  let i = 0;
  let place = 1;
  while (i < itemsSortedDesc.length) {
    const score = getScore(itemsSortedDesc[i]);
    let j = i + 1;
    while (j < itemsSortedDesc.length && getScore(itemsSortedDesc[j]) === score) j++;
    const medal = place <= 3 ? PLACE[place] || "" : "";
    for (let k = i; k < j; k++) out.push({ item: itemsSortedDesc[k], medal });
    place += j - i;
    i = j;
  }
  return out;
}
