/* הצבעת שחקן הערב — חישוב טהור + כתיבה.
   הקולות יושבים על הערב עצמו: session.playerOfNightVotes = { שם־מצביע: שם־מועמד }.
   זה אותו דפוס blob כמו שאר שדות הערב בתוך data של הקבוצה — בלי טבלה חדשה.
   החסרון: הכתיבה מהלינק הציבורי צריכה פונקציית שרת (RPC) ייעודית,
   כי לצופים אין כתיבה ישירה ל־groups. */

import { AL, canon } from "./helpers.js";

/** מועמדים להצבעה = מי שישב בערב. */
export function playerOfNightCandidates(session, aliases = {}) {
  const names = [];
  for (const e of session?.entries || []) {
    const name = canon(e.name || "", aliases);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** ספירת קולות של ערב: מוביל, סך קולות, ומפה לפי מועמד. */
export function playerOfNightTally(session, aliases = {}) {
  const votes = session?.playerOfNightVotes && typeof session.playerOfNightVotes === "object"
    ? session.playerOfNightVotes
    : {};
  const candidates = new Set(playerOfNightCandidates(session, aliases));
  const counts = {};
  let total = 0;
  for (const candidate of Object.values(votes)) {
    const name = canon(String(candidate || ""), aliases);
    if (!candidates.has(name)) continue;
    counts[name] = (counts[name] || 0) + 1;
    total += 1;
  }
  let winner = null;
  for (const [name, count] of Object.entries(counts)) {
    if (!winner || count > winner.count) winner = { name, count };
  }
  return { counts, winner, total };
}

/** הצבעה חדשה — מחזיר ערב חדש, או את אותו ערב אם ההצבעה לא תקינה. */
export function voteForPlayer(session, voterName, candidateName, aliases = {}) {
  if (!session || !voterName || !candidateName) return session;
  const voter = canon(String(voterName).trim(), aliases);
  const candidate = canon(String(candidateName).trim(), aliases);
  if (!voter || !playerOfNightCandidates(session, aliases).includes(candidate)) return session;
  return {
    ...session,
    playerOfNightVotes: { ...(session.playerOfNightVotes || {}), [voter]: candidate },
  };
}

/** כמה פעמים כל שחקן זכה בתואר שחקן הערב, על כל הערבים. */
export function playerOfNightWins(db) {
  const A = AL(db || {});
  const wins = {};
  for (const session of db?.sessions || []) {
    const { winner } = playerOfNightTally(session, A);
    if (winner) wins[winner.name] = (wins[winner.name] || 0) + 1;
  }
  return wins;
}

/**
 * הצבעה מהלינק הציבורי — דרך RPC ייעודית (vote_player_of_night).
 * מחזיר את ה־data המעודכן או null אם נכשל (למשל אם המיגרציה עוד לא הורצה).
 */
export async function votePlayerViaRpc(supabase, { slug, sessionId, candidate, voter }) {
  const { data, error } = await supabase.rpc("vote_player_of_night", {
    p_slug: slug,
    p_session_id: sessionId,
    p_candidate: candidate,
    p_voter: voter,
  });
  if (error) {
    console.error("vote_player_of_night failed:", error.message);
    return null;
  }
  return data;
}
