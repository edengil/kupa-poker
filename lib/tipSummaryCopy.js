/* טקסטי הומור לוואטסאפ — סיכום טיפים (מקומות, מחמאות, צחוק על מי שלא
   שם), כתרי סיכום ערב ושורות כניסה חוזרת בבוט.
   מגדר לפי isFemaleName (אורן, עדן לירז וכו'). */

/** מחמאות סלנג למקום ראשון — {name} מוחלף. */
export const FIRST_PLACE_PRAISE_M = [
  "{name} יא מלך — כל הכבוד על הטיפ",
  "{name} אתה נותן טיפים, נזמין אותך לציסר",
  "{name} אח יקר, הטיפ שלך עושה סדר בערב",
  "{name} תותח על הטיפ — כבוד גדול",
  "{name} יא אגדה, ככה מחזיקים שולחן",
  "{name} מלך הטיפים הערב, בלי מילים",
  "{name} על החשבון שלך אפשר לסגור ערב שלם",
  "{name} נדיבות ברמת ציסר עם קינוח",
  "{name} אנרגיית מלך — טיפ כזה זה פשוט יא מלך",
  "{name} פותח כיס כאילו זה על החשבון של כולם",
  "{name} לא רק זוכה — גם מפנק. תותח",
  "{name} ציסר עליך — ככה נראית אגדה עם ארנק",
  "{name} הטיפ שלך אומר: אני מזמין, אתם יושבים",
  "{name} פרגון לפני קופה — מלך אמיתי",
  "{name} רמת נדיבות: מלך. רמת טיפ: אגדה",
  "{name} יא אח, על החשבון שלך השולחן חייך",
  "{name} הטיפ שלך עבר ועדת קבלה בהצטיינות — מלך",
  "{name} נותן טיפ כמו שצריך — בלי לחשבן לאף אחד",
  "{name} יא תותח, הטיפ שלך הגיע לפני הקלפים",
  "{name} אגדה מהלכת — ככה משאירים טיפ",
  "{name} מזמין גם בטיפים — השולחן מודה לך, אח",
  "{name} פותח את הערב ופותח גם את הכיס. מלך",
  "{name} הטיפ שלך שווה ציסר על חשבון הבית, תותח",
  "{name} אח יקר, פרגון כזה זה כבר מותג — מלך הטיפים",
];

export const FIRST_PLACE_PRAISE_F = [
  "{name} יא מלכה — כל הכבוד על הטיפ",
  "{name} את נותנת טיפים, נזמין אותך לציסר",
  "{name} אחות יקרה, הטיפ שלך עושה סדר בערב",
  "{name} תותחית על הטיפ — כבוד גדול",
  "{name} יא אגדה, ככה מחזיקים שולחן",
  "{name} מלכת הטיפים הערב, בלי מילים",
  "{name} על החשבון שלך אפשר לסגור ערב שלם",
  "{name} נדיבות ברמת ציסר עם קינוח",
  "{name} אנרגיית מלכה — טיפ כזה זה פשוט יא מלכה",
  "{name} פותחת כיס כאילו זה על החשבון של כולם",
  "{name} לא רק זוכה — גם מפנקת. תותחית",
  "{name} ציסר עלייך — ככה נראית אגדה עם ארנק",
  "{name} הטיפ שלך אומר: אני מזמינה, אתם יושבים",
  "{name} פרגון לפני קופה — מלכה אמיתית",
  "{name} רמת נדיבות: מלכה. רמת טיפ: אגדה",
  "{name} יא אחות, על החשבון שלך השולחן חייך",
  "{name} הטיפ שלך עבר ועדת קבלה בהצטיינות — מלכה",
  "{name} נותנת טיפ כמו שצריך — בלי לחשבן לאף אחת",
  "{name} יא תותחית, הטיפ שלך הגיע לפני הקלפים",
  "{name} אגדה מהלכת — ככה משאירים טיפ",
  "{name} מזמינה גם בטיפים — השולחן מודה לך, אחות",
  "{name} פותחת את הערב ופותחת גם את הכיס. מלכה",
  "{name} הטיפ שלך שווה ציסר על חשבון הבית, תותחית",
  "{name} אחות יקרה, פרגון כזה זה כבר מותג — מלכת הטיפים",
];

/**
 * שקית צחוקים למי שלא שם טיפ.
 * מחרוזת = ניטרלי / רבים.
 * אובייקט: m / f ליחיד; multi לרבים/מעורב (אם חסר — נופל ל־m).
 */
export const NON_TIPPER_ROASTS = [
  "מה קרה, לא מכניסים את היד לכיס?",
  { m: "טיפ = ברכה. מה, לא תוציא כמה שקלים?", f: "טיפ = ברכה. מה, לא תוציאי כמה שקלים?", multi: "טיפ = ברכה. מה, לא תוציאו כמה שקלים?" },
  "הכיס נעול עם מנעול ביטחוני הערב?",
  "היד לא הגיעה לכיס, אבל לקופה כן?",
  "טיפ זה לא חובה — אבל כבוד זה כן. ולך אין",
  "שכחת טיפ או ששכחת שיש לך כיס?",
  "הערב היד לא יצאה מהכיס?",
  { m: "גם הקופה רעבה, מה לא תשחרר?", f: "גם הקופה רעבה, מה לא תשחררי?", multi: "גם הקופה רעבה, מה לא תשחררו?" },
  { m: "אלה יודעים רק איך לקחת", f: "אלה יודעות רק איך לקחת", multi: "אלה יודעים רק איך לקחת" },
  "הארנק נשאר בבית, או שרק הכיס נשאר סגור?",
  "יד קפוצה כזו — גם פרוטה לא יוצאת",
  "שחקת כל הערב, ובטיפ? פולד.",
  "אלה אם תשים להם סודה ביד שבוע לא יצא הגזים",
  "בונקר של כיס — הטיפ לא עובר את הביצור",
  { m: "הרווחת צ'יפים, אבל פרגון? אפס", f: "הרווחת צ'יפים, אבל פרגון? אפס", multi: "הרווחתם צ'יפים, אבל פרגון? אפס" },
  { m: "גם המלצר היה מתייאש ממך", f: "גם המלצר היה מתייאש ממך", multi: "גם המלצר היה מתייאש מכם" },
  "היד יודעת לקחת קופה — לתת טיפ פחות",
  "שכחת שיש משהו שנקרא כבוד לשולחן?",
  { m: "הכיס שלו נפתח בטביעת אצבע — והאצבע בחופשה", f: "הכיס שלה נפתח בטביעת אצבע — והאצבע בחופשה" },
  "אלרגיה קשה למטבעות, אה?",
  "הכיס עמוק — והיד קצרה",
  { m: "נתת הופעה כל הערב, ובטיפ יצאת בהפסקה", f: "נתת הופעה כל הערב, ובטיפ יצאת בהפסקה", multi: "נתתם הופעה כל הערב, ובטיפ יצאתם בהפסקה" },
  "הטיפ מחכה לאישור מנהל, אה?",
  { m: "גם הצ'יפים שאלו איפה הטיפ שלך", f: "גם הצ'יפים שאלו איפה הטיפ שלך", multi: "גם הצ'יפים שאלו איפה הטיפ" },
  "שומר על הכיס כמו על אס בכיס — לא משחרר",
  { m: "יצאת עם חיוך ועם כיס מלא — חסר רק טיפ", f: "יצאת עם חיוך ועם כיס מלא — חסר רק טיפ", multi: "יצאתם עם חיוך ועם כיס מלא — חסר רק טיפ" },
];

const NON_TIP_PREFIXES = ["🙊 בלי טיפ הערב", "🙊 נעלמו בלי טיפ"];

/** אינדקס סיבוב לפי דקה (יציב באותה דקה). */
function minutePick(len, now = Date.now()) {
  if (!len) return 0;
  return Math.floor(now / 60000) % len;
}

/**
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
function pickNonTipperRoast(names, isFemaleName, now = Date.now()) {
  const entry = NON_TIPPER_ROASTS[minutePick(NON_TIPPER_ROASTS.length, now)];
  if (typeof entry === "string") return entry;
  const n = names.length;
  if (n > 1) {
    const allF = names.every((nm) => isFemaleName(nm));
    if (allF && entry.f) return entry.f;
    return entry.multi || entry.m;
  }
  if (n === 1 && isFemaleName(names[0])) return entry.f || entry.m;
  return entry.m;
}

/**
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatNonTipperLine(names, isFemaleName, now = Date.now()) {
  const list = names.join(", ");
  const prefix = NON_TIP_PREFIXES[minutePick(NON_TIP_PREFIXES.length, now)];
  const roast = pickNonTipperRoast(names, isFemaleName, now);
  /* כל השורה מודגשת בוואטסאפ */
  return `*${prefix}: ${list} — ${roast}*`;
}

/**
 * מחמאה למקום ראשון. כמה שמות בתיקו — מחמאה לפי כולם נשים או לא.
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatFirstPlaceLine(names, isFemaleName, now = Date.now()) {
  const allF = names.length > 0 && names.every((n) => isFemaleName(n));
  const bag = allF ? FIRST_PLACE_PRAISE_F : FIRST_PLACE_PRAISE_M;
  const tpl = bag[minutePick(bag.length, now)];
  const label = names.join(", ");
  const praise = tpl.replace(/\{name\}/g, label);
  return `🥇 מקום ראשון: ${praise}`;
}

/**
 * שורת הכי־מעט שכן שם.
 * @param {string[]} names
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatLowestTipperLine(names, isFemaleName) {
  const list = names.join(", ");
  if (names.length === 1) {
    const f = isFemaleName(names[0]);
    return f
      ? `${list} שמה הכי מעט — ובכל זאת שמה. כבוד.`
      : `${list} שם הכי מעט — ובכל זאת שם. כבוד.`;
  }
  return `${list} שמו הכי מעט — ובכל זאת שמו. כבוד.`;
}

/* ------------------------- כתרי סיכום ערב -------------------------
   שורות סיום לסיכום הערב: כתר לזוכה הגדול וכתר עדין למפסיד הגדול.
   בלי המילים מגיע/חייב ובלי מספרים — כדי שפארסרי הסיכומים (המדביקים
   סיכום חזרה לאפליקציה) לא יזהו אותן כשורות נטו. */

/** כותרי זוכה הערב — זכר. */
export const WINNER_TITLES_M = [
  "מלך השולחן",
  "הבנק המרכזי של הערב",
  "הטייקון של השולחן",
  "אלוף הערב בלי תחרות",
  "האיש שהקופה עברה לגור אצלו",
  "המנצח הגדול של הערב",
];

/** כותרי זוכה הערב — נקבה. */
export const WINNER_TITLES_F = [
  "מלכת השולחן",
  "הבנק המרכזי של הערב",
  "הטייקונית של השולחן",
  "אלופת הערב בלי תחרות",
  "האישה שהקופה עברה לגור אצלה",
  "המנצחת הגדולה של הערב",
];

/** כותרי מפסיד הערב — עדינים ומצחיקים, לא משפילים. זכר. */
export const LOSER_TITLES_M = [
  "מממן הערב הרשמי",
  "התרומה לקהילה לא תישכח",
  "הספונסר של הערב",
  "נתן לכולם סיבה לחייך",
  "המשקיע החברתי של הערב",
  "בנה לכולם את הערב",
];

/** כותרי מפסיד הערב — נקבה. */
export const LOSER_TITLES_F = [
  "מממנת הערב הרשמית",
  "התרומה לקהילה לא תישכח",
  "הספונסרית של הערב",
  "נתנה לכולם סיבה לחייך",
  "המשקיעה החברתית של הערב",
  "בנתה לכולם את הערב",
];

/**
 * שורת כתר לזוכה הגדול של הערב.
 * @param {string} name
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatWinnerTitleLine(name, isFemaleName, now = Date.now()) {
  const bag = isFemaleName(name) ? WINNER_TITLES_F : WINNER_TITLES_M;
  return `👑 ${bag[minutePick(bag.length, now)]}: ${name}`;
}

/**
 * שורת כתר עדינה למפסיד הגדול של הערב.
 * @param {string} name
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatLoserTitleLine(name, isFemaleName, now = Date.now()) {
  const bag = isFemaleName(name) ? LOSER_TITLES_F : LOSER_TITLES_M;
  return `🏧 ${bag[minutePick(bag.length, now)]}: ${name}`;
}

/* ------------------------- כניסה חוזרת בבוט -------------------------
   שורת הומור קצרה כששחקן נכנס בפעם השלישית ומעלה באותו ערב.
   מחרוזת = ניטרלי; אובייקט m/f לפי מגדר השחקן. */
export const REBUY_JOKES = [
  "הארנק כבר עושה צ׳ק־אין לבד",
  "הכיס כבר לא מתרגש — הוא ראה את זה קורה",
  { m: "הוא והקופה כבר ביחסים רציניים", f: "היא והקופה כבר ביחסים רציניים" },
  "עוד סיבוב? השולחן תמיד שמח לארח",
  { m: "הוא לא מוותר — וגם הארנק שלו לא", f: "היא לא מוותרת — וגם הארנק שלה לא" },
];

/** ניסוחי «ניצחון טכני» — הזוכה הגדול זכה ב־10 ₪ או פחות. {name}/{amount} מוחלפים. */
export const TECHNICAL_WIN_LINES_M = [
  "🏅 ניצחון טכני: {name} — זכה ב־{amount} ₪ ומתנהג כאילו לקח טורניר",
  "🏅 ניצחון טכני: {name} — {amount} ₪ בלבד, אבל החגיגה כמו באליפות",
  "🏅 ניצחון טכני: {name} — יצא עם {amount} ₪ ועם סיפור ניצחון לכל השבוע",
];

export const TECHNICAL_WIN_LINES_F = [
  "🏅 ניצחון טכני: {name} — זכתה ב־{amount} ₪ ומתנהגת כאילו לקחה טורניר",
  "🏅 ניצחון טכני: {name} — {amount} ₪ בלבד, אבל החגיגה כמו באליפות",
  "🏅 ניצחון טכני: {name} — יצאה עם {amount} ₪ ועם סיפור ניצחון לכל השבוע",
];

/* תאימות לאחור: השקית בלי סיומת מגדר היא שקית הזכר. */
export const TECHNICAL_WIN_LINES = TECHNICAL_WIN_LINES_M;

/** ניסוחי «תייר/תיירת הערב» — שחקן שסגר בדיוק באפס. {name} מוחלף. */
export const TOURIST_LINES_M = [
  "🧳 תייר הערב: {name} — בא, ראה, לא הרוויח, לא הפסיד",
  "🧳 תייר הערב: {name} — טיול מאורגן: נכנס, שיחק, יצא כמו שנכנס",
  "🧳 תייר הערב: {name} — אפס הפסד, אפס רווח, מאה אחוז נוכחות",
];

export const TOURIST_LINES_F = [
  "🧳 תיירת הערב: {name} — באה, ראתה, לא הרוויחה, לא הפסידה",
  "🧳 תיירת הערב: {name} — טיול מאורגן: נכנסה, שיחקה, יצאה כמו שנכנסה",
  "🧳 תיירת הערב: {name} — אפס הפסד, אפס רווח, מאה אחוז נוכחות",
];

/* תאימות לאחור: השקית בלי סיומת מגדר היא שקית הזכר. */
export const TOURIST_LINES = TOURIST_LINES_M;

/**
 * שורת «ניצחון טכני» לזוכה הגדול כשזכה במעט.
 * @param {string} name
 * @param {number} amount
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatTechnicalWinLine(name, amount, isFemaleName, now = Date.now()) {
  const bag = isFemaleName(name) ? TECHNICAL_WIN_LINES_F : TECHNICAL_WIN_LINES_M;
  const tpl = bag[minutePick(bag.length, now)];
  return tpl.replace(/\{name\}/g, name).replace(/\{amount\}/g, String(amount));
}

/**
 * שורת «תייר/תיירת הערב» לשחקן שסגר באפס.
 * @param {string} name
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatTouristLine(name, isFemaleName, now = Date.now()) {
  const bag = isFemaleName(name) ? TOURIST_LINES_F : TOURIST_LINES_M;
  const tpl = bag[minutePick(bag.length, now)];
  return tpl.replace(/\{name\}/g, name);
}

/* ------------------------- אבני דרך בקופה (לייב) ------------------------- */

/** שורות ציון לחציית סף קופה (כפולת 500). {amount} = הסף, עם פסיק אלפים. */
export const POT_MILESTONE_LINES = [
  "הקופה חצתה {amount} ₪ — רשמית אפשר לרשום אותה כקרן השקעות",
  "🎉 הקופה הגיעה ל־{amount} ₪ — יש פה יותר כסף מבחלק מהסטארטאפים",
  "הקופה ב־{amount} ₪ — מישהו צריך להתחיל לגבות דמי ניהול",
  "{amount} ₪ בקופה — הבנק מתחיל לשאול שאלות",
];

/** שורת ציון לחציית סף קופה. */
export function formatPotMilestoneLine(threshold, now = Date.now()) {
  const tpl = POT_MILESTONE_LINES[minutePick(POT_MILESTONE_LINES.length, now)];
  return tpl.replace(/\{amount\}/g, Number(threshold).toLocaleString("he-IL"));
}

/* ------------------------- נבואת פתיחה (לייב) ------------------------- */

/** נבואות הבוט לכניסה הראשונה של הערב — בלי הקידומת, שמתווספת בפורמט. */
export const OPENING_PROPHECIES = [
  "מישהו יגיד שהוא נכנס רק ב־50, וייכנס שוב עוד שעה",
  "הערב ייגמר ב«רק עוד יד אחת» — חמש פעמים",
  "מישהו יפסיד ויגיד שזה היה מהלך מחושב",
  "הטיפים יגיעו, אבל רק אחרי תזכורת קטנה",
  "עד סוף הערב מישהו יבקש לראות את הקלפים של כולם",
];

/** שורת נבואת הפתיחה של הערב. */
export function formatOpeningProphecy(now = Date.now()) {
  return `🔮 נבואת הבוט: ${OPENING_PROPHECIES[minutePick(OPENING_PROPHECIES.length, now)]}`;
}

/**
 * שורת ההומור לכניסה חוזרת, או null אם זו לא כניסה שלישית ומעלה.
 * @param {string} name
 * @param {number} entriesCount מספר הכניסות של השחקן אחרי ההחלה
 * @param {(n: string) => boolean} isFemaleName
 */
export function formatRebuyJoke(name, entriesCount, isFemaleName, now = Date.now()) {
  if (!(entriesCount >= 3)) return null;
  const entry = REBUY_JOKES[minutePick(REBUY_JOKES.length, now)];
  if (typeof entry === "string") return entry;
  return isFemaleName(name) ? entry.f : entry.m;
}

/**
 * דירוג לפי סכום — תיקו = אותו מקום, מדלגים על מקומות.
 * @param {{ name: string, amount: number }[]} tippers sorted desc by amount
 * @returns {{ place: 1|2|3, names: string[], amount: number }[]}
 */
export function tipRankPlaces(tippers) {
  const places = [];
  let i = 0;
  let place = 1;
  while (i < tippers.length && place <= 3) {
    const amt = tippers[i].amount;
    const names = [];
    while (i < tippers.length && tippers[i].amount === amt) {
      names.push(tippers[i].name);
      i++;
    }
    places.push({ place, names, amount: amt });
    place += names.length;
  }
  return places.filter((p) => p.place <= 3);
}
