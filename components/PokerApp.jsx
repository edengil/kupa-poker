"use client";
/* ============================================================================
   קופה — פוקר · רכיב האפליקציה
   הועבר אוטומטית מ-index.html המקורי. הלוגיקה לא שונתה.
   שינויים: שכבת האחסון הוחלפה ב-lib/store, ונוסף מצב readOnly.
   ============================================================================ */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { store } from "../lib/store";
import { buildReport, buildSettlement } from "../lib/report";
import { settle, isCashOnly, transferVerb } from "../lib/settlement";
import { planLabel } from "./Rsvp";
import { C } from "./poker/colors";
import { IconBtn, Empty, RoundBtn, Stat, inputStyle } from "./poker/ui";
import { Header, TabBar, Style } from "./poker/chrome";
import { fmt, MONTHS } from "./poker/format";
import {
  r2, AL, canon, hhmm, dur, toWhatsApp, waOpen, waSend,
} from "./poker/helpers";
import { ShareSheet } from "./poker/ShareSheet";
import { SessionsTab } from "./poker/SessionsTab";
import { yearTotals, monthTotals, allTimeTotals } from "./poker/totals";
import { Banner } from "./poker/Banner";
import { TableTab } from "./poker/TableTab";
import { normalize } from "./poker/db";
import { InputTab } from "./poker/InputTab";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, Crown, Plus, Minus,
  TrendingUp, X, Send, UserPlus, Coins,
} from "./poker/icons";
import { EGFooter } from "./Logo";

const DB_KEY = "poker:db";
const CONFIG_KEY = "poker:config";
const LIVE_KEY = "poker:live"; // משחק פעיל — נשמר אוטומטית כדי שלא ילך לאיבוד

/* --------- קונפיגורציה: cache במשתנה מודול, נטען פעם אחת, listeners --------- */
const DEFAULT_CONFIG = {
  chipsPerShekel: 2,
  defaultBuyin: 50,
  botOn: false // הבוט בוואטסאפ מגיב רק כשהדגל דלוק; נדלק אוטומטית עם פתיחת משחק
};
let _configCache = {
  ...DEFAULT_CONFIG
};
const _configListeners = new Set();
const getConfig = () => _configCache; // קריאה סינכרונית
const onConfig = fn => {
  _configListeners.add(fn);
  return () => _configListeners.delete(fn);
};
async function loadConfig() {
  const raw = await store.get(CONFIG_KEY);
  if (raw) {
    try {
      _configCache = {
        ...DEFAULT_CONFIG,
        ...JSON.parse(raw)
      };
    } catch {}
  }
  _configListeners.forEach(f => f(_configCache));
}
async function setConfig(patch) {
  _configCache = {
    ..._configCache,
    ...patch
  };
  _configListeners.forEach(f => f(_configCache));
  await store.set(CONFIG_KEY, JSON.stringify(_configCache));
}

/* ---------------------- נקודה צפה: לעגל מיד ל-2 ספרות --------------------- */
const SEED = [{
  "iso": "2024-03-27",
  "d": 27,
  "mo": 3,
  "y": 2024,
  "e": [["נתנאל", 220], ["אברהם", 70], ["לאופיר", 80]]
}, {
  "iso": "2024-05-30",
  "d": 30,
  "mo": 5,
  "y": 2024,
  "e": [["אורן", -60], ["איתיק", -120], ["עידן", 235], ["משה", -84]]
}, {
  "iso": "2024-06-04",
  "d": 4,
  "mo": 6,
  "y": 2024,
  "e": [["עדן", -30], ["דולב", 185], ["אופיר", -62]]
}, {
  "iso": "2024-06-06",
  "d": 6,
  "mo": 6,
  "y": 2024,
  "e": [["אופיר", 100], ["אורן", 20], ["עדן", 140]]
}, {
  "iso": "2024-07-20",
  "d": 20,
  "mo": 7,
  "y": 2024,
  "e": [["עדן", 235], ["שפאק", -46], ["אורן", 240], ["אופיר", -172], ["דוד בני", 15]]
}, {
  "iso": "2024-08-05",
  "d": 5,
  "mo": 8,
  "y": 2024,
  "e": [["שגיא", -95], ["אורן", 109], ["עדן", 525], ["דור", 115]]
}, {
  "iso": "2024-08-13",
  "d": 13,
  "mo": 8,
  "y": 2024,
  "e": [["פריצי", 14], ["נתנאל", 170], ["שגיא", 75]]
}, {
  "iso": "2024-08-21",
  "d": 21,
  "mo": 8,
  "y": 2024,
  "e": [["עדן", 25], ["פריצי", 21], ["נתנאל", 150], ["הדר", 65]]
}, {
  "iso": "2024-08-31",
  "d": 31,
  "mo": 8,
  "y": 2024,
  "e": [["עדן", 27], ["שגיא", 160], ["נתנאל", -52], ["אופיר", 10], ["משה", -20], ["פריצי", 150]]
}, {
  "iso": "2024-09-07",
  "d": 7,
  "mo": 9,
  "y": 2024,
  "e": [["אופיר", -50], ["נתנאל", -50], ["פריצי", 355]]
}, {
  "iso": "2024-09-19",
  "d": 19,
  "mo": 9,
  "y": 2024,
  "e": [["עדן", -225], ["אופיר", -50], ["אורן", -100]]
}, {
  "iso": "2024-11-20",
  "d": 20,
  "mo": 11,
  "y": 2024,
  "e": [["אורן", 80], ["נתנאל", 225], ["דור", 150], ["איתן", -100], ["דוד בני", -100], ["קובי", -150], ["עדן", -18]]
}, {
  "iso": "2024-11-26",
  "d": 26,
  "mo": 11,
  "y": 2024,
  "e": [["דן", -200], ["איציק", 69], ["אופיר", 114], ["אורן", 17]]
}, {
  "iso": "2024-11-30",
  "d": 30,
  "mo": 11,
  "y": 2024,
  "e": [["דוד בני", 242], ["נתנאל", 160], ["אופיר", 136]]
}, {
  "iso": "2024-12-03",
  "d": 3,
  "mo": 12,
  "y": 2024,
  "e": [["עדן", -100], ["דן", -100], ["עומר", -50], ["אורן", -190], ["שפאק", -200], ["אופיר", -30], ["שגיא", 4], ["דן", 325], ["דוד בני", 330]]
}, {
  "iso": "2024-12-10",
  "d": 10,
  "mo": 12,
  "y": 2024,
  "e": [["נתנאל", -100], ["אופיר", -300], ["פריצי", -50], ["קובי", -100], ["איציק", 354], ["עדן", 142], ["דוד בני", 121]]
}, {
  "iso": "2024-12-16",
  "d": 16,
  "mo": 12,
  "y": 2024,
  "e": [["קובי", -93], ["אורן", -111], ["עדן", -52], ["נתנאל", -150], ["פריצי", -100], ["אופיר", -65], ["שגיא", -65], ["איציק", 386], ["דן", 350]]
}, {
  "iso": "2025-01-09",
  "d": 9,
  "mo": 1,
  "y": 2025,
  "e": [["עדן", 660], ["אופיר", 640], ["קובי", 480]]
}, {
  "iso": "2025-01-25",
  "d": 25,
  "mo": 1,
  "y": 2025,
  "e": [["אופיר", 80], ["דן", -50], ["בן", -50], ["עמית", -50], ["דור", 70]]
}, {
  "iso": "2025-02-04",
  "d": 4,
  "mo": 2,
  "y": 2025,
  "e": [["דור", -30], ["אופיר", 105], ["עדן", -20], ["דוד בני", 100], ["נתנאל", 75], ["דן", -100], ["שגיא", 38], ["איציק", -170]]
}, {
  "iso": "2025-02-05",
  "d": 5,
  "mo": 2,
  "y": 2025,
  "e": [["דור", -30], ["עדן", -20], ["דוד בני", 100], ["נתנאל", 75], ["שגיא", 38], ["איציק", -170]]
}, {
  "iso": "2025-03-01",
  "d": 1,
  "mo": 3,
  "y": 2025,
  "e": [["קובי", 50], ["אופיר", 132], ["דור", 120], ["עדן", 225], ["שפאק", -188], ["אורן", -90], ["טוני", -100], ["פריצי", -150]]
}, {
  "iso": "2025-03-05",
  "d": 5,
  "mo": 3,
  "y": 2025,
  "e": [["עדן", -25], ["דור", -150], ["קובי", -20], ["אורן", -105], ["איציק", -100], ["שגיא", 400]]
}, {
  "iso": "2025-03-07",
  "d": 7,
  "mo": 3,
  "y": 2025,
  "e": [["יובל", -50], ["ניצן", -50], ["אורן", 100]]
}, {
  "iso": "2025-03-12",
  "d": 12,
  "mo": 3,
  "y": 2025,
  "e": [["פריצי", 170], ["קובי", 80], ["דוד בני", 50], ["איתן", 75], ["נתנאל", 200], ["דור", -115], ["עדן", -200], ["אורן", -170], ["אופיר", -110]]
}, {
  "iso": "2025-03-18",
  "d": 18,
  "mo": 3,
  "y": 2025,
  "e": [["קובי", 70], ["דוד בני", 200], ["שגיא", -50], ["עדן", 370]]
}, {
  "iso": "2025-03-25",
  "d": 25,
  "mo": 3,
  "y": 2025,
  "e": [["אורן", -25], ["עדן", -200], ["איציק", -100], ["דור", -100], ["נתנאל", 70], ["אופיר", 140], ["דוד בני", 160], ["קובי", 50]]
}, {
  "iso": "2025-03-30",
  "d": 30,
  "mo": 3,
  "y": 2025,
  "e": [["דוד בני", -300], ["איתן", -100], ["דור", -100], ["קובי", -200], ["נתנאל", 250], ["אופיר", 295], ["אורן", 115], ["עדן", 140]]
}, {
  "iso": "2025-04-06",
  "d": 6,
  "mo": 4,
  "y": 2025,
  "e": [["דור", 300], ["מייקי", 400], ["בן", -50], ["פריצי", -150], ["עדן", -170], ["נתנאל", -100], ["אורן", -25], ["קובי", -190]]
}, {
  "iso": "2025-04-13",
  "d": 13,
  "mo": 4,
  "y": 2025,
  "e": [["נתנאל", 100], ["פריצי", 89], ["שפאק", 355], ["עדן", 470], ["קובי", -410], ["אורן", -110], ["אופיר", -140], ["משה", -50], ["שגיא", -150], ["דן", -150]]
}, {
  "iso": "2025-04-16",
  "d": 16,
  "mo": 4,
  "y": 2025,
  "e": [["עדן", -20], ["דור", -75], ["פריצי", -88], ["נתנאל", -150], ["אורן", -150], ["אופיר", 63], ["דוד בני", 365]]
}, {
  "iso": "2025-04-21",
  "d": 21,
  "mo": 4,
  "y": 2025,
  "e": [["אופיר", 90], ["קובי", 200], ["שגיא", 50], ["נתנאל", -170], ["פריצי", -100], ["דוד בני", -50], ["דור", -20]]
}, {
  "iso": "2025-04-27",
  "d": 27,
  "mo": 4,
  "y": 2025,
  "e": [["עדן", -225], ["אופיר", -200], ["שמואל", -50], ["איתן", -150], ["דוד בני", -50], ["נתנאל", -250], ["דור", 130], ["קובי", 180], ["אורן", 650]]
}, {
  "iso": "2025-05-01",
  "d": 1,
  "mo": 5,
  "y": 2025,
  "e": [["אופיר", 185], ["דני", 170], ["אורן", 30], ["עדן", 68], ["דור", -100], ["קובי", -150], ["איציק", -25], ["איתו", -50], ["שגיא", -100], ["שפאק", -28]]
}, {
  "iso": "2025-05-03",
  "d": 3,
  "mo": 5,
  "y": 2025,
  "e": [["איציק", -10], ["דוד בני", -80], ["דור", -100], ["אופיר", 125], ["אורן", 70], ["נתנאל", 42]]
}, {
  "iso": "2025-05-08",
  "d": 8,
  "mo": 5,
  "y": 2025,
  "e": [["אורן", -175], ["עדן", -175], ["נתנאל", 40], ["אופיר", 140], ["קובי", 20], ["דוד בני", 150]]
}, {
  "iso": "2025-05-14",
  "d": 14,
  "mo": 5,
  "y": 2025,
  "e": [["דני", -150], ["דור", -150], ["עדן", -170], ["אורן", 20], ["דוד בני", 50], ["איציק", 110], ["קובי", 290]]
}, {
  "iso": "2025-05-19",
  "d": 19,
  "mo": 5,
  "y": 2025,
  "e": [["קובי", -129], ["אורן", -150], ["עדן", -109], ["דור", -225], ["שגיא", 325], ["אופיר", 335]]
}, {
  "iso": "2025-05-28",
  "d": 28,
  "mo": 5,
  "y": 2025,
  "e": [["עדן", -50], ["איציק", -50], ["דור", -25], ["אורן", -125], ["קובי", -250], ["דוד בני", 150], ["שגיא", 350]]
}, {
  "iso": "2025-06-02",
  "d": 2,
  "mo": 6,
  "y": 2025,
  "e": [["נתנאל", 195], ["עדן", 120], ["דוד בני", -45], ["דור", -50], ["קובי", -120], ["אורן", -100]]
}, {
  "iso": "2025-06-10",
  "d": 10,
  "mo": 6,
  "y": 2025,
  "e": [["עדן", 125], ["אופיר", 235], ["דוד בני", 419], ["דור", -250], ["אורן", -50], ["שגיא", -235], ["גל", -60], ["קובי", -150]]
}, {
  "iso": "2025-06-21",
  "d": 21,
  "mo": 6,
  "y": 2025,
  "e": [["נתנאל", 90], ["דן", 50], ["דור", 37], ["אופיר", 510], ["עדן", 50], ["שפאק", -100], ["איציק", -38], ["קובי", -200], ["שגיא", -250], ["אורן", -20]]
}, {
  "iso": "2025-06-28",
  "d": 28,
  "mo": 6,
  "y": 2025,
  "e": [["דן", 125], ["שגיא", 100], ["דוד בני", 170], ["אופיר", 430], ["עדן", -40], ["אורן", -175], ["דור", -150], ["איציק", -125], ["שפאק", -200], ["קובי", -85]]
}, {
  "iso": "2025-07-02",
  "d": 2,
  "mo": 7,
  "y": 2025,
  "e": [["עדן", -200], ["קובי", -250], ["נתנאל", -150], ["אורן", 20], ["דור", 50], ["שגיא", 520]]
}, {
  "iso": "2025-07-12",
  "d": 12,
  "mo": 7,
  "y": 2025,
  "e": [["דן", -140], ["דור", -200], ["איתו", -100], ["עדן", -125], ["אורן", -125], ["איציק", 50], ["אופיר", 490], ["קובי", 150]]
}, {
  "iso": "2025-07-20",
  "d": 20,
  "mo": 7,
  "y": 2025,
  "e": [["איציק", -5], ["שפאק", -18], ["דור", -115], ["עדן", 85], ["אורן", 55]]
}, {
  "iso": "2025-07-26",
  "d": 26,
  "mo": 7,
  "y": 2025,
  "e": [["שגיא", 275], ["קובי", 350], ["איציק", 75], ["דו", 35], ["נתנאל", -150], ["דור", -150], ["עדן", -200], ["אורן", -200]]
}, {
  "iso": "2025-07-29",
  "d": 29,
  "mo": 7,
  "y": 2025,
  "e": [["דן", -200], ["נתנאל", -150], ["פריצי", -150], ["עדן", 170], ["אורן", 125], ["קובי", 35], ["דוד בני", 150], ["אופיר", 20]]
}, {
  "iso": "2025-08-05",
  "d": 5,
  "mo": 8,
  "y": 2025,
  "e": [["נתנאל", -100], ["עדן", -180], ["פריצי", -200], ["דוד בני", -200], ["שגיא", 600], ["קובי", 35], ["אופיר", 75]]
}, {
  "iso": "2025-08-11",
  "d": 11,
  "mo": 8,
  "y": 2025,
  "e": [["אורן", -145], ["עדן", -190], ["איציק", -90], ["דור", -100], ["שגיא", -25], ["דוד בני", 235], ["קובי", 175], ["אופיר", 100]]
}, {
  "iso": "2025-08-18",
  "d": 18,
  "mo": 8,
  "y": 2025,
  "e": [["עדן", -175], ["אורן", -100], ["אופיר", 15], ["שפאק", 100], ["דור", 190]]
}, {
  "iso": "2025-09-02",
  "d": 2,
  "mo": 9,
  "y": 2025,
  "e": [["עדן", 185], ["שגיא", 600], ["נתנאל", -90], ["אופיר", -35], ["דוד בני", -150], ["קובי", -400], ["דור", -50]]
}, {
  "iso": "2025-09-10",
  "d": 10,
  "mo": 9,
  "y": 2025,
  "e": [["עדן", 78], ["אורן", 30], ["עדן של דור", 168], ["קובי", 315], ["דור", -150], ["שגיא", -50], ["אופיר", -115], ["איתן", -125], ["דוד בני", -150]]
}, {
  "iso": "2025-09-15",
  "d": 15,
  "mo": 9,
  "y": 2025,
  "e": [["אופיר", -50], ["איציק", -150], ["עדן", -50], ["נועם", -150], ["אורן", -150], ["קובי", 150], ["שגיא", 200], ["בני", 277], ["דור", 27]]
}, {
  "iso": "2025-09-20",
  "d": 20,
  "mo": 9,
  "y": 2025,
  "e": [["נתנאל", 100], ["עדן", 20], ["אורן", 20], ["קובי", 100], ["דוד בני", -15], ["דור", -100], ["אופיר", -125]]
}, {
  "iso": "2025-09-27",
  "d": 27,
  "mo": 9,
  "y": 2025,
  "e": [["נתנאל", 250], ["מייק", 30], ["שגיא", 250], ["דוד בני", 250], ["אופיר", 195], ["עדן", -25], ["אורן", -250], ["דן", -300], ["נועם", -350]]
}, {
  "iso": "2025-09-30",
  "d": 30,
  "mo": 9,
  "y": 2025,
  "e": [["איציק", -20], ["אורן", -140], ["אופיר", -125], ["קובי", -50], ["עדן", 365]]
}, {
  "iso": "2025-10-07",
  "d": 7,
  "mo": 10,
  "y": 2025,
  "e": [["בן", -50], ["דני", -50], ["שי", -200], ["דן", -100], ["דור", -150], ["קובי", -250], ["נתנאל", 75], ["אופיר", 75], ["דוד בני", 275], ["עדן", 375]]
}, {
  "iso": "2025-10-14",
  "d": 14,
  "mo": 10,
  "y": 2025,
  "e": [["עדן", 25], ["אורן", 335], ["אופיר", 350], ["דוד בני", -275], ["קובי", -175], ["שגיא", -250]]
}, {
  "iso": "2025-10-19",
  "d": 19,
  "mo": 10,
  "y": 2025,
  "e": [["אורן", -195], ["קובי", -125], ["עדן", -150], ["דור", 80], ["דוד בני", 140], ["אופיר", 250]]
}, {
  "iso": "2025-10-25",
  "d": 25,
  "mo": 10,
  "y": 2025,
  "e": [["שגיא", -150], ["אור", -250], ["דן", -25], ["אופיר", -200], ["נתנאל", -50], ["עדן", -180], ["דוד בני", 400], ["קובי", 150], ["אורן", 315]]
}, {
  "iso": "2025-11-01",
  "d": 1,
  "mo": 11,
  "y": 2025,
  "e": [["קובי", 150], ["איציק", 50], ["עדן", 225], ["דן ויסמן", 300], ["אור", 100], ["דן", -100], ["נתנאל", -50], ["שגיא", -250], ["דוד בני", -170], ["אופיר", -80], ["דור", -170]]
}, {
  "iso": "2025-11-05",
  "d": 5,
  "mo": 11,
  "y": 2025,
  "e": [["דוד בני", 260], ["עדן גורשומוב", 74], ["אופיר", -6], ["אורן", -150], ["עדן", -78], ["דור", -100]]
}, {
  "iso": "2025-11-11",
  "d": 11,
  "mo": 11,
  "y": 2025,
  "e": [["עדן", -225], ["נתנאל", -150], ["קובי", -105], ["דוד בני", 275], ["אורן", 125], ["אופיר", 125]]
}, {
  "iso": "2025-11-15",
  "d": 15,
  "mo": 11,
  "y": 2025,
  "e": [["עדן", 390], ["נתנאל", 25], ["קובי", 110], ["אורן", -145], ["דור", -150], ["דוד בני", -225]]
}, {
  "iso": "2025-11-22",
  "d": 22,
  "mo": 11,
  "y": 2025,
  "e": [["קובי", 360], ["דור", 30], ["דוד בני", 55], ["עדן", -75], ["אורן", -115], ["נתנאל", -10], ["איציק", -125], ["אופיר", -73]]
}, {
  "iso": "2025-11-29",
  "d": 29,
  "mo": 11,
  "y": 2025,
  "e": [["נתנאל", -115], ["דוד בני", -30], ["אורן", -65], ["אופיר", 30], ["עדן", 70], ["דור", 110]]
}, {
  "iso": "2025-12-02",
  "d": 2,
  "mo": 12,
  "y": 2025,
  "e": [["שגיא", 625], ["דוד בני", 50], ["אופיר", -125], ["קובי", -300], ["נתנאל", -100], ["עדן", -100]]
}, {
  "iso": "2025-12-04",
  "d": 4,
  "mo": 12,
  "y": 2025,
  "e": [["שגיא", -140], ["אופיר", -50], ["אורן", -200], ["קובי", 30], ["דוד בני", 265], ["עדן", 100]]
}, {
  "iso": "2025-12-16",
  "d": 16,
  "mo": 12,
  "y": 2025,
  "e": [["אורן", 75], ["שגיא", 200], ["עדן", 95], ["אופיר", -150], ["פריצי", -105], ["איציק", -35], ["קובי", -78]]
}, {
  "iso": "2025-12-23",
  "d": 23,
  "mo": 12,
  "y": 2025,
  "e": [["אורן", 435], ["אופיר", 350], ["קובי", -100], ["דוד בני", -245], ["רועי", -150], ["עדן", -150], ["נתנאל", -140]]
}, {
  "iso": "2025-12-30",
  "d": 30,
  "mo": 12,
  "y": 2025,
  "e": [["אורן", 175], ["עדן", 75], ["אופיר", 440], ["קובי", -350], ["מייקי", -300], ["רוי", -15], ["שגיא", -25]]
}, {
  "iso": "2026-01-06",
  "d": 6,
  "mo": 1,
  "y": 2026,
  "e": [["נתנאל", 50], ["מייקי", 380], ["עדן", 170], ["דוד בני", -200], ["אופיר", -200], ["אורן", -125], ["קובי", -75]]
}, {
  "iso": "2026-01-11",
  "d": 11,
  "mo": 1,
  "y": 2026,
  "e": [["עדן", -60], ["אורן", -150], ["דוד בני", 285]]
}, {
  "iso": "2026-01-17",
  "d": 17,
  "mo": 1,
  "y": 2026,
  "e": [["אופיר", 250], ["לאון", 125], ["איציק", 225], ["נתנאל", -25], ["דוד בני", -300], ["אורן", -50], ["עדן", -215]]
}, {
  "iso": "2026-01-21",
  "d": 21,
  "mo": 1,
  "y": 2026,
  "e": [["דן", -50], ["אורן", -40], ["שגיא", -50], ["קובי", -350], ["אופיר", 30], ["עדן", 460]]
}, {
  "iso": "2026-01-24",
  "d": 24,
  "mo": 1,
  "y": 2026,
  "e": [["נתנאל", -70], ["אורן", -40], ["אור", -200], ["אופיר", -305], ["קובי", -200], ["עדן", -475], ["שגיא", 400], ["דן", 60], ["דוד בני", 685], ["דן", 150]]
}, {
  "iso": "2026-01-31",
  "d": 31,
  "mo": 1,
  "y": 2026,
  "e": [["דן ויסמן", -60], ["איציק", -200], ["אורן", -220], ["קובי", 75], ["דן", 450]]
}, {
  "iso": "2026-02-05",
  "d": 5,
  "mo": 2,
  "y": 2026,
  "e": [["דן", -175], ["אופיר", -50], ["רוי", -250], ["שגיא", -400], ["אורן", 275], ["קובי", 320], ["עדן", 280]]
}, {
  "iso": "2026-02-08",
  "d": 8,
  "mo": 2,
  "y": 2026,
  "e": [["דן", -80], ["דוד בני", -210], ["שי", -200], ["נתנאל", -70], ["דן ויסמן", -350], ["אור", 100], ["קובי", 90], ["אופיר", 260], ["עדן", 50], ["שגיא", 125], ["אורן", 280]]
}, {
  "iso": "2026-02-18",
  "d": 18,
  "mo": 2,
  "y": 2026,
  "e": [["שגיא", -400], ["נתנאל", -200], ["קובי", -100], ["דור", -100], ["דוד בני", 310], ["אופיר", 200], ["עדן", 290]]
}, {
  "iso": "2026-02-21",
  "d": 21,
  "mo": 2,
  "y": 2026,
  "e": [["עדן", 40], ["אור", 550], ["דוד בני", 175], ["דן", 430], ["שגיא", -350], ["קובי", -350], ["אורן", -150], ["דן", -150], ["אופיר", -200]]
}, {
  "iso": "2026-03-02",
  "d": 2,
  "mo": 3,
  "y": 2026,
  "e": [["שגיא", 475], ["קובי", 460], ["דוד בני", -300], ["דו", -170], ["אופיר", -400], ["עדן", -60]]
}, {
  "iso": "2026-03-05",
  "d": 5,
  "mo": 3,
  "y": 2026,
  "e": [["אורן", -335], ["עדן", -250], ["אור", -400], ["שגיא", 675], ["נתנאל", 675]]
}, {
  "iso": "2026-03-06",
  "d": 6,
  "mo": 3,
  "y": 2026,
  "e": [["עדן", -250], ["אורן", -335], ["דן", -400], ["אור", -400], ["קובי", 50], ["שגיא", 675], ["נתנאל", 675]]
}, {
  "iso": "2026-03-12",
  "d": 12,
  "mo": 3,
  "y": 2026,
  "e": [["עדן גושמרוב", -100], ["דור", -50], ["נתנאל", -50], ["עדן", -50], ["דוד בני", -400], ["אורן", -150], ["רוי", 180], ["קובי", 75], ["דן", 500], ["שפאק", 44]]
}, {
  "iso": "2026-03-17",
  "d": 17,
  "mo": 3,
  "y": 2026,
  "e": [["אופיר", 500], ["שגיא", 60], ["פריצי", -200], ["איציק", -200], ["אורן", -150], ["עדן", -10]]
}, {
  "iso": "2026-03-21",
  "d": 21,
  "mo": 3,
  "y": 2026,
  "e": [["נתנאל", -50], ["קובי", -375], ["שגיא", -300], ["דן", -36], ["אורן", -184], ["עדן", 660], ["דוד בני", 285]]
}, {
  "iso": "2026-03-24",
  "d": 24,
  "mo": 3,
  "y": 2026,
  "e": [["אורן", 55], ["דן", 395], ["עדן", -400]]
}, {
  "iso": "2026-03-25",
  "d": 25,
  "mo": 3,
  "y": 2026,
  "e": [["שגיא", -150], ["אופיר", -100], ["עדן", -400], ["דן", 395], ["אורן", 55], ["קובי", 200]]
}, {
  "iso": "2026-03-28",
  "d": 28,
  "mo": 3,
  "y": 2026,
  "e": [["דן", 150], ["נתנאל", 230], ["אורן", 125], ["עדן", 485], ["דוד בני", -300], ["שגיא", -250], ["קובי", -300], ["אופיר", -160]]
}, {
  "iso": "2026-04-04",
  "d": 4,
  "mo": 4,
  "y": 2026,
  "e": [["אופיר", 75], ["קובי", 50], ["שגיא", 100], ["אורן", 470], ["דוד בני", -450], ["דן", -80], ["עדן", -165]]
}, {
  "iso": "2026-04-09",
  "d": 9,
  "mo": 4,
  "y": 2026,
  "e": [["דו", -20], ["עדן", -152], ["רוי", -218], ["אוראל", -550], ["אורן", 350], ["אופיר", 400], ["נתנאל", 225]]
}, {
  "iso": "2026-04-13",
  "d": 13,
  "mo": 4,
  "y": 2026,
  "e": [["דוד בני", -250], ["שגיא", -400], ["דור", -100], ["אורן", -270], ["עדן", 470], ["דן", 550]]
}, {
  "iso": "2026-04-22",
  "d": 22,
  "mo": 4,
  "y": 2026,
  "e": [["שגיא", -200], ["עדן", -285], ["דן", -450], ["אופיר", 360], ["קובי", 425], ["אורן", 150]]
}, {
  "iso": "2026-04-25",
  "d": 25,
  "mo": 4,
  "y": 2026,
  "e": [["אור", -200], ["דן ויסמן", -450], ["דן", -100], ["אורן", -300], ["עדן", 70], ["רוי", 200], ["דוד בני", 220], ["אופיר", 550]]
}, {
  "iso": "2026-05-02",
  "d": 2,
  "mo": 5,
  "y": 2026,
  "e": [["אורן", 250], ["עדן", 225], ["נתנאל", 75], ["דוד בני", -550]]
}, {
  "iso": "2026-05-05",
  "d": 5,
  "mo": 5,
  "y": 2026,
  "e": [["דן", -250], ["עדן", -200], ["אורן", -350], ["קובי", -450], ["שגיא", 625], ["בני", 25], ["אופיר", 600]]
}, {
  "iso": "2026-05-12",
  "d": 12,
  "mo": 5,
  "y": 2026,
  "e": [["עדן", 810], ["אורן", 330], ["דוד בני", -325], ["נתנאל", -225], ["רוי", -68], ["שגיא", -88], ["אופיר", -435]]
}, {
  "iso": "2026-05-16",
  "d": 16,
  "mo": 5,
  "y": 2026,
  "e": [["עדן", -360], ["דן", -115], ["עדן גורשומוב", -175], ["דור", -105], ["קובי", -600], ["אורן", 375], ["שגיא", 900], ["אופיר", 80]]
}, {
  "iso": "2026-05-19",
  "d": 19,
  "mo": 5,
  "y": 2026,
  "e": [["עדן", 550], ["נתנאל", 90], ["אורן", -30], ["קובי", -42], ["שפאק", -395], ["איציק", -175]]
}, {
  "iso": "2026-05-23",
  "d": 23,
  "mo": 5,
  "y": 2026,
  "e": [["שגיא", -185], ["אורן", -375], ["דור", -200], ["דן", 500], ["עדן גורשומוב", 65], ["עדן", 190]]
}, {
  "iso": "2026-05-26",
  "d": 26,
  "mo": 5,
  "y": 2026,
  "e": [["אופיר", -500], ["קובי", -40], ["שגיא", -200], ["אורן", -40], ["דן", 300], ["עדן", 480]]
}, {
  "iso": "2026-06-01",
  "d": 1,
  "mo": 6,
  "y": 2026,
  "e": [["ירדן", 450], ["עדן", 215], ["אורן", 210], ["שגיא", -300], ["דוד בני", -150], ["דור", -100], ["עדן גורשומוב", -250], ["איציק", -125]]
}, {
  "iso": "2026-06-05",
  "d": 5,
  "mo": 6,
  "y": 2026,
  "e": [["עדן", -115], ["איציק", -250], ["ירדן", -200], ["קובי", -50], ["אורן", -130], ["שגיא", 625], ["דו", 120]]
}, {
  "iso": "2026-06-10",
  "d": 10,
  "mo": 6,
  "y": 2026,
  "e": [["איציק", -50], ["קובי", -500], ["אורן", -140], ["ירדן", 50], ["דן", 200], ["עדן", 430], ["מייקי", 115]]
}, {
  "iso": "2026-06-13",
  "d": 13,
  "mo": 6,
  "y": 2026,
  "e": [["עדן", -55], ["איציק", -75], ["אורן", -125], ["נתנאל", -100], ["דור", -30], ["אופיר", -110], ["דוד בני", -130], ["דן", 625]]
}, {
  "iso": "2026-06-17",
  "d": 17,
  "mo": 6,
  "y": 2026,
  "e": [["עדן", 135], ["אופיר", 42], ["נתנאל", -74], ["איציק", -37], ["אורן", -67]]
}, {
  "iso": "2026-06-18",
  "d": 18,
  "mo": 6,
  "y": 2026,
  "e": [["דוד בני", 60], ["קובי", 145], ["אורן", 320], ["עדן", -350], ["שגיא", -175]]
}, {
  "iso": "2026-06-22",
  "d": 22,
  "mo": 6,
  "y": 2026,
  "e": [["אופיר", 30], ["קובי", 195], ["אורן", 100], ["דן", 300], ["נתנאל", -50], ["איציק וירדן", -200], ["עדן", -25], ["שגיא", -350]]
}, {
  "iso": "2026-06-24",
  "d": 24,
  "mo": 6,
  "y": 2026,
  "e": [["דור", 20], ["דוד בני", 50], ["אופיר", 215], ["אורן", 200], ["עדן גורשומוב", -150], ["נתנאל", -75], ["עדן", -205], ["קובי", -50]]
}, {
  "iso": "2026-06-25",
  "d": 25,
  "mo": 6,
  "y": 2026,
  "e": [["עדן גורשומוב", -130], ["נתנאל", -25], ["עדן", -5], ["קובי", -50]]
}, {
  "iso": "2026-06-28",
  "d": 28,
  "mo": 6,
  "y": 2026,
  "e": [["אורן", -215], ["קובי", -125], ["אופיר", -45], ["נתנאל", -30], ["עדן", 150], ["שגיא", 130], ["דוד בני", 130]]
}, {
  "iso": "2026-07-11",
  "d": 11,
  "mo": 7,
  "y": 2026,
  "e": [["קובי", -385], ["אורן", -125], ["נתנאל", -100], ["דור", -200], ["מייקי", 265], ["דן", 75], ["אופיר", 157], ["עדן", 310]]
}, {
  "iso": "2026-07-15",
  "d": 15,
  "mo": 7,
  "y": 2026,
  "e": [["קובי", 150], ["דוד בני", 265], ["אופיר", 855], ["אורן", -260], ["עדן", -45], ["שגיא", -800], ["דן", -165]]
}, {
  "iso": "2026-07-18",
  "d": 18,
  "mo": 7,
  "y": 2026,
  "e": [["דן", -250], ["דוד בני", -150], ["שי", -300], ["אורן", -350], ["דן הספר", -200], ["ארתור", -100], ["אור", 600], ["עדן", 185], ["אופיר", 370], ["שגיא", 290]]
}, {
  "iso": "2026-07-21",
  "d": 21,
  "mo": 7,
  "y": 2026,
  "e": [["עדן", -50], ["אורן", -160], ["אופיר", -200], ["נתנאל", -15], ["דן", -170], ["דור", -100], ["קובי", 380], ["עדן גורשומוב", 325]]
}, {
  "iso": "2026-07-26",
  "d": 26,
  "mo": 7,
  "y": 2026,
  "e": [["אורן", -65], ["איציק", -125], ["עדן", -310], ["דור", -225], ["אופיר", -90], ["דן", 200], ["קובי", 90], ["דוד בני", 340], ["שגיא", 135]]
}];
const SEED_YEARLY = {
  id: "official_2025",
  y: 2025,
  official: true,
  entries: [{
    name: "אופיר",
    amount: 5181
  }, {
    name: "שגיא",
    amount: 2608
  }, {
    name: "דוד בני",
    amount: 1611
  }, {
    name: "מייקי",
    amount: 630
  }, {
    name: "עדן",
    amount: 314
  }, {
    name: "דן ויסמן",
    amount: 275
  }, {
    name: "עדן גורשומוב",
    amount: 242
  }, {
    name: "ירין",
    amount: 50
  }, {
    name: "דני",
    amount: -30
  }, {
    name: "עמית",
    amount: -50
  }, {
    name: "יובל",
    amount: -50
  }, {
    name: "ניצן",
    amount: -50
  }, {
    name: "משה",
    amount: -50
  }, {
    name: "שמואל",
    amount: -50
  }, {
    name: "גל",
    amount: -60
  }, {
    name: "טוני",
    amount: -100
  }, {
    name: "איתן",
    amount: -450
  }, {
    name: "נתנאל",
    amount: -483
  }, {
    name: "נועם",
    amount: -500
  }, {
    name: "פריצי",
    amount: -534
  }, {
    name: "איציק",
    amount: -728
  }, {
    name: "דן",
    amount: -880
  }, {
    name: "אורן",
    amount: -912.5
  }, {
    name: "קובי",
    amount: -2068
  }, {
    name: "דור",
    amount: -2198
  }]
};

/* ------------------------ db helpers ----------------------- */
const seedToSession = s => ({
  id: "s_" + s.iso,
  iso: s.iso,
  d: s.d,
  mo: s.mo,
  y: s.y,
  entries: s.e.map(([name, amount]) => ({
    name,
    amount
  }))
});
const buildSeedDb = () => ({
  sessions: SEED.map(seedToSession).sort((a, b) => a.iso.localeCompare(b.iso)),
  yearly: [SEED_YEARLY],
  monthly: [],
  aliases: {},
  roster: []
});
// שיתוף אמין: (1) Web Share API — גיליון השיתוף של iOS, בוחרים וואטסאפ והקבוצה; הטקסט עובר נקי.
// (2) נפילה להעתקה ללוח (כמו באפליקציית הטעינות). (3) נפילה אחרונה: deep-link ישיר לאפליקציה.
/* ============================ APP ============================ */
function App({ readOnly = false, onTabChange, statsPanel = null, onGameStart, renderRsvps, onRecords, onPlanShared, initialTab = "table" }) {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  // initialTab מאפשר לרענון מבחוץ (remount אחרי פינג מהבוט) לא לזרוק
  // את המשתמש בחזרה לטבלה
  const [tab, setTabState] = useState(initialTab);
  // מעבר טאב מדווח החוצה — ככה יומן הצפיות יודע במה כל צופה הסתכל
  const setTab = id => {
    setTabState(id);
    if (typeof onTabChange === "function") onTabChange(id);
  };
  const canWrite = !readOnly;
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadConfig();
      const raw = await store.get(DB_KEY);
      let d;
      if (raw) {
        try {
          d = normalize(JSON.parse(raw));
        } catch {
          d = buildSeedDb();
        }
      } else d = buildSeedDb(); // ברירת מחדל בזיכרון בלבד — לא נכתב אוטומטית
      if (alive) {
        setDb(d);
        setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const commit = n => {
    if (readOnly) return;
    setDb(n);
    store.set(DB_KEY, JSON.stringify(n));
  }; // כתיבה רק בפעולת משתמש

  const years = useMemo(() => {
    if (!db) return [];
    const s = new Set([new Date().getFullYear()]);
    db.sessions.forEach(x => s.add(x.y));
    db.yearly.forEach(x => s.add(x.y));
    return [...s].sort((a, b) => b - a);
  }, [db]);
  if (!ready || !db) return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    style: {
      background: C.feltDeep,
      color: C.dim,
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      fontFamily: "'Rubik',system-ui,sans-serif"
    }
  }, /*#__PURE__*/React.createElement(Style, null), /*#__PURE__*/React.createElement("div", null, "\u05D8\u05D5\u05E2\u05DF\u2026"));
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    style: {
      background: C.feltDeep,
      color: C.cream,
      minHeight: "100vh",
      fontFamily: "'Rubik',system-ui,sans-serif"
    }
  }, /*#__PURE__*/React.createElement(Style, null), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 640,
      margin: "0 auto",
      padding: "0 13px calc(90px + env(safe-area-inset-bottom))"
    }
  }, /*#__PURE__*/React.createElement(Header, null), /*#__PURE__*/React.createElement(Banner, {
    db: db,
    onPlayer: setProfile
  }), tab === "input" ? /*#__PURE__*/React.createElement(InputTab, {
    db: db,
    commit: commit,
    years: years
  }) : tab === "live" ? /*#__PURE__*/React.createElement(LiveTab, {
    db: db,
    commit: commit,
    onGameStart: onGameStart,
    renderRsvps: renderRsvps,
    onRecords: onRecords,
    onPlanShared: onPlanShared
  }) : tab === "sessions" ? /*#__PURE__*/React.createElement(SessionsTab, {
    db: db,
    commit: commit,
    goEdit: r => {
      setTab("input");
      setTimeout(() => window.__loadRaw?.(r), 0);
    }
  }) : tab === "table" ? /*#__PURE__*/React.createElement(TableTab, {
    db: db,
    years: years,
    readOnly: readOnly
  }) : tab === "stats" && statsPanel ? statsPanel : tab === "records" ? /*#__PURE__*/React.createElement(RecordsTab, {
    db: db
  }) : /*#__PURE__*/React.createElement(PlayersTab, {
    db: db,
    onPlayer: setProfile
  }), /*#__PURE__*/React.createElement(EGFooter, null)), profile && /*#__PURE__*/React.createElement(ProfileSheet, {
    db: db,
    name: profile,
    onClose: () => setProfile(null)
  }), /*#__PURE__*/React.createElement(TabBar, {
    tab: tab,
    setTab: setTab,
    n: db.sessions.length,
    readOnly: readOnly,
    hasStats: !!statsPanel
  }));
}

/* --------------------- שבירת שיאים בסוף ערב --------------------- */
/* משווה את הערב שנשמר עכשיו מול כל ההיסטוריה שלפניו, ומחזיר שורות
   מוכנות לוואטסאפ על כל שיא שנשבר. רק שיאים "של ערב" נבדקים — דברים
   שיכולים להישבר ברגע שהערב נסגר, לא מדדים מצטברים איטיים. */
export function brokenRecords(db, rec) {
  const A = AL(db);
  const old = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));
  if (old.length < 5) return []; // אין טעם ב"שיא" מול היסטוריה של כלום

  const nightOf = s => {
    const t = {};
    for (const e of s.entries) {
      const nm = canon(e.name, A);
      t[nm] = r2((t[nm] || 0) + e.amount);
    }
    return t;
  };

  let bestOld = null, worstOld = null, stormyOld = 0;
  const hist = {};
  for (const s of old) {
    let moved = 0;
    for (const [nm, amount] of Object.entries(nightOf(s))) {
      (hist[nm] = hist[nm] || []).push(amount);
      if (amount > 0) moved = r2(moved + amount);
      if (!bestOld || amount > bestOld.amount) bestOld = { name: nm, amount };
      if (!worstOld || amount < worstOld.amount) worstOld = { name: nm, amount };
    }
    if (moved > stormyOld) stormyOld = moved;
  }

  let streakOld = null;
  for (const [nm, arr] of Object.entries(hist)) {
    let cur = 0, max = 0;
    for (const v of arr) {
      cur = v > 0 ? cur + 1 : 0;
      if (cur > max) max = cur;
    }
    if (!streakOld || max > streakOld.count) streakOld = { name: nm, count: max };
  }

  const lines = [];
  const tNew = nightOf(rec);
  let movedNew = 0;
  for (const [nm, amount] of Object.entries(tNew)) {
    if (amount > 0) movedNew = r2(movedNew + amount);
    if (bestOld && amount > bestOld.amount) {
      lines.push(`🔥 ${nm} שבר את ערב השיא בהיסטוריה: ${fmt(amount)} (הקודם: ${bestOld.name} · ${fmt(bestOld.amount)})`);
    }
    if (worstOld && amount < worstOld.amount) {
      lines.push(`🥶 ${nm} קבע את הערב הקשה בהיסטוריה: ${fmt(amount)} (הקודם: ${worstOld.name} · ${fmt(worstOld.amount)})`);
    }
  }
  if (stormyOld > 0 && movedNew > stormyOld) {
    lines.push(`💸 הערב הסוער בהיסטוריה: ${movedNew}₪ החליפו ידיים (השיא הקודם: ${stormyOld}₪)`);
  }
  if (streakOld && streakOld.count >= 2) {
    for (const [nm, amount] of Object.entries(tNew)) {
      if (amount <= 0) continue;
      const arr = hist[nm] || [];
      let tail = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i] > 0; i--) tail++;
      if (tail + 1 > streakOld.count) {
        lines.push(`⚡ ${nm} עם רצף הניצחונות הארוך אי פעם: ${tail + 1} ערבים ברצף (הקודם: ${streakOld.name} · ${streakOld.count})`);
      }
    }
  }

  // חילופי שלטון — מישהו עקף את מלך כל הזמנים
  const before = allTimeTotals(db)[0];
  const after = allTimeTotals({ ...db, sessions: [...db.sessions, rec] })[0];
  if (before && after && after.name !== before.name) {
    lines.push(`🐐 חילופי שלטון! ${after.name} עקף את ${before.name} והוא מלך כל הזמנים עם ${fmt(after.amount)}`);
  }

  return lines;
}

/* --------------------------- records ------------------------ */
/* מסך השיאים. הכל מחושב מהערבים עצמם (db.sessions), בלי טבלאות עזר. */
function RecordsTab({ db }) {
  const A = AL(db);
  const recs = useMemo(() => {
    const sessions = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));
    if (!sessions.length) return null;

    // סכום לילה לכל שחקן, לכל ערב
    const perNight = sessions.map(s => {
      const t = {};
      for (const e of s.entries) {
        const nm = canon(e.name, A);
        t[nm] = r2((t[nm] || 0) + e.amount);
      }
      return { iso: s.iso, d: s.d, mo: s.mo, y: s.y, totals: t };
    });

    let stormyNight = null;
    const nightList = []; // כל תוצאה של כל שחקן בכל ערב — למציאת שיא + סגן
    const history = {}; // name -> [amount, amount...] כרונולוגי
    const monthAgg = {}; // "name|y-mo" -> סכום החודש לשחקן
    const attend = {}; // name -> {cur, max} — נוכחות בערבים רצופים

    for (const n of perNight) {
      let moved = 0;
      const present = new Set(Object.keys(n.totals));
      for (const [nm, amount] of Object.entries(n.totals)) {
        (history[nm] = history[nm] || []).push(amount);
        nightList.push({ name: nm, amount, d: n.d, mo: n.mo, y: n.y });
        if (amount > 0) moved = r2(moved + amount);
        const mk = `${nm}|${n.y}-${n.mo}`;
        monthAgg[mk] = r2((monthAgg[mk] || 0) + amount);
        const at = attend[nm] = attend[nm] || { cur: 0, max: 0 };
        at.cur += 1;
        if (at.cur > at.max) at.max = at.cur;
      }
      for (const nm of Object.keys(attend)) if (!present.has(nm)) attend[nm].cur = 0;
      // "הערב הסוער" — כמה כסף החליף ידיים (סכום הזכיות של אותו ערב)
      if (!stormyNight || moved > stormyNight.moved) stormyNight = { moved, d: n.d, mo: n.mo, y: n.y };
    }

    // ערבי השיא — הטוב והקשה, כל אחד עם הסגן שלו
    nightList.sort((a, b) => b.amount - a.amount);
    const bestNight = nightList[0] || null;
    const bestNight2 = nightList[1] || null;
    const worstNight = nightList[nightList.length - 1] || null;
    const worstNight2 = nightList[nightList.length - 2] || null;

    /* סטטיסטיקה פר שחקן — הכל מ-history הכרונולוגי: רצפים, אחוז ניצחונות,
       ממוצע, תנודתיות (סטיית תקן) והקאמבק. מחושב פעם אחת ואז ממוינים
       לכל שיא בנפרד, כך שקל לשלוף גם את הסגן. */
    const MIN_NIGHTS = 5;
    const stats = Object.entries(history).map(([nm, arr]) => {
      let cur = 0, max = 0, lcur = 0, lmax = 0;
      for (const v of arr) {
        cur = v > 0 ? cur + 1 : 0;
        if (cur > max) max = cur;
        lcur = v < 0 ? lcur + 1 : 0;
        if (lcur > lmax) lmax = lcur;
      }
      let tail = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i] > 0; i--) tail++;
      let comeback = null;
      for (let i = 1; i < arr.length; i++) {
        if (arr[i - 1] < 0 && arr[i] > 0) {
          const jump = r2(arr[i] - arr[i - 1]);
          if (!comeback || jump > comeback.jump) comeback = { jump, from: arr[i - 1], to: arr[i] };
        }
      }
      const wins = arr.filter(v => v > 0).length;
      const sum = r2(arr.reduce((s, v) => s + v, 0));
      const avg = r2(sum / arr.length);
      const sd = Math.round(Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length));
      return {
        name: nm, nights: arr.length, wins, sum, avg, sd,
        rate: Math.round(wins / arr.length * 100),
        maxStreak: max, tail, lossMax: lmax, comeback,
        attendMax: attend[nm]?.max || 0,
      };
    });

    // שניים הראשונים לפי מדד — [שיאן, סגן]
    const top2 = (key, filter = () => true) => {
      const s = stats.filter(filter).sort((a, b) => key(b) - key(a));
      return [s[0] || null, s[1] || null];
    };

    const [bestStreak, bestStreak2] = top2(s => s.maxStreak, s => s.maxStreak >= 2);
    const [liveStreak] = top2(s => s.tail, s => s.tail >= 2);
    const [lossStreak] = top2(s => s.lossMax, s => s.lossMax >= 3);
    const [winRate, winRate2] = top2(s => s.rate, s => s.nights >= MIN_NIGHTS);
    const [bestAvg, bestAvg2] = top2(s => s.avg, s => s.nights >= MIN_NIGHTS && s.avg > 0);
    const [mostWins, mostWins2] = top2(s => s.wins);
    const [most, most2] = top2(s => s.nights);
    const [attendTop, attendTop2] = top2(s => s.attendMax, s => s.attendMax >= 3);
    const [roller] = top2(s => s.sd, s => s.nights >= MIN_NIGHTS);
    const comeback = stats.reduce(
      (m, s) => s.comeback && (!m || s.comeback.jump > m.jump) ? { name: s.name, ...s.comeback } : m,
      null
    );

    // החודש הטוב אי פעם — שחקן + חודש עם הנטו הגבוה ביותר
    let bestMonth = null;
    for (const [key, amount] of Object.entries(monthAgg)) {
      if (!bestMonth || amount > bestMonth.amount) {
        const [nm, ym] = key.split("|");
        const [yy, mm] = ym.split("-");
        bestMonth = { name: nm, amount, y: +yy, mo: +mm };
      }
    }

    // מלך המלכים — מי סיים הכי הרבה חודשים במקום הראשון
    const bestOfMonth = {};
    for (const [key, amount] of Object.entries(monthAgg)) {
      const [nm, ym] = key.split("|");
      if (!bestOfMonth[ym] || amount > bestOfMonth[ym].amount) bestOfMonth[ym] = { name: nm, amount };
    }
    const crownCount = {};
    for (const b of Object.values(bestOfMonth)) crownCount[b.name] = (crownCount[b.name] || 0) + 1;
    const crowns = Object.entries(crownCount).sort((a, b) => b[1] - a[1]);

    // השנה הטובה אי פעם — לפי המאזן הרשמי כשקיים
    const yearsSet = new Set([...sessions.map(s => s.y), ...db.yearly.map(x => x.y)]);
    let bestYear = null;
    for (const y of yearsSet) {
      for (const t of yearTotals(db, y).totals) {
        if (!bestYear || t.amount > bestYear.amount) bestYear = { name: t.name, amount: t.amount, y };
      }
    }

    // מלכי התקופה: החודש האחרון שיש בו ערבים, השנה, וכל הזמנים
    const last = sessions[sessions.length - 1];
    const monthT = monthTotals(db, last.y, last.mo);
    const yearT = yearTotals(db, last.y).totals;
    const allT = allTimeTotals(db);

    /* הערב האחרון — תמיד מעניין מה קרה הרגע: מי לקח, מי נתן, כמה עבר
       ידיים, והאם נשברו שיאים (אותה בדיקה שמפעילה את ההכרזה בוואטסאפ). */
    const lastN = perNight[perNight.length - 1];
    const lastRows = Object.entries(lastN.totals).sort((a, b) => b[1] - a[1]);
    let lastBroken = [];
    try {
      lastBroken = brokenRecords({ ...db, sessions: sessions.slice(0, -1) }, last);
    } catch {}
    const topRow = lastRows[0] && lastRows[0][1] > 0 ? { name: lastRows[0][0], amount: lastRows[0][1] } : null;
    const prevOfTop = topRow
      ? perNight.slice(0, -1).map(n => n.totals[topRow.name]).filter(v => v != null)
      : [];
    const lastNight = {
      label: `${lastN.d}.${lastN.mo}.${String(lastN.y).slice(2)}`,
      count: lastRows.length,
      top: topRow,
      bottom: lastRows.length && lastRows[lastRows.length - 1][1] < 0
        ? { name: lastRows[lastRows.length - 1][0], amount: lastRows[lastRows.length - 1][1] }
        : null,
      moved: r2(lastRows.reduce((s, [, v]) => s + (v > 0 ? v : 0), 0)),
      personalBest: !!(topRow && prevOfTop.length >= 3 && topRow.amount > Math.max(...prevOfTop)),
      broken: lastBroken,
    };

    return {
      lastNight,
      bestNight, bestNight2, worstNight, worstNight2,
      bestStreak, bestStreak2, liveStreak, lossStreak,
      winRate, winRate2, bestAvg, bestAvg2, mostWins, mostWins2,
      comeback, stormyNight, bestMonth, bestYear, roller,
      attendTop, attendTop2,
      crownKing: crowns[0] ? { name: crowns[0][0], count: crowns[0][1] } : null,
      crownKing2: crowns[1] ? { name: crowns[1][0], count: crowns[1][1] } : null,
      monthKing: monthT[0] || null, monthKing2: monthT[1] || null,
      monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
      yearKing: yearT[0] || null, yearKing2: yearT[1] || null, yearLabel: `${last.y}`,
      allKing: allT[0] || null, allKing2: allT[1] || null,
      most, most2,
      totalNights: sessions.length,
    };
  }, [db]);

  if (!recs) return <Empty text="עוד אין ערבים — אין שיאים." />;

  const Card = ({ icon, title, holder, value, tone, sub, runner }) => (
    <div style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      padding: "13px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <span style={{ fontSize: 26, flex: "0 0 auto" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.dim }}>{title}</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.cream }}>{holder}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.dim }}>{sub}</div>}
        {runner && (
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>🥈 {runner}</div>
        )}
      </div>
      <b style={{
        fontSize: 16,
        color: tone || C.brass,
        fontVariantNumeric: "tabular-nums",
        flex: "0 0 auto",
      }}>{value}</b>
    </div>
  );

  const dt = (r) => `${r.d}.${r.mo}.${String(r.y).slice(2)}`;

  return (
    <div style={{ marginTop: 4 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 2px 4px" }}>שיאים</h2>
      <p style={{ color: C.dim, fontSize: 12, margin: "0 2px 12px" }}>
        מ־{recs.totalNights} ערבים מתועדים
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recs.lastNight && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.brass, margin: "2px 2px 0" }}>
              ♠ מהערב האחרון · {recs.lastNight.label} · {recs.lastNight.count} שחקנים
            </div>
            {recs.lastNight.top && (
              <Card icon="🌟" title="גיבור הערב" holder={recs.lastNight.top.name}
                value={fmt(recs.lastNight.top.amount)} tone={C.win}
                sub={recs.lastNight.personalBest ? "🚀 שיא אישי חדש — התוצאה הטובה שלו אי פעם" : undefined} />
            )}
            {recs.lastNight.bottom && (
              <Card icon="🥀" title="הנפילה של הערב" holder={recs.lastNight.bottom.name}
                value={fmt(recs.lastNight.bottom.amount)} tone={C.loss} />
            )}
            {recs.lastNight.moved > 0 && (
              <Card icon="💸" title="עבר ידיים בערב" holder="סך כל הזכיות"
                value={fmt(recs.lastNight.moved)} />
            )}
            {recs.lastNight.broken.length > 0 && (
              <div style={{
                background: C.card, border: `1px solid ${C.brass}66`,
                borderRadius: 14, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 12, color: C.brass, fontWeight: 700, marginBottom: 6 }}>
                  🏆 שיאים שנשברו בערב הזה
                </div>
                {recs.lastNight.broken.map((line, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: C.cream, lineHeight: 1.7 }}>{line}</div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.brass, margin: "8px 2px 0" }}>
              🏛 כל הזמנים
            </div>
          </>
        )}
        {recs.monthKing && (
          <Card icon="👑" title={`מלך ${recs.monthLabel}`} holder={recs.monthKing.name}
            value={fmt(recs.monthKing.amount)} tone={C.win}
            runner={recs.monthKing2 && `${recs.monthKing2.name} · ${fmt(recs.monthKing2.amount)}`} />
        )}
        {recs.yearKing && (
          <Card icon="🏆" title={`מוביל ${recs.yearLabel}`} holder={recs.yearKing.name}
            value={fmt(recs.yearKing.amount)} tone={C.win}
            runner={recs.yearKing2 && `${recs.yearKing2.name} · ${fmt(recs.yearKing2.amount)}`} />
        )}
        {recs.allKing && (
          <Card icon="🐐" title="מלך כל הזמנים" holder={recs.allKing.name}
            value={fmt(recs.allKing.amount)} tone={C.win}
            runner={recs.allKing2 && `${recs.allKing2.name} · ${fmt(recs.allKing2.amount)}`} />
        )}
        {recs.crownKing && (
          <Card icon="🥇" title="מלך המלכים — הכי הרבה חודשים במקום הראשון" holder={recs.crownKing.name}
            value={`${recs.crownKing.count} כתרים`}
            runner={recs.crownKing2 && `${recs.crownKing2.name} · ${recs.crownKing2.count} כתרים`} />
        )}
        {recs.bestNight && (
          <Card icon="🔥" title="ערב השיא בהיסטוריה" holder={recs.bestNight.name}
            value={fmt(recs.bestNight.amount)} tone={C.win} sub={dt(recs.bestNight)}
            runner={recs.bestNight2 && `${recs.bestNight2.name} · ${fmt(recs.bestNight2.amount)} · ${dt(recs.bestNight2)}`} />
        )}
        {recs.worstNight && recs.worstNight.amount < 0 && (
          <Card icon="🥶" title="הערב הקשה בהיסטוריה" holder={recs.worstNight.name}
            value={fmt(recs.worstNight.amount)} tone={C.loss} sub={dt(recs.worstNight)}
            runner={recs.worstNight2 && recs.worstNight2.amount < 0 &&
              `${recs.worstNight2.name} · ${fmt(recs.worstNight2.amount)} · ${dt(recs.worstNight2)}`} />
        )}
        {recs.bestMonth && (
          <Card icon="📅" title="החודש הטוב אי פעם" holder={recs.bestMonth.name}
            value={fmt(recs.bestMonth.amount)} tone={C.win}
            sub={`${MONTHS[recs.bestMonth.mo - 1]} ${recs.bestMonth.y}`} />
        )}
        {recs.bestYear && (
          <Card icon="🗓️" title="השנה הטובה אי פעם" holder={recs.bestYear.name}
            value={fmt(recs.bestYear.amount)} tone={C.win} sub={`${recs.bestYear.y}`} />
        )}
        {recs.liveStreak && (
          <Card icon="⚡" title="רצף ניצחונות פעיל" holder={recs.liveStreak.name}
            value={`${recs.liveStreak.tail} ערבים`} />
        )}
        {recs.bestStreak && (
          <Card icon="🎖️" title="רצף הניצחונות הארוך אי פעם" holder={recs.bestStreak.name}
            value={`${recs.bestStreak.maxStreak} ערבים`}
            runner={recs.bestStreak2 && `${recs.bestStreak2.name} · ${recs.bestStreak2.maxStreak} ערבים`} />
        )}
        {recs.lossStreak && (
          <Card icon="🌧️" title="הרצף הקשה אי פעם" holder={recs.lossStreak.name}
            value={`${recs.lossStreak.lossMax} ערבים`} tone={C.loss} />
        )}
        {recs.comeback && (
          <Card icon="🎢" title="הקאמבק הגדול" holder={recs.comeback.name}
            value={fmt(recs.comeback.jump)} tone={C.win}
            sub={`מ־${fmt(recs.comeback.from)} ל־${fmt(recs.comeback.to)} בערב אחד`} />
        )}
        {recs.winRate && (
          <Card icon="🎲" title="אחוז הניצחונות הגבוה ביותר" holder={recs.winRate.name}
            value={`${recs.winRate.rate}%`} tone={C.win}
            sub={`מתוך ${recs.winRate.nights} ערבים (מינימום 5)`}
            runner={recs.winRate2 && `${recs.winRate2.name} · ${recs.winRate2.rate}%`} />
        )}
        {recs.bestAvg && (
          <Card icon="📈" title="הממוצע הטוב ביותר לערב" holder={recs.bestAvg.name}
            value={fmt(recs.bestAvg.avg)} tone={C.win}
            sub={`על פני ${recs.bestAvg.nights} ערבים (מינימום 5)`}
            runner={recs.bestAvg2 && `${recs.bestAvg2.name} · ${fmt(recs.bestAvg2.avg)}`} />
        )}
        {recs.mostWins && recs.mostWins.wins > 0 && (
          <Card icon="✅" title="הכי הרבה ערבים חיוביים" holder={recs.mostWins.name}
            value={`${recs.mostWins.wins} ערבים`} tone={C.win}
            sub={`מתוך ${recs.mostWins.nights}`}
            runner={recs.mostWins2 && recs.mostWins2.wins > 0 &&
              `${recs.mostWins2.name} · ${recs.mostWins2.wins} ערבים`} />
        )}
        {recs.roller && recs.roller.sd > 0 && (
          <Card icon="🌪️" title="רכבת ההרים — הכי תנודתי" holder={recs.roller.name}
            value={`±${recs.roller.sd}₪`}
            sub="כמה רחוק הוא מהממוצע של עצמו בערב טיפוסי" />
        )}
        {recs.stormyNight && recs.stormyNight.moved > 0 && (
          <Card icon="💸" title="הערב הסוער — הכי הרבה כסף החליף ידיים" holder={dt(recs.stormyNight)}
            value={fmt(recs.stormyNight.moved)} />
        )}
        {recs.attendTop && (
          <Card icon="🪑" title="לא מפספס — הכי הרבה ערבים ברצף" holder={recs.attendTop.name}
            value={`${recs.attendTop.attendMax} ערבים`}
            runner={recs.attendTop2 && `${recs.attendTop2.name} · ${recs.attendTop2.attendMax} ערבים`} />
        )}
        {recs.most && (
          <Card icon="🎯" title="המתמיד — הכי הרבה ערבים" holder={recs.most.name}
            value={`${recs.most.nights}`}
            runner={recs.most2 && `${recs.most2.name} · ${recs.most2.nights}`} />
        )}
      </div>
    </div>
  );
}

/* --------------------------- players ------------------------ */
function PlayersTab({
  db,
  onPlayer
}) {
  const A = AL(db);
  const nowD = new Date();
  const [scope, setScope] = useState("all"); // all | year | month
  const [y, setY] = useState(nowD.getFullYear());
  const [mo, setMo] = useState(nowD.getMonth() + 1);

  const years = useMemo(() => {
    const set = new Set([...db.sessions.map(x => x.y), ...db.yearly.map(x => x.y)]);
    return [...set].sort((a, b) => b - a);
  }, [db]);

  const totals = useMemo(() => {
    if (scope === "year") return yearTotals(db, y).totals;
    if (scope === "month") return monthTotals(db, y, mo);
    return allTimeTotals(db);
  }, [db, scope, y, mo]);

  // ספירת הערבים חייבת להיות באותו חתך כמו הסכומים, אחרת הממוצע לא מייצג
  const counts = useMemo(() => {
    const inScope = db.sessions.filter(x => scope === "all" ? true : scope === "year" ? x.y === y : x.y === y && x.mo === mo);
    const c = {};
    for (const x of inScope) {
      const seen = new Set();
      for (const e of x.entries) {
        const nm = canon(e.name, A);
        if (!seen.has(nm)) {
          c[nm] = (c[nm] || 0) + 1;
          seen.add(nm);
        }
      }
    }
    return c;
  }, [db, scope, y, mo]);

  const sub = scope === "all" ? "2025 לפי המאזן השנתי הרשמי · שאר השנים לפי הערבים" : scope === "year" ? `כל הערבים של ${y}` : `${MONTHS[mo - 1]} ${y}`;
  const pill = active => ({
    cursor: "pointer",
    borderRadius: 999,
    padding: "6px 14px",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    background: active ? C.brass : C.card,
    color: active ? C.feltDeep : C.dim,
    border: `1px solid ${active ? C.brass : C.line}`
  });
  const sel = {
    background: C.card,
    color: C.cream,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: "6px 10px",
    fontFamily: "inherit",
    fontSize: 13
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      margin: "6px 2px 4px"
    }
  }, "שחקנים"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap",
      alignItems: "center",
      margin: "10px 2px 6px"
    }
  }, ["all", "year", "month"].map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setScope(k),
    style: pill(scope === k)
  }, k === "all" ? "הכל" : k === "year" ? "שנה" : "חודש")), scope !== "all" && /*#__PURE__*/React.createElement("select", {
    value: y,
    onChange: e => setY(+e.target.value),
    style: sel
  }, years.map(yy => /*#__PURE__*/React.createElement("option", {
    key: yy,
    value: yy
  }, yy))), scope === "month" && /*#__PURE__*/React.createElement("select", {
    value: mo,
    onChange: e => setMo(+e.target.value),
    style: sel
  }, MONTHS.map((m, i) => /*#__PURE__*/React.createElement("option", {
    key: m,
    value: i + 1
  }, m)))), /*#__PURE__*/React.createElement("p", {
    style: {
      color: C.dim,
      fontSize: 12,
      margin: "0 2px 12px"
    }
  }, sub), !totals.length ? /*#__PURE__*/React.createElement(Empty, {
    text: "אין ערבים בתקופה הזאת."
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, totals.map((t, i) => {
    const c = counts[t.name] || 0;
    const avg = c ? r2(t.amount / c) : null;
    return /*#__PURE__*/React.createElement("button", {
      key: t.name,
      onClick: () => onPlayer(t.name),
      style: {
        textAlign: "right",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: C.card,
        border: `1px solid ${i === 0 ? C.brass : C.line}`,
        borderRadius: 12,
        padding: "11px 14px"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "0 0 20px",
        color: C.dim,
        fontSize: 13,
        fontVariantNumeric: "tabular-nums"
      }
    }, i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0,
        fontSize: 14.5,
        fontWeight: 600,
        color: C.cream,
        display: "flex",
        alignItems: "center",
        gap: 5
      }
    }, i === 0 && /*#__PURE__*/React.createElement(Crown, {
      size: 15,
      color: C.brass
    }), t.name), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 1,
        fontSize: 11,
        color: C.dim,
        lineHeight: 1.35
      }
    }, /*#__PURE__*/React.createElement("span", null, c, " ערבים"), avg !== null && /*#__PURE__*/React.createElement("span", {
      style: {
        color: avg >= 0 ? C.win : C.loss,
        fontVariantNumeric: "tabular-nums",
        opacity: 0.85
      }
    }, fmt(avg), " לערב")), /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 16,
        color: t.amount >= 0 ? C.win : C.loss,
        fontVariantNumeric: "tabular-nums",
        minWidth: 62,
        textAlign: "left"
      }
    }, fmt(t.amount)), /*#__PURE__*/React.createElement(ChevronLeft, {
      size: 16,
      color: C.dim
    }));
  })));
}

/* --------------------------- profile ------------------------ */
function ProfileSheet({
  db,
  name,
  onClose
}) {
  const A = AL(db);
  const cn = canon(name, A);
  const rows = useMemo(() => {
    const out = [];
    let cum = 0;
    for (const s of [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso))) {
      let v = 0,
        has = false;
      for (const e of s.entries) {
        if (canon(e.name, A) === cn) {
          v += e.amount;
          has = true;
        }
      }
      if (has) {
        cum = r2(cum + v);
        out.push({
          iso: s.iso,
          label: `${s.d}.${s.mo}`,
          night: r2(v),
          cum
        });
      }
    }
    return out;
  }, [db, cn]);
  const official = allTimeTotals(db).find(t => t.name === cn);
  const total = official ? official.amount : rows.length ? rows[rows.length - 1].cum : 0;
  const best = rows.reduce((m, r) => r.night > (m?.night ?? -1e9) ? r : m, null);
  const worst = rows.reduce((m, r) => r.night < (m?.night ?? 1e9) ? r : m, null);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.55)",
      zIndex: 40,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    dir: "rtl",
    style: {
      width: "100%",
      maxWidth: 640,
      background: C.felt,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      border: `1px solid ${C.line}`,
      padding: "18px 16px 26px",
      maxHeight: "86vh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 21,
      fontWeight: 800
    }
  }, cn), /*#__PURE__*/React.createElement(IconBtn, {
    onClick: onClose
  }, /*#__PURE__*/React.createElement(X, {
    size: 17
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "\u05E0\u05D8\u05D5 \u05DB\u05D5\u05DC\u05DC",
    value: fmt(total),
    color: total >= 0 ? C.win : C.loss
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\u05E2\u05E8\u05D1\u05D9\u05DD",
    value: rows.length
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\u05E2\u05E8\u05D1 \u05E9\u05D9\u05D0",
    value: best ? fmt(best.night) : "—",
    color: C.win
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "\u05E2\u05E8\u05D1 \u05D2\u05E8\u05D5\u05E2",
    value: worst ? fmt(worst.night) : "—",
    color: C.loss
  })), rows.length > 1 ? /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      padding: "14px 12px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: C.dim,
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(TrendingUp, {
    size: 14
  }), "\u05E8\u05D5\u05D5\u05D7 \u05DE\u05E6\u05D8\u05D1\u05E8 \u05DC\u05E4\u05D9 \u05E2\u05E8\u05D1\u05D9\u05DD"), /*#__PURE__*/React.createElement(CumChart, {
    rows: rows
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: C.dim,
      fontSize: 13,
      textAlign: "center",
      padding: 20
    }
  }, "\u05E6\u05E8\u05D9\u05DA \u05D9\u05D5\u05EA\u05E8 \u05DE\u05E2\u05E8\u05D1 \u05D0\u05D7\u05D3 \u05DC\u05D2\u05E8\u05E3."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11.5,
      color: C.dim,
      marginTop: 8
    }
  }, "\u05D4\u05D2\u05E8\u05E3 \u05DE\u05E1\u05DB\u05DD \u05E2\u05E8\u05D1\u05D9\u05DD \u05D1\u05DC\u05D1\u05D3; \"\u05E0\u05D8\u05D5 \u05DB\u05D5\u05DC\u05DC\" \u05DE\u05EA\u05D9\u05D9\u05E9\u05E8 \u05DC\u05DE\u05D0\u05D6\u05DF \u05D4\u05E9\u05E0\u05EA\u05D9 \u05D4\u05E8\u05E9\u05DE\u05D9 (2025)."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: C.dim,
      padding: "0 2px 2px"
    }
  }, "\u05DC\u05E4\u05D9 \u05E2\u05E8\u05D1"), [...rows].reverse().map(r => /*#__PURE__*/React.createElement("div", {
    key: r.iso,
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderRadius: 9,
      background: C.card,
      border: `1px solid ${C.line}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, r.label, ".", r.iso.slice(0, 4)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: r.night >= 0 ? C.win : C.loss,
      fontVariantNumeric: "tabular-nums"
    }
  }, fmt(r.night)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim,
      fontVariantNumeric: "tabular-nums",
      minWidth: 52,
      textAlign: "left"
    }
  }, fmt(r.cum))))))));
}
/* ----------------------------- live ------------------------- */
/* כתובות המארחים הקבועים — לחיצה ממלאת את שדה ההערה בתכנון ערב,
   כדי לא להקליד את אותה כתובת מחדש בכל פעם. */
const HOSTS = [
  { label: "אצלי", text: "אצל עדן · לויתן 4, נתניה · קומה 23, דירה 2303 · קוד בניין #4770#" },
  { label: "אופיר סנה", text: "אצל אופיר סנה · לויתן 4, נתניה · קומה 15, דירה 1503 · קוד בניין #4770#" },
  { label: "דור ועדן לירז", text: "אצל דור ועדן לירז · תותחנים 16, כפר יונה" },
  { label: "שגיא גיל", text: "אצל שגיא גיל · יהדות הדממה 11, הרצליה" },
  { label: "איציק", text: "אצל איציק · יוסף בורג 10, נתניה · קומה 2, דירה 6 · קוד בניין #7580" },
];

/* תכנון הערב הבא. נשמר בתוך ה-DB (db.plan) ולכן זורם לצופים דרך אותו
   snapshot — הם רואים את התאריך ועונים מגיע/לא בטבלת ה-RSVP. */
function PlanCard({ db, commit, renderRsvps, onPlanShared }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const plan = db.plan && db.plan.iso >= todayIso ? db.plan : null;
  const [editing, setEditing] = useState(false);
  const [iso, setIso] = useState("");
  const [time, setTime] = useState("21:00");
  const [note, setNote] = useState("");

  const startEdit = () => {
    setIso(plan?.iso || todayIso);
    setTime(plan?.time || "21:00");
    setNote(plan?.note || "");
    setEditing(true);
  };
  const save = () => {
    if (!iso) return;
    const next = { iso, time, note: note.trim(), createdAt: Date.now() };
    commit({ ...db, plan: next });
    setEditing(false);
    // ההזמנה יוצאת לקבוצת הוואטסאפ עם הלינק — שהחברים יאשרו הגעה
    if (typeof onPlanShared === "function") onPlanShared(next, { isUpdate: !!plan });
  };
  const clear = () => {
    commit({ ...db, plan: null });
    setEditing(false);
  };

  const field = {
    background: C.feltDeep,
    border: `1px solid ${C.line}`,
    borderRadius: 9,
    color: C.cream,
    fontFamily: "inherit",
    fontSize: 13.5,
    padding: "9px 10px",
    colorScheme: "dark",
  };

  if (!plan && !editing) {
    return (
      <button
        onClick={startEdit}
        style={{
          width: "100%",
          padding: "11px 12px",
          borderRadius: 12,
          border: `1px dashed ${C.line}`,
          background: "transparent",
          color: C.dim,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        📅 תכנן את הערב הבא — החברים יאשרו הגעה מהלינק
      </button>
    );
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.brass}66`,
        borderRadius: 12,
        padding: "11px 12px",
        marginBottom: 12,
      }}
    >
      {editing ? (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.brass, marginBottom: 8 }}>
            📅 תכנון הערב הבא
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="date" value={iso} min={todayIso}
              onChange={(e) => setIso(e.target.value)} style={{ ...field, flex: 1.4 }} />
            <input type="time" value={time}
              onChange={(e) => setTime(e.target.value)} style={{ ...field, flex: 1 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {HOSTS.map((h) => (
              <button
                key={h.label}
                onClick={() => setNote(h.text)}
                style={{
                  padding: "5px 11px", borderRadius: 999,
                  border: `1px solid ${note === h.text ? C.brass : C.line}`,
                  background: note === h.text ? `${C.brass}22` : "transparent",
                  color: note === h.text ? C.brass : C.dim,
                  fontFamily: "inherit", fontSize: 12, cursor: "pointer",
                }}
              >
                📍 {h.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (איפה, מה להביא…) — לא חובה"
            style={{ ...field, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{
              flex: 1, padding: "10px 12px", borderRadius: 10, border: "none",
              background: C.brass, color: C.feltDeep, fontFamily: "inherit",
              fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>
              שמור
            </button>
            <button onClick={() => setEditing(false)} style={{
              padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.line}`,
              background: "transparent", color: C.dim, fontFamily: "inherit",
              fontSize: 13, cursor: "pointer",
            }}>
              ביטול
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: plan.note ? 2 : 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.brass }}>♠ הערב הבא</div>
              <div style={{ fontSize: 13.5, color: C.cream }}>{planLabel(plan)}</div>
            </div>
            <button onClick={startEdit} style={{
              padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.line}`,
              background: "transparent", color: C.cream, fontFamily: "inherit",
              fontSize: 12, cursor: "pointer",
            }}>
              עריכה
            </button>
            <button onClick={clear} style={{
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: "transparent", color: C.dim, fontFamily: "inherit",
              fontSize: 12, cursor: "pointer",
            }}>
              בטל
            </button>
          </div>
          {plan.note && (
            <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>{plan.note}</div>
          )}
          {typeof renderRsvps === "function" && renderRsvps(plan.iso)}
        </>
      )}
    </div>
  );
}

/* מתג הבוט בקבוצת הוואטסאפ. החיבור ל-Whapi נשאר תמיד חי — המתג רק קובע אם
   ה-webhook מגיב לפקודות. נדלק לבד כשנפתח משחק, נכבה לבד כשהערב נסגר. */
function BotToggle({ on, onChange }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${on ? C.win + "77" : C.line}`,
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: on ? C.win : C.dim,
          boxShadow: on ? `0 0 0 3px ${C.win}22` : "none",
          flex: "0 0 auto",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.cream }}>
          בוט הוואטסאפ {on ? "פעיל" : "כבוי"}
        </div>
        <div style={{ fontSize: 11.5, color: C.dim }}>
          {on ? "מגיב לפקודות בקבוצה. נכבה לבד בסוף הערב." : "נדלק לבד כשנפתח משחק, או ידנית כאן."}
        </div>
      </div>
      <button
        onClick={() => onChange(!on)}
        style={{
          border: "none",
          cursor: "pointer",
          borderRadius: 999,
          padding: "7px 16px",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 700,
          background: on ? C.feltDeep : C.brass,
          color: on ? C.cream : C.feltDeep,
        }}
      >
        {on ? "כבה" : "הדלק"}
      </button>
    </div>
  );
}

function LiveTab({
  db,
  commit,
  onGameStart,
  renderRsvps,
  onRecords,
  onPlanShared
}) {
  const A = AL(db);
  const known = useMemo(() => {
    const dates = db.sessions.map(s => s.iso).sort();
    const latest = dates.length ? dates[dates.length - 1] : null;
    // חלון "החודשים האחרונים": ~100 ימים אחורה מהערב האחרון
    const cutoff = latest ? new Date(new Date(latest).getTime() - 100 * 864e5).toISOString().slice(0, 10) : "0000-00-00";
    const recent = {},
      allc = {};
    for (const s of db.sessions) {
      const seen = new Set();
      for (const e of s.entries) {
        const n = canon(e.name, A);
        if (seen.has(n)) continue;
        seen.add(n);
        allc[n] = (allc[n] || 0) + 1;
        if (s.iso >= cutoff) recent[n] = (recent[n] || 0) + 1;
      }
    }
    const names = new Set(Object.keys(allc));
    (db.roster || []).forEach(n => names.add(canon(n, A)));
    // הכי פעילים לאחרונה קודם, אחר כך לפי סה"כ, ואז א"ב
    return [...names].sort((a, b) => (recent[b] || 0) - (recent[a] || 0) || (allc[b] || 0) - (allc[a] || 0) || a.localeCompare(b, "he"));
  }, [db]);
  const [cfg, setCfg] = useState(getConfig());
  useEffect(() => onConfig(setCfg), []);
  const cps = cfg.chipsPerShekel || 2;
  const [players, setPlayers] = useState([]); // {name, buyin(₪), cashout(chips string)}
  const [name, setName] = useState("");
  const [addAmt, setAddAmt] = useState(50);
  const [entriesCount, setEntriesCount] = useState(""); // כניסות שהכנתי (מלאי כולל)
  const [share, setShare] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [startedAt, setStartedAt] = useState(null); // חותמת זמן התחלת המשחק
  const [prompt, setPrompt] = useState(null); // הצעה לשלוח עדכון אחרי כניסה
  const [nowTs, setNowTs] = useState(Date.now()); // מתקתק לטיימר החי

  // שחזור משחק פעיל אחרי סגירת האפליקציה
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await store.get(LIVE_KEY);
      if (alive && raw) {
        try {
          const d = JSON.parse(raw);
          if (Array.isArray(d.players)) setPlayers(d.players);
          if (d.entriesCount !== undefined) setEntriesCount(d.entriesCount);
          if (d.addAmt) setAddAmt(d.addAmt);
          if (d.startedAt) setStartedAt(d.startedAt);
        } catch {}
      }
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // שמירה אוטומטית בכל שינוי
  useEffect(() => {
    if (!hydrated) return;
    if (players.length === 0) {
      store.set(LIVE_KEY, "");
      return;
    }
    store.set(LIVE_KEY, JSON.stringify({
      players,
      entriesCount,
      addAmt,
      startedAt,
      ts: Date.now()
    }));
  }, [players, entriesCount, addAmt, startedAt, hydrated]);

  // ההצעה נעלמת לבד אחרי 15 שניות כדי לא להפריע
  useEffect(() => {
    if (!prompt) return;
    const id = setTimeout(() => setPrompt(null), 15000);
    return () => clearTimeout(id);
  }, [prompt]);

  // שעון חי — מתעדכן כל שנייה כל עוד יש משחק פעיל
  useEffect(() => {
    if (!startedAt || players.length === 0) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, players.length]);
  const now = new Date();
  const dLbl = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const addPlayer = nm => {
    nm = nm.trim();
    if (!nm || players.some(p => p.name === nm)) return;
    setPlayers(p => {
      if (p.length === 0 && !startedAt) {
        setStartedAt(Date.now());
        // משחק נפתח — הבוט בקבוצה נדלק לבד, והצופים מקבלים התראה
        if (!getConfig().botOn) setConfig({ botOn: true });
        if (typeof onGameStart === "function") onGameStart();
      }
      return [...p, {
        name: nm,
        buyin: addAmt,
        cashout: ""
      }];
    });
    setName("");
  };
  const GRACE_MS = 10 * 60 * 1000; // 10 דק' חסד בתחילת המשחק — לא מציעים לשלוח
  const bump = (i, amt) => {
    setPlayers(p => p.map((x, j) => j === i ? {
      ...x,
      buyin: Math.max(0, r2((+x.buyin || 0) + amt))
    } : x));
    if (amt > 0 && startedAt && Date.now() - startedAt > GRACE_MS) {
      const nm = players[i] && players[i].name;
      setPrompt({
        name: nm,
        amt,
        id: Date.now()
      });
    }
  };
  const setField = (i, patch) => setPlayers(p => p.map((x, j) => j === i ? {
    ...x,
    ...patch
  } : x));
  const rm = i => setPlayers(p => p.filter((_, j) => j !== i));
  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  const potChips = pot * cps;
  const anyCash = players.some(p => p.cashout !== "");
  const nets = players.map(p => ({
    name: p.name,
    net: p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0))
  }));
  const settled = nets.filter(n => n.net !== null);
  const netSum = r2(settled.reduce((s, n) => s + n.net, 0));
  const cashSumChips = players.reduce((s, p) => s + (p.cashout === "" ? 0 : +p.cashout || 0), 0);

  // מונה כניסות: כניסה אחת = 50₪. בשימוש = הקופה חלקי 50. נותרו = שהכנתי פחות בשימוש.
  const ENTRY = 50;
  const entriesUsed = r2(pot / ENTRY);
  const entriesPrepared = entriesCount === "" ? null : +entriesCount || 0;
  const entriesLeft = entriesPrepared === null ? null : r2(entriesPrepared - entriesUsed);

  // דוח ביט מתעדכן — בפורמט הקבוצה
  // אותו מפרמט בדיוק שהבוט בוואטסאפ משתמש בו — כדי ששני הטקסטים לא יתפצלו
  const bitReport = useMemo(() => buildReport({
    players,
    entriesCount,
    startedAt,
    now: nowTs,
    cps
  }), [players, entriesCount, startedAt, nowTs, cps]);
  function saveNight() {
    const entries = nets.filter(n => n.net !== null && n.net !== 0).map(n => ({
      name: n.name,
      amount: n.net
    }));
    if (!entries.length) return;
    const d = now.getDate(),
      mo = now.getMonth() + 1,
      y = now.getFullYear();
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const endedAt = Date.now();
    const rec = {
      id: "live_" + Date.now(),
      iso,
      d,
      mo,
      y,
      entries,
      startedAt: startedAt || null,
      endedAt
    };
    const roster = [...new Set([...(db.roster || []), ...players.map(p => p.name)])];
    // שבירת שיאים נבדקת מול ה-db שלפני ההוספה — ואם נשבר משהו, הבוט מכריז בקבוצה
    if (typeof onRecords === "function") {
      try {
        const broken = brokenRecords(db, rec);
        if (broken.length) onRecords(broken);
      } catch (e) {
        console.warn("record check failed:", e.message);
      }
    }
    commit({
      ...db,
      sessions: [...db.sessions, rec].sort((a, b) => a.iso.localeCompare(b.iso)),
      roster
    });
    store.set(LIVE_KEY, "");
    // החלוקה מחושבת כאן ונשמרת לתצוגה מקדימה. היא לא נשלחת לשום מקום
    // עד שתאשר אותה במסך השיתוף.
    const split = buildSettlement(settle(players, cps), {
      now: endedAt,
      isCashOnly,
      transferVerb
    });
    setShare({
      entries,
      d,
      mo,
      final: true,
      startedAt: startedAt || null,
      endedAt,
      settlement: split
    });
    setPlayers([]);
    setEntriesCount("");
    setStartedAt(null);
    setOutCount("");
    // הערב נסגר — הבוט חוזר לישון עד המשחק הבא
    if (getConfig().botOn) setConfig({ botOn: false });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(BotToggle, {
    on: !!cfg.botOn,
    onChange: v => setConfig({
      botOn: v
    })
  }), players.length === 0 && /*#__PURE__*/React.createElement(PlanCard, {
    db: db,
    commit: commit,
    renderRsvps: renderRsvps,
    onPlanShared: onPlanShared
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11.5,
      color: C.dim,
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(UserPlus, {
    size: 13
  }), "\u05D4\u05D5\u05E1\u05E3 \u05E9\u05D7\u05E7\u05DF (\u05D7\u05D3\u05E9 \u05D0\u05D5 \u05E7\u05D9\u05D9\u05DD)"), /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    onKeyDown: e => e.key === "Enter" && addPlayer(name),
    placeholder: "\u05E9\u05DD",
    style: {
      ...inputStyle,
      marginTop: 4,
      width: "100%"
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => addPlayer(name),
    style: {
      background: C.brass,
      color: C.feltDeep,
      border: "none",
      borderRadius: 9,
      padding: "11px 15px",
      fontWeight: 700,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 18
  }))), known.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 10,
      maxHeight: 88,
      overflowY: "auto"
    }
  }, known.filter(k => !players.some(p => p.name === k)).map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => addPlayer(k),
    style: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 16,
      background: C.feltDeep,
      border: `1px solid ${C.line}`,
      color: C.cream,
      cursor: "pointer"
    }
  }, k))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      fontSize: 12.5,
      color: C.dim
    }
  }, /*#__PURE__*/React.createElement(Coins, {
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "1 \u05E9\"\u05D7 = ", cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      marginRight: "auto"
    }
  }, [2, 4].map(v => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setConfig({
      chipsPerShekel: v
    }),
    style: {
      fontSize: 12,
      padding: "3px 9px",
      borderRadius: 7,
      cursor: "pointer",
      border: "none",
      fontWeight: cps === v ? 700 : 500,
      background: cps === v ? C.brass : C.feltDeep,
      color: cps === v ? C.feltDeep : C.cream
    }
  }, "\xD7", v))))), players.length === 0 ? /*#__PURE__*/React.createElement(Empty, {
    text: "\u05D4\u05D5\u05E1\u05E3 \u05E9\u05D7\u05E7\u05E0\u05D9\u05DD \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05E2\u05E8\u05D1 \u05D7\u05D9. \u05DB\u05DC \u05DB\u05E0\u05D9\u05E1\u05D4 \u05DE\u05D5\u05E1\u05D9\u05E4\u05D4 \u05DB\u05E1\u05E3 \u05DC\u05E7\u05D5\u05E4\u05D4, \u05D5\u05D4\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD \u05DE\u05EA\u05E2\u05D3\u05DB\u05E0\u05D9\u05DD \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA."
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05E1\u05DB\u05D5\u05DD \u05DB\u05E0\u05D9\u05E1\u05D4:"), [25, 50, 100].map(u => /*#__PURE__*/React.createElement("button", {
    key: u,
    onClick: () => setAddAmt(u),
    style: {
      fontSize: 13,
      padding: "6px 12px",
      borderRadius: 8,
      cursor: "pointer",
      border: "none",
      fontWeight: addAmt === u ? 700 : 500,
      background: addAmt === u ? C.brass : C.card,
      color: addAmt === u ? C.feltDeep : C.cream
    }
  }, u, "\u20AA")), /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim,
      fontSize: 12
    }
  }, "= ", addAmt * cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement(PokerTable, {
    players: players,
    cps: cps,
    addAmt: addAmt,
    pot: pot,
    potChips: potChips,
    onSeat: i => bump(i, addAmt),
    startedAt: startedAt,
    elapsed: startedAt ? nowTs - startedAt : 0
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, players.map((p, i) => {
    const net = p.cashout === "" ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: "10px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 15
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, net !== null && /*#__PURE__*/React.createElement("b", {
      style: {
        color: net >= 0 ? C.win : C.loss,
        fontVariantNumeric: "tabular-nums"
      }
    }, fmt(net), "\u20AA"), /*#__PURE__*/React.createElement(IconBtn, {
      onClick: () => rm(i),
      danger: true
    }, /*#__PURE__*/React.createElement(X, {
      size: 14
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(RoundBtn, {
      onClick: () => bump(i, -addAmt)
    }, /*#__PURE__*/React.createElement(Minus, {
      size: 14
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        minWidth: 70
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        fontSize: 15
      }
    }, +p.buyin || 0, "\u20AA"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: C.dim,
        fontVariantNumeric: "tabular-nums"
      }
    }, (+p.buyin || 0) * cps, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement(RoundBtn, {
      onClick: () => bump(i, addAmt)
    }, /*#__PURE__*/React.createElement(Plus, {
      size: 14
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginRight: "auto"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: C.dim
      }
    }, "\u05D9\u05E6\u05D0 (\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD)"), /*#__PURE__*/React.createElement("input", {
      value: p.cashout,
      onChange: e => setField(i, {
        cashout: e.target.value.replace(/\D/g, "")
      }),
      placeholder: "\u2014",
      style: {
        ...inputStyle,
        width: 66,
        textAlign: "center",
        padding: "7px 4px"
      }
    }))));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8,
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05D1\u05E7\u05D5\u05E4\u05D4"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontVariantNumeric: "tabular-nums"
    }
  }, pot, "\u20AA \xB7 ", potChips, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10,
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      flex: 1,
      fontSize: 11.5,
      color: C.dim
    }
  }, "\u05DB\u05E0\u05D9\u05E1\u05D5\u05EA \u05E9\u05D4\u05DB\u05E0\u05EA\u05D9", /*#__PURE__*/React.createElement("input", {
    value: entriesCount,
    onChange: e => setEntriesCount(e.target.value.replace(/\D/g, "")),
    placeholder: "0",
    style: {
      ...inputStyle,
      marginTop: 3,
      width: "100%",
      textAlign: "center"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: "center",
      fontSize: 12.5,
      color: C.dim,
      paddingBottom: 9
    }
  }, "\u05D1\u05E9\u05D9\u05DE\u05D5\u05E9 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.cream
    }
  }, entriesUsed), " \xB7 \u05E0\u05D5\u05EA\u05E8\u05D5 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: C.brass
    }
  }, entriesLeft === null ? "—" : entriesLeft), " \u05D1\u05D7\u05D5\u05E5")), /*#__PURE__*/React.createElement("button", {
    onClick: () => waSend(bitReport),
    style: {
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "none",
      fontSize: 14.5,
      fontWeight: 700,
      cursor: "pointer",
      background: "#25D366",
      color: "#06301B",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Send, {
    size: 17
  }), "\u05E9\u05DC\u05D7 \u05E2\u05D3\u05DB\u05D5\u05DF \u05D1\u05D9\u05D8 \u05DC\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShare({
      raw: bitReport
    }),
    style: {
      width: "100%",
      marginTop: 7,
      padding: 9,
      borderRadius: 10,
      border: `1px solid ${C.line}`,
      background: "transparent",
      color: C.dim,
      fontSize: 12.5,
      cursor: "pointer"
    }
  }, "\u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4 \u05E9\u05DC \u05D4\u05D3\u05D5\u05D7")), anyCash && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      background: C.card,
      border: `1px solid ${netSum === 0 && cashSumChips === potChips ? C.line : C.brass}`,
      borderRadius: 12,
      padding: 13,
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: C.dim
    }
  }, "\u05D9\u05E6\u05D0 (\u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD)"), /*#__PURE__*/React.createElement("b", {
    style: {
      fontVariantNumeric: "tabular-nums",
      color: cashSumChips === potChips ? C.cream : C.brass
    }
  }, cashSumChips, " / ", potChips)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7,
      color: netSum === 0 && cashSumChips === potChips ? C.win : C.brass,
      fontWeight: 600
    }
  }, netSum === 0 && cashSumChips === potChips ? /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 16
  }) : /*#__PURE__*/React.createElement(AlertTriangle, {
    size: 16
  }), cashSumChips !== potChips ? `הג'יטונים לא תואמים לקופה — פער ${fmt(r2((cashSumChips - potChips) / cps))}₪` : netSum === 0 ? "מאוזן" : `פער ${fmt(netSum)}₪`)), /*#__PURE__*/React.createElement("button", {
    onClick: saveNight,
    disabled: !settled.length,
    style: {
      width: "100%",
      marginTop: 12,
      padding: 14,
      borderRadius: 12,
      border: "none",
      fontSize: 16,
      fontWeight: 700,
      cursor: settled.length ? "pointer" : "not-allowed",
      background: settled.length ? C.brass : C.card,
      color: settled.length ? C.feltDeep : C.dim
    }
  }, "\u05E1\u05D9\u05D9\u05DD \xB7 \u05E9\u05DE\u05D5\u05E8 \xB7 \u05E9\u05DC\u05D7 \u05E1\u05D9\u05DB\u05D5\u05DD"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 11.5,
      color: C.dim
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(CheckCircle2, {
    size: 13,
    color: C.win
  }), "\u05D4\u05DE\u05E9\u05D7\u05E7 \u05E0\u05E9\u05DE\u05E8 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (confirm("לבטל את המשחק הפעיל? הנתונים שלו יימחקו.")) setPlayers([]);
    },
    style: {
      background: "none",
      border: "none",
      color: C.loss,
      fontSize: 11.5,
      cursor: "pointer",
      textDecoration: "underline",
      fontFamily: "inherit"
    }
  }, "\u05D1\u05D8\u05DC \u05DE\u05E9\u05D7\u05E7"))), share && /*#__PURE__*/React.createElement(ShareSheet, {
    title: share.final ? `סיכום פוקר ${share.d}.${share.mo}` : `עדכון ביט ${dLbl}`,
    text: share.raw !== undefined ? share.raw : toWhatsApp(share.entries, share, null, A),
    settlement: share.settlement,
    onClose: () => setShare(null)
  }), prompt && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 76,
      left: 12,
      right: 12,
      zIndex: 30,
      maxWidth: 616,
      margin: "0 auto",
      background: C.card,
      border: `1px solid ${C.brass}`,
      borderRadius: 14,
      padding: "11px 13px",
      boxShadow: "0 6px 24px rgba(0,0,0,.5)",
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, prompt.name, " \u05E0\u05DB\u05E0\u05E1 \u05E2\u05D5\u05D3 ", prompt.amt, "\u20AA"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: C.dim
    }
  }, "\u05DC\u05E9\u05DC\u05D5\u05D7 \u05E2\u05D3\u05DB\u05D5\u05DF \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4?")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      waOpen(bitReport);
      setPrompt(null);
    },
    style: {
      flexShrink: 0,
      background: "#25D366",
      color: "#06301B",
      border: "none",
      borderRadius: 10,
      padding: "9px 14px",
      fontWeight: 700,
      fontSize: 13.5,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Send, {
    size: 15
  }), "\u05E9\u05DC\u05D7"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPrompt(null),
    style: {
      flexShrink: 0,
      background: C.feltDeep,
      border: `1px solid ${C.line}`,
      borderRadius: 10,
      padding: 9,
      color: C.dim,
      cursor: "pointer",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement(X, {
    size: 15
  }))));
}
/* ------------------------- שולחן פוקר ----------------------- */
/* סדר מושבים קבוע. עדן תמיד למטה, והשאר נשמרים באותו מקום יחסי מערב לערב.
   לשינוי — מספיק לערוך את השורה הזאת. מי שלא ברשימה מקבל מושב פנוי בסוף. */
const SEAT_ORDER = ["עדן", "אופיר", "קובי", "דוד בני", "אורן", "דן"];
function seatSort(players) {
  const idx = nm => {
    const i = SEAT_ORDER.findIndex(x => nm === x || nm.startsWith(x));
    return i === -1 ? 999 : i;
  };
  return [...players].sort((a, b) => idx(a.name) - idx(b.name));
}
function PokerTable({
  players: rawPlayers,
  cps,
  addAmt,
  pot,
  potChips,
  onSeat,
  startedAt,
  elapsed
}) {
  const players = seatSort(rawPlayers);
  const n = players.length;
  // גובה גדל עם מספר השחקנים כדי שהמושבים לא יתנגשו
  const H = n <= 4 ? 250 : n <= 6 ? 280 : n <= 8 ? 310 : 340;
  const cx = 50,
    cy = 50,
    rx = 34,
    ry = 32; // אחוזים
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: H,
      marginBottom: 12,
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "12%",
      top: "14%",
      width: "76%",
      height: "72%",
      borderRadius: "50%",
      background: `radial-gradient(ellipse at 50% 40%, ${C.cardHi}, ${C.felt} 70%)`,
      border: `3px solid ${C.brassSoft}`,
      boxShadow: `inset 0 0 26px rgba(0,0,0,.45)`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 0,
      right: 0,
      top: "50%",
      transform: "translateY(-50%)",
      textAlign: "center",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.dim,
      marginBottom: 2
    }
  }, "\u05D1\u05E7\u05D5\u05E4\u05D4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 21,
      fontWeight: 800,
      color: C.brass,
      fontVariantNumeric: "tabular-nums"
    }
  }, pot, "\u20AA"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: C.dim,
      fontVariantNumeric: "tabular-nums"
    }
  }, potChips, " \u05D2'\u05D9\u05D8\u05D5\u05E0\u05D9\u05DD"), startedAt && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 7,
      paddingTop: 6,
      borderTop: `1px solid ${C.line}`,
      display: "inline-block",
      minWidth: 104
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: C.cream,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: .5
    }
  }, dur(elapsed)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: C.dim
    }
  }, "\u05DE\u05BE", hhmm(startedAt)))), players.map((p, i) => {
    const ang = Math.PI / 2 + i * 2 * Math.PI / Math.max(n, 1); // מתחיל למטה — שם יושב עדן
    const x = cx + rx * Math.cos(ang),
      y = cy + ry * Math.sin(ang);
    const chips = (+p.buyin || 0) * cps;
    return /*#__PURE__*/React.createElement("button", {
      key: p.name,
      onClick: () => onSeat(i),
      style: {
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%,-50%)",
        width: 78,
        padding: "7px 4px",
        borderRadius: 12,
        cursor: "pointer",
        border: `1px solid ${C.brassSoft}`,
        background: C.feltDeep,
        color: C.cream,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        boxShadow: "0 2px 8px rgba(0,0,0,.4)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%"
      }
    }, p.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums"
      }
    }, +p.buyin || 0, "\u20AA"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: C.dim,
        fontVariantNumeric: "tabular-nums"
      }
    }, chips, " \u05D2'"));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 6,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 10.5,
      color: C.dim,
      pointerEvents: "none"
    }
  }, "\u05DC\u05D7\u05D9\u05E6\u05D4 \u05E2\u05DC \u05E9\u05D7\u05E7\u05DF \u05DE\u05D5\u05E1\u05D9\u05E4\u05D4 ", addAmt, "\u20AA"));
}

/* ------------------- גרף רווח מצטבר (SVG עצמאי) ------------------- */
function CumChart({
  rows
}) {
  const W = 560,
    H = 170,
    PL = 42,
    PR = 10,
    PT = 10,
    PB = 22;
  const vals = rows.map(r => r.cum);
  let mn = Math.min(0, ...vals),
    mx = Math.max(0, ...vals);
  if (mn === mx) {
    mn -= 50;
    mx += 50;
  }
  const pad = (mx - mn) * 0.08;
  mn -= pad;
  mx += pad;
  const X = i => PL + i / (rows.length - 1) * (W - PL - PR);
  const Y = v => PT + (1 - (v - mn) / (mx - mn)) * (H - PT - PB);
  const d = rows.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r.cum).toFixed(1)}`).join(" ");
  const area = `${d} L${X(rows.length - 1).toFixed(1)},${Y(mn).toFixed(1)} L${X(0).toFixed(1)},${Y(mn).toFixed(1)} Z`;
  const ticks = [mx, (mx + mn) / 2, mn].map(v => Math.round(v));
  const lbl = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    height: "180",
    style: {
      display: "block",
      direction: "ltr"
    }
  }, ticks.map((t, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, /*#__PURE__*/React.createElement("line", {
    x1: PL,
    x2: W - PR,
    y1: Y(t),
    y2: Y(t),
    stroke: C.line,
    strokeWidth: "1",
    opacity: ".5"
  }), /*#__PURE__*/React.createElement("text", {
    x: PL - 6,
    y: Y(t) + 4,
    fill: C.dim,
    fontSize: "10",
    textAnchor: "end"
  }, t))), mn < 0 && mx > 0 && /*#__PURE__*/React.createElement("line", {
    x1: PL,
    x2: W - PR,
    y1: Y(0),
    y2: Y(0),
    stroke: C.dim,
    strokeWidth: "1.2",
    opacity: ".8"
  }), /*#__PURE__*/React.createElement("path", {
    d: area,
    fill: C.brass,
    opacity: ".13"
  }), /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: "none",
    stroke: C.brass,
    strokeWidth: "2.5",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: X(rows.length - 1),
    cy: Y(rows[rows.length - 1].cum),
    r: "4",
    fill: C.brass
  }), lbl.map((i, k) => /*#__PURE__*/React.createElement("text", {
    key: k,
    x: X(i),
    y: H - 6,
    fill: C.dim,
    fontSize: "10",
    textAnchor: k === 0 ? "start" : k === 2 ? "end" : "middle"
  }, rows[i].label)));
}

export default App;
export { PokerTable };
