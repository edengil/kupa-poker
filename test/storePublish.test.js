import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  configureStore,
  makeReadOnlyStore,
  subscribeStoreKey,
  publishStoreKey,
  seedStoreLive,
  DB_KEY,
  LIVE_KEY,
} from "../lib/store.js";

/* ============================================================================
   אימוץ מרוחק שקט — מנגנון הפרסום/מנוי של החנות.

   רענוני רקע (מיזוג ב־flush, checkLive, סימון שולם של צופה) מנחיתים נתוני
   שרת במטמון החנות ומפרסמים את המפתח; רכיבים שמחזיקים את הערך במצב מקומי
   מאמצים אותו במקום. הבדיקות כאן נועלות את חוזה המנגנון עצמו: פרסום מגיע
   רק למנויי המפתח, ביטול מנוי עובד, וזריעת לייב (הנתיב של checkLive ושל
   אימוץ ב־flush) מפרסמת את מפתח הלייב.
   ============================================================================ */

describe("store publish/subscribe — אימוץ מרוחק שקט", () => {
  let offs = [];
  const sub = (key, fn) => {
    const off = subscribeStoreKey(key, fn);
    offs.push(off);
    return off;
  };

  beforeEach(() => {
    offs = [];
  });
  afterEach(() => {
    for (const off of offs) off();
    offs = [];
    vi.restoreAllMocks();
  });

  it("פרסום מגיע למנויי אותו מפתח בלבד", () => {
    const onDb = vi.fn();
    const onLive = vi.fn();
    sub(DB_KEY, onDb);
    sub(LIVE_KEY, onLive);

    publishStoreKey(DB_KEY);
    expect(onDb).toHaveBeenCalledTimes(1);
    expect(onDb).toHaveBeenCalledWith(DB_KEY);
    expect(onLive).not.toHaveBeenCalled();

    publishStoreKey(LIVE_KEY);
    expect(onLive).toHaveBeenCalledTimes(1);
    expect(onDb).toHaveBeenCalledTimes(1);
  });

  it("ביטול מנוי מפסיק את ההתראות; מנוי אחר לאותו מפתח ממשיך", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = sub(DB_KEY, a);
    sub(DB_KEY, b);

    offA();
    publishStoreKey(DB_KEY);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("פרסום בלי מנויים הוא no-op, ומנוי שזורק לא שובר את שאר המנויים", () => {
    expect(() => publishStoreKey(DB_KEY)).not.toThrow();
    const ok = vi.fn();
    sub(DB_KEY, () => {
      throw new Error("boom");
    });
    sub(DB_KEY, ok);
    expect(() => publishStoreKey(DB_KEY)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("זריעת לייב במטמון מפרסמת את מפתח הלייב — והערך נקרא מהחנות", async () => {
    /* חנות קריאה־בלבד כמימוש פעיל: seedLive שלה הוא no-op, אבל חוזה
       הזריעה של שכבת החנות (seedStoreLive) חייב לפרסם בכל מימוש. */
    configureStore(makeReadOnlyStore({ data: { sessions: [] }, config: {} }));
    const onLive = vi.fn();
    sub(LIVE_KEY, onLive);
    seedStoreLive({ players: [{ name: "א", buyin: 50, cashout: "300" }] });
    expect(onLive).toHaveBeenCalledTimes(1);
    expect(onLive).toHaveBeenCalledWith(LIVE_KEY);
  });
});
