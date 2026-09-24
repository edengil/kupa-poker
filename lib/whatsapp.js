/* חזית הבוט. המימוש מפוצל: פירוק, החלה, תזכורות, שליחה. */

export { BOT_MARK, ALIASES, resolveAlias, parseCommands, parseCommand, findPlayer } from "./wa/parse.js";
export { applyCommands, applyCommand, helpText } from "./wa/apply.js";
export {
  PENDING_REMIND_MS,
  BIT_IDLE_REMIND_MS,
  lastBitActivityAt,
  maybeRemindPending,
  maybeRemindBitIdle,
} from "./wa/reminders.js";
export {
  sendToGroup,
  listGroups,
  setPresenceOffline,
  resetPresenceThrottleForTests,
  PRESENCE_THROTTLE_MS,
} from "./wa/send.js";
export { extractMessage, isAllowed, isOwner } from "./wa/inbound.js";
