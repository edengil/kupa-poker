/* כרטיס הייפ לפני ערב — חישוב טהור.
   שורת מתח אחת לכרטיס התכנון, רק מנתונים קיימים: טופס חם של הקבוצה,
   רצף פעיל של המוביל, והיריבות הבולטת. אין נתונים — אין שורה. */

import { fmt } from "./format.js";
import { groupHotForm, playerRecentForm } from "./recentForm.js";
import { computeHeadToHead } from "./headToHead.js";

/**
 * @returns {null | { text: string, hotName: string|null }}
 */
export function computeNightHype(db) {
  if (!db?.sessions?.length) return null;

  const hot = groupHotForm(db, { nights: 5, top: 1 });
  const leader = hot?.hot?.[0];
  if (leader && leader.amount > 0) {
    let text = `🔥 ${leader.name} מגיע חם: ${fmt(leader.amount)} ב־${hot.windowN} הערבים האחרונים`;
    const form = playerRecentForm(db, leader.name, { limit: 8 });
    if (form && form.streakType === "win" && form.streak >= 3) {
      text += ` · רצף של ${form.streak} ניצחונות`;
    }
    const h2h = computeHeadToHead(db);
    const rivalry = h2h?.topRivalries?.[0];
    if (rivalry && (rivalry.a === leader.name || rivalry.b === leader.name)) {
      const other = rivalry.a === leader.name ? rivalry.b : rivalry.a;
      text += ` · ${other} באותו שולחן זה תמיד קרב`;
    }
    return { text, hotName: leader.name };
  }

  const h2h = computeHeadToHead(db);
  const rivalry = h2h?.topRivalries?.[0];
  if (rivalry) {
    return {
      text: `⚔️ היריבות הגדולה: ${rivalry.a} מול ${rivalry.b} — ${rivalry.nights} ערבים יחד, והפער ביניהם ${fmt(rivalry.gap)}`,
      hotName: null,
    };
  }

  return null;
}
