/* ערב 24.10.2026 כפי שנשמר ב-Supabase (בלי buyinEvents / יומן טיפים —
   אינם משפיעים על חישוב החלוקה או הסימונים).
   NIGHT_24_10.payments = מצב סוף הלילה: תוכנית שמורה עם דגלי manual:true
   ומפת חוסר ב־manualSettlement — השחזור הנאמן שפסל את סבב התיקון הראשון.
   CURRENT_PAYMENTS_24_10 = ה־payments כפי שנשמרו אחרי סימוני המנהל בבוקר
   25.10 (תוכנית חדשה עם שורת קופה 93, אישור קופה כאירוע אינדקס רגיל 5). */
export const NIGHT_24_10 = {
 "id": "live_1792879962020",
 "iso": "2026-10-24",
 "cps": 2,
 "d": 24,
 "mo": 10,
 "y": 2026,
 "savings5": true,
 "savingsPot": 93,
 "savingsPotActual": 70,
 "entries": [
  {
   "name": "עדן גיל",
   "buyin": 550,
   "chips": 40,
   "amount": -530,
   "tipsGiven": 10
  },
  {
   "name": "אורן גיל",
   "buyin": 100,
   "chips": 840,
   "amount": 320,
   "tipsGiven": 30
  },
  {
   "name": "קובי סעדה",
   "buyin": 400,
   "chips": 0,
   "amount": -400,
   "tipsGiven": 20
  },
  {
   "name": "ירין מלאך",
   "buyin": 150,
   "chips": 300,
   "amount": 0,
   "tipsGiven": 8
  },
  {
   "name": "דן ינקלויץ",
   "buyin": 150,
   "chips": 500,
   "amount": 100,
   "tipsGiven": 38
  },
  {
   "name": "נתנאל כהן",
   "buyin": 150,
   "chips": 0,
   "amount": -150,
   "tipsGiven": 0
  },
  {
   "name": "דור לירז",
   "buyin": 100,
   "chips": 420,
   "amount": 110,
   "tipsGiven": 35
  },
  {
   "name": "אופיר סנה",
   "buyin": 250,
   "chips": 1530,
   "amount": 515,
   "tipsGiven": 55
  }
 ],
 "manualSettlement": {
  "basis": "[2,[{\"name\":\"עדן גיל\",\"buyin\":550,\"cashout\":\"40\"},{\"name\":\"אורן גיל\",\"buyin\":100,\"cashout\":\"840\"},{\"name\":\"קובי סעדה\",\"buyin\":400,\"cashout\":\"0\"},{\"name\":\"ירין מלאך\",\"buyin\":150,\"cashout\":\"300\"},{\"name\":\"דן ינקלויץ\",\"buyin\":150,\"cashout\":\"500\"},{\"name\":\"נתנאל כהן\",\"buyin\":150,\"cashout\":\"0\"},{\"name\":\"דור לירז\",\"buyin\":100,\"cashout\":\"420\"},{\"name\":\"אופיר סנה\",\"buyin\":250,\"cashout\":\"1530\"}]]",
  "shortfall": {
   "אורן גיל": 13,
   "דור לירז": 10,
   "אופיר סנה": 35
  },
  "manualPayments": [],
  "settlementVersion": 2,
  "settlementUpdatedAt": "2026-10-25T05:51:17.933Z"
 },
 "payments": {
  "plan": "[{\"from\":\"נתנאל כהן\",\"to\":\"אופיר סנה\",\"amount\":150,\"manual\":true},{\"from\":\"קובי סעדה\",\"to\":\"אופיר סנה\",\"amount\":365,\"manual\":true},{\"from\":\"קובי סעדה\",\"to\":\"אורן גיל\",\"amount\":35,\"manual\":true},{\"from\":\"עדן גיל\",\"to\":\"אורן גיל\",\"amount\":285,\"pair\":true},{\"from\":\"עדן גיל\",\"to\":\"דור לירז\",\"amount\":97},{\"from\":\"עדן גיל\",\"to\":\"דן ינקלויץ\",\"amount\":88},{\"from\":\"עדן גיל\",\"to\":\"קופת חיסכון\",\"amount\":60,\"pot\":true}]",
  "paid": {
   "0": true,
   "1": true,
   "2": true
  },
  "received": {
   "0": true,
   "1": true,
   "2": true
  },
  "confirmations": []
 }
};

export const CURRENT_PAYMENTS_24_10 = {
 "paid": {
  "0": true,
  "1": true,
  "2": true,
  "3": true,
  "4": true,
  "5": true,
  "6": true
 },
 "plan": "[{\"from\":\"עדן גיל\",\"to\":\"אורן גיל\",\"amount\":307,\"pair\":true},{\"from\":\"נתנאל כהן\",\"to\":\"אופיר סנה\",\"amount\":150,\"pair\":true},{\"from\":\"קובי סעדה\",\"to\":\"אופיר סנה\",\"amount\":330},{\"from\":\"עדן גיל\",\"to\":\"דן ינקלויץ\",\"amount\":30},{\"from\":\"עדן גיל\",\"to\":\"דור לירז\",\"amount\":100},{\"from\":\"עדן גיל\",\"to\":\"קופת חיסכון\",\"amount\":93,\"pot\":true},{\"from\":\"קובי סעדה\",\"to\":\"דן ינקלויץ\",\"amount\":70}]",
 "received": {},
 "confirmations": [
  {
   "at": "2026-10-25T08:22:11.989Z",
   "by": "עדן גיל",
   "index": 2,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:22:15.119Z",
   "by": "עדן גיל",
   "index": 6,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:22:20.155Z",
   "by": "עדן גיל",
   "index": 0,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:25:55.630Z",
   "by": "עדן גיל",
   "index": 3,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:25:57.327Z",
   "by": "עדן גיל",
   "index": 4,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:25:59.112Z",
   "by": "עדן גיל",
   "index": 5,
   "action": "paid"
  },
  {
   "at": "2026-10-25T08:26:01.521Z",
   "by": "עדן גיל",
   "index": 1,
   "action": "paid"
  }
 ]
};
