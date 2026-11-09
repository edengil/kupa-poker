/* ============================================================================
   גל 7, פריט 7.4 — טיפוסי הישויות הקנוניים.

   עד הגל, כל מודול הכריז לעצמו את צורת השחקן/האירוע/הערב/ההעברה:
   WaPlayer (בוט), LivePlayer (תצוגת לייב), SettlePlayer (חלוקה),
   BuyinEvent של personalStats, Transfer של settlement בלי דגלי הקופה,
   WaTip חסר, ו־session.payments בלי שום הצהרה. מהגל יש כאן מודול אחד
   שמכריז את ישויות הליבה, וההצהרות המקומיות הן כינויים דקים אליו
   (type X = Canonical) — כך כל שדה מתועד ומוצהר במקום אחד בלבד.

   שינוי הצהרתי בלבד: אפס שינוי ריצה. כל שדה אופציונלי כאן הוא שדה
   שכותב אחד כותב ואחר לא — האופציונליות מתעדת את מציאות הנתונים,
   לא מרחיבה חוזה.
   ============================================================================ */

/** אירוע קנייה אחד (חותמת) של שחקן בערב/בשולחן חי. */
export interface BuyinEvent {
  /** סכום הקנייה בשקלים. */
  amount?: number;
  /** חותמת זמן (מ״ש אפוק). */
  at?: number | string;
  /** מצטבר אחרי האירוע, בשקלים. */
  total?: number;
  /** תרומת ה־5% לקופה של האירוע הזה, בשקלים. */
  pot?: number;
  /* זהות יציבה של החותמת: מזהה הודעת הוואטסאפ + אינדקס הפקודה בתוכה.
     הצילום (amount+at+total) אינו זהות — שתי קניות של 50 באותה
     אלפית־שנייה נראות זהות, ושם השחקן הוא תווית משתנה. ה־sid הוא מה
     שמאפשר לביטול למצוא בדיוק את החותמת הזו גם אחרי שינוי שם,
     ולהחלה־מחדש לנחות על אותו שחקן. שדה פנימי של הבוט — מוסר
     בהקרנת הצופה (publicShare/SQL). */
  sid?: string;
}

/** שחקן בשולחן/בערב — הצורה האחת של כל הכותבים והקוראים. */
export interface Player {
  name: string;
  /** סך הקניות בשקלים; מיתר כשמדובר בקלט טופס שטרם נוקה. */
  buyin?: number | string;
  /** סכום היציאה; מיתר ריק = עדיין משחק / טרם נסגר. */
  cashout?: number | string;
  /** טיפים שנתן, בג'יטונים (מצטבר) — לסטטיסטיקה ולסיכום בלבד. */
  tipsGiven?: number;
  buyinEvents?: BuyinEvent[];
  /** תיעוד התאמת ערימה ממילוי זוגי כשאין cashout מספרי — תיעוד בלבד,
     לעולם לא קלט לחישוב (ממצא ביקורת 24): ה־cashout של מי שנסגר כבר
     כולל אותו, וחישוב שיצרוך גם את stackAdj יספור כפול. */
  stackAdj?: number;
  /** נטו שמור של שורת שחקן בערב סגור (צורת entries של ערב שמור). */
  amount?: number | string;
}

/** העברה אחת בתוכנית חלוקת תשלומים. */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
  /** העברת הקופה (5%) — מוסרת מהקרנת הצופה, הסימון עליה הוא potPaid. */
  pot?: boolean;
  /** העברת שארית (הפרש עיגול/חוסר) — גם היא מוסרת מהקרנת הצופה. */
  residual?: boolean;
  /** העברה ידנית שהמנהל הוסיף/ערך — לא מחושבת מהנטו. */
  manual?: boolean;
  /** תשלום של זוג כיחידה אחת (שני בני הזוג מכסים יחד). */
  pair?: boolean;
  /** תשלום משותף של שני חייבים למקבל אחד. */
  joint?: boolean;
  /** פיצול הסכום בין משלמים בפועל, כשהמעביר הרשום הוא נציג. */
  fromSplit?: Record<string, number>;
}

/** אירוע אישור על העברה בתוכנית שמורה. */
export interface PaymentConfirmation {
  /** אינדקס בתוכנית השמורה; ‎-1 = אירוע הקופה. */
  index: number;
  action: string;
  by?: string;
  at?: string;
  /** האירוע שייך להעברת הקופה. */
  pot?: boolean;
}

/** בלוק התשלומים השמור על ערב (session.payments) — ההצהרה הראשונה שלו. */
export interface SessionPayments {
  /** מחרוזת התוכנית השמורה (fingerprint = JSON של רשימת ההעברות). */
  plan?: string;
  /** סימוני «שולם» לפי אינדקס בתוכנית השמורה. */
  paid?: Record<string, boolean>;
  /** סימוני «התקבל» לפי אינדקס בתוכנית השמורה. */
  received?: Record<string, boolean>;
  confirmations?: PaymentConfirmation[];
  /* האם העברת הקופה שולמה. נשמר באחסון תמיד; מוסר מכל הקרנת צופה —
     כלל potPaid האחיד של גל 7 (lib/viewerProjection.js). */
  potPaid?: boolean;
}

/** הקפאת חלוקה ידנית על ערב. */
export interface ManualSettlement {
  /** מפת החוסר הקפואה לפי שם שחקן — נדרשת גם לחישובי הצופה. */
  shortfall?: Record<string, number>;
  note?: string;
  /* סכום הקופה בפועל כפי שהוקפא — נתון מנהל, מוסר מהקרנת הצופה. */
  frozenActual?: number;
  /* סימוני ההקפאה — bookkeeping של המנהל, מוסרים מהקרנת הצופה. */
  frozenReal?: boolean;
  frozenAuto?: boolean;
  [key: string]: unknown;
}

/** ערב שמור אחד — וריאציות הכותבים כשדות אופציונליים מתועדים. */
export interface Session {
  id?: string;
  /** תאריך הערב (ISO, YYYY-MM-DD). */
  iso?: string;
  /** חותמת סיום (מ״ש אפוק) — מפתח המיון של «הערב האחרון». */
  endedAt?: number;
  /** חלקי תאריך מפורשים בנתונים ישנים (לפני שה־iso היה מלא). */
  d?: number;
  mo?: number;
  y?: number;
  /** שורות השחקנים של הערב (נטו סופי לכל שחקן). */
  entries?: Player[];
  /** אותה רשימה בצורת שולחן — קיימת בערבים שנשמרו מהלייב. */
  players?: Player[];
  /** יומן הטיפים של הערב. */
  tips?: Tip[];
  /** סכום הקופה הרשום של הערב (5%) — נתון מנהל, מוסר מהקרנת הצופה. */
  savingsPot?: number;
  /** סכום הקופה בפועל של הערב — נתון מנהל, מוסר מהקרנת הצופה. */
  savingsPotActual?: number;
  /** מילויים זוגיים של הערב — נתון מנהל, מוסר מהקרנת הצופה. */
  coupleFills?: Array<Record<string, unknown>>;
  manualSettlement?: ManualSettlement;
  payments?: SessionPayments;
}

/** טיפ אחד ביומן הטיפים של שולחן/ערב. */
export interface Tip {
  id?: string | number;
  name: string;
  /** סכום הטיפ בג'יטונים. */
  amount?: number;
  at?: number;
  /** מקור הטיפ: missing = חסר למלצרית, ‏bonus = מענק, אחרת רגיל. */
  src?: string;
  /** האם הטיפ ירד מה־cashout של השחקן (ולא נוסף לחוב). */
  fromCashout?: boolean;
  /** דלתא של סכום היציאה שהטיפ הוריד בפועל — הביטול מחזיר אותה על
     הערך הנוכחי, כך שתיקון יציאה מאוחר לא נדרס (שער 0.3). */
  cashDelta?: number;
}

/** הגדרות קבוצה — הצהרה אחת לשני הבעלים (ה־config של קבוצה ב־DB). */
export interface GroupConfig {
  /** האם היסטוריית הערבים משותפת לצופים, או רק הערב האחרון. */
  shareHistory?: boolean;
  /** ג'יטונים לשקל של הקבוצה. */
  chipsPerShekel?: number;
  [key: string]: unknown;
}
