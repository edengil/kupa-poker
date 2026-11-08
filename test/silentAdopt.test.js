// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* ============================================================================
   אימוץ מרוחק שקט — בדיקות רכיב (DOM אמיתי).

   עד היום כל עדכון מבחוץ (סימון שולם של צופה, יציאה שהבוט רשם, מיזוג
   ב־flush) הגיע למסך רק דרך הרכבה מחדש מלאה של PokerApp (key בעוטפים):
   הבהוב, מסך "טוען…", איבוד גלילה ומצב חולף. הבדיקות כאן מוכיחות את
   ההתנהגות החדשה על הרכיבים האמיתיים:
   - PokerApp מאמצת DB חדש מהחנות אחרי publishStoreKey — בלי unmount:
     רכיב זקיף בתוך העץ שומר את מצבו הפנימי, והנתון החדש מופיע.
   - LiveTab מאמצת לייב ממוזג אחרי seedStoreLive — יציאת הבוט מופיעה,
     וטיוטת שם בשדה ההוספה שורדת.
   על עץ הבסיס הבדיקות נכשלות: מנגנון הפרסום לא קיים שם, והרכיבים לא
   מאמצים דבר בלי הרכבה מחדש.
   ============================================================================ */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sentinel = vi.hoisted(() => ({ tableMounts: 0, rowMounts: 0 }));

vi.mock("../lib/analytics", () => ({ track: () => {} }));
vi.mock("../lib/pushClient", () => ({
  getNoticeDeliveryState: async () => null,
}));
vi.mock("../lib/postToGroup", () => ({ postToGroup: async () => {} }));
vi.mock("../lib/poker/notifyTransfersClient", () => ({
  notifyTransfersSettlement: async () => {},
}));
vi.mock("../components/Logo", () => ({ EGFooter: () => null }));
vi.mock("../components/poker/chrome", () => ({
  /* כותרת מינימלית שמשקפת את חוזה הבאדג' האמיתי (chrome.jsx): כפתור
     התראות עם מונה לא־נצפו — כדי שבדיקת ה־seen תוכל ללחוץ ולמדוד. */
  Header: (p) =>
    React.createElement(
      "div",
      null,
      p.onOpenNotices
        ? React.createElement(
            "button",
            { "data-testid": "notifications-button", onClick: p.onOpenNotices },
            p.noticeCount > 0
              ? React.createElement(
                  "span",
                  { "data-testid": "notifications-count" },
                  String(p.noticeCount)
                )
              : null
          )
        : null
    ),
  TabBar: () => null,
  Style: () => null,
  TABBAR_H: 0,
}));
vi.mock("../components/poker/Banner", () => ({ Banner: () => null }));
vi.mock("../components/poker/RecordsAlert.jsx", () => ({ RecordsAlert: () => null }));
vi.mock("../components/poker/SavingsPotCard.jsx", () => ({ SavingsPotCard: () => null }));
vi.mock("../components/poker/PersonalHighlightsCard", () => ({ PersonalHighlightsCard: () => null }));
vi.mock("../components/poker/PersonalStatsCard", () => ({ PersonalStatsCard: () => null }));
vi.mock("../components/poker/MonthHeroesCard", () => ({ MonthHeroesCard: () => null }));
vi.mock("../components/poker/RecentFormCard", () => ({ RecentFormCard: () => null }));
vi.mock("../components/poker/NightFocus", () => ({ NightFocus: () => null }));
vi.mock("../components/poker/TransferConfirmPopup", () => ({ TransferConfirmPopup: () => null }));
vi.mock("../components/poker/NotificationsSheet", () => ({
  /* גל 5, פריט 5.2: המגירה כבר לא מסמנת בפתיחה — היא מדווחת אילו פריטים
     הוצגו בפועל דרך onVisible, ורק הם מסומנים. המוק מדמה מגירה שמציגה
     את כל פריטיה מיד בהרכבה (כמו רשימה קצרה שנכנסת כולה למסך). */
  NotificationsSheet: (p) => {
    React.useEffect(() => {
      p.onVisible?.((p.items || []).map((i) => i.id));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
}));
vi.mock("../components/poker/PokerTable", () => ({ PokerTable: () => null }));
vi.mock("../components/poker/PlanCard", () => ({ PlanCard: () => null }));
vi.mock("../components/poker/BotToggle", () => ({ BotToggle: () => null }));
vi.mock("../components/poker/SavedSettlementEditor", () => ({ SavedSettlementEditor: () => null }));
vi.mock("../components/poker/ui", () => ({
  IconBtn: (p) => React.createElement("button", { onClick: p.onClick }, p.children),
  RoundBtn: (p) => React.createElement("button", { onClick: p.onClick }, p.children),
  Empty: () => null,
  inputStyle: {},
}));
vi.mock("../components/poker/icons", () => ({
  Plus: () => null,
  Minus: () => null,
  UserPlus: () => null,
  Coins: () => null,
  X: () => null,
}));
vi.mock("../components/poker/live/LiveDistributionPanel", () => ({ LiveDistributionPanel: () => null }));
vi.mock("../components/poker/live/LiveBuyinControls", () => ({ LiveBuyinControls: () => null }));
vi.mock("../components/poker/live/LivePotPanel", () => ({ LivePotPanel: () => null }));
vi.mock("../components/poker/live/LiveRebuysBoard", () => ({ LiveRebuysBoard: () => null }));
vi.mock("../components/poker/live/LiveShare", () => ({
  LiveBitShare: () => null,
  LiveShareSheet: () => null,
  LiveSendPrompt: () => null,
}));

/* טבלת הזקיף: מציגה סמן שנגזר מה־db (מספר ערבים) ושדה עם מצב פנימי.
   אם העץ מורכב מחדש — המצב מתאפס ומונה העליות גדל. */
vi.mock("../components/poker/TableTab", async () => {
  const React = await import("react");
  return {
    TableTab: (props) => {
      React.useEffect(() => {
        sentinel.tableMounts += 1;
      }, []);
      const [draft, setDraft] = React.useState("");
      return React.createElement(
        "div",
        null,
        React.createElement(
          "span",
          { "data-testid": "db-marker" },
          `sessions:${props.db?.sessions?.length ?? "?"}`
        ),
        React.createElement("input", {
          "data-testid": "sentinel-input",
          value: draft,
          onChange: (e) => setDraft(e.target.value),
        })
      );
    },
  };
});

/* שורת שחקן זקיף ללייב: מציגה את ה־cashout של השחקן וסופרת עליות. */
vi.mock("../components/poker/live/LivePlayerRow", async () => {
  const React = await import("react");
  return {
    LivePlayerRow: ({ p }) => {
      React.useEffect(() => {
        sentinel.rowMounts += 1;
      }, []);
      return React.createElement(
        "div",
        { "data-testid": `row-${p.name}` },
        React.createElement(
          "span",
          { "data-testid": `row-cashout-${p.name}` },
          String(p.cashout ?? "")
        )
      );
    },
  };
});

import PokerApp from "../components/PokerApp.jsx";
import { LiveTab } from "../components/poker/LiveTab.jsx";
import {
  configureStore,
  makeSupabaseStore,
  publishStoreKey,
  seedStoreLive,
  DB_KEY,
  LIVE_KEY,
} from "../lib/store.js";
import { buildSeedDb } from "../lib/poker/seed.js";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function memoryImpl(values) {
  const data = { ...values };
  return {
    data,
    get: async (key) => data[key] ?? null,
    set: async (key, value) => {
      data[key] = value;
      return true;
    },
    flush: async () => true,
    hasPending: () => false,
  };
}

function session(id) {
  return {
    id,
    iso: "2026-10-30",
    d: 30,
    mo: 10,
    y: 2026,
    entries: [
      { name: "אופיר", amount: 100 },
      { name: "דן", amount: -100 },
    ],
  };
}
const dbRaw = (sessions) =>
  JSON.stringify({ sessions, yearly: [], monthly: [], aliases: {}, roster: [], plan: null });
const DB_V1 = dbRaw([session("s1")]);
const DB_V2 = dbRaw([session("s1"), session("s2")]);

async function typeInto(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await tick();
  });
}

describe("אימוץ מרוחק שקט — רכיבים", () => {
  let container;
  let root;

  beforeEach(() => {
    sentinel.tableMounts = 0;
    sentinel.rowMounts = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("PokerApp (בעלים): DB מרוחק מאומץ במקום — הזקיף שורד, בלי מסך טעינה", async () => {
    configureStore(memoryImpl({ [DB_KEY]: DB_V1 }));
    await act(async () => {
      root.render(React.createElement(PokerApp));
      await tick();
    });
    const marker = () => container.querySelector('[data-testid="db-marker"]')?.textContent;
    expect(marker()).toBe("sessions:1");
    expect(sentinel.tableMounts).toBe(1);

    const input = container.querySelector('[data-testid="sentinel-input"]');
    await typeInto(input, "טיוטה חשובה");
    expect(input.value).toBe("טיוטה חשובה");

    /* רענון רקע: החנות הוחלפה בנתון שרת חדש והמפתח פורסם — כמו שהעוטפים
       עושים אחרי מיזוג/אימות רקע */
    await act(async () => {
      configureStore(memoryImpl({ [DB_KEY]: DB_V2 }));
      publishStoreKey(DB_KEY);
      await tick();
    });

    expect(marker()).toBe("sessions:2"); // הנתון החדש על המסך
    expect(input.value).toBe("טיוטה חשובה"); // מצב חולף שרד — לא הייתה הרכבה מחדש
    expect(sentinel.tableMounts).toBe(1); // העץ לא עלה מחדש
    expect(container.textContent).not.toContain("טוען"); // מסך הטעינה לא חזר
  });

  it("PokerApp (צופה): סימון שולם דרך RPC מתאמץ במקום — כמו PublicApp.markPayment", async () => {
    configureStore(memoryImpl({ [DB_KEY]: DB_V1 }));
    await act(async () => {
      root.render(
        React.createElement(PokerApp, {
          readOnly: true,
          onMarkPayment: async () => true,
        })
      );
      await tick();
    });
    const marker = () => container.querySelector('[data-testid="db-marker"]')?.textContent;
    expect(marker()).toBe("sessions:1");

    const input = container.querySelector('[data-testid="sentinel-input"]');
    await typeInto(input, "גלילה ומצב");
    expect(input.value).toBe("גלילה ומצב");

    /* בדיוק רצף ה־markPayment של PublicApp: החלפת תמונת החנות בנתון שחזר
       מה־RPC + פרסום המפתח */
    await act(async () => {
      configureStore(memoryImpl({ [DB_KEY]: DB_V2 }));
      publishStoreKey(DB_KEY);
      await tick();
    });

    expect(marker()).toBe("sessions:2");
    expect(input.value).toBe("גלילה ומצב");
    expect(sentinel.tableMounts).toBe(1);
    expect(container.textContent).not.toContain("טוען");
  });

  it("LiveTab: יציאה שהבוט רשם מאומצת במקום — טיוטת השם שורדת", async () => {
    const liveV1 = JSON.stringify({
      players: [{ name: "אופיר סנה", buyin: 100, cashout: "" }],
      entriesCount: "",
      addAmt: 50,
      savings5: true,
      potDraft: "",
      startedAt: 1762000000000,
      tips: [],
      coupleFills: [],
      actionLog: [],
      handOfNight: "",
      liveAnnounced: [],
      planSnap: null,
      cps: 2,
    });
    const impl = memoryImpl({ [LIVE_KEY]: liveV1 });
    configureStore(impl);
    const db = { sessions: [], yearly: [], monthly: [], aliases: {}, roster: [], plan: null };
    await act(async () => {
      root.render(React.createElement(LiveTab, { db, commit: () => {} }));
      await tick();
    });
    const cashout = () =>
      container.querySelector('[data-testid="row-cashout-אופיר סנה"]')?.textContent;
    expect(cashout()).toBe("");
    expect(sentinel.rowMounts).toBe(1);

    const nameInput = container.querySelector('[data-testid="live-player-name"]');
    expect(nameInput).toBeTruthy();
    await typeInto(nameInput, "דן");
    expect(nameInput.value).toBe("דן");

    /* הבוט רשם יציאה בוואטסאפ; checkLive מיזג וזרע את הלייב החדש בחנות —
       הזריעה מפרסמת את המפתח */
    const liveV2 = JSON.stringify({
      ...JSON.parse(liveV1),
      players: [{ name: "אופיר סנה", buyin: 100, cashout: "450" }],
      editedAt: 1762000060000,
    });
    impl.data[LIVE_KEY] = liveV2;
    await act(async () => {
      seedStoreLive(JSON.parse(liveV2));
      await tick();
    });

    expect(cashout()).toBe("450"); // יציאת הבוט על המסך בלי רענון ידני
    expect(nameInput.value).toBe("דן"); // טיוטת השם שרדה — לא הייתה הרכבה מחדש
    expect(sentinel.rowMounts).toBe(1); // שורת השחקן לא עלתה מחדש
  });

  it("אתחול קר: DB טרי מהשרת מגיע למסך מהמטמון הישן — בלי הרכבה מחדש (רגרסיית בודק)", async () => {
    /* התרחיש המדויק מהפסילה: מטמון מקומי ישן (ערב אחד), ובשרת DB חדש
       יותר (שני ערבים — כתיבות רקע/לילה). האפליקציה עולה מיד מהמקומי,
       ואימות־הרקע של ה־boot חייב לאמץ את הטרי למסך במקום. על הקוד
       שנפסל האימות החליף את מטמון החנות אבל לא פרסם — והמסך נשאר ישן. */
    localStorage.clear();
    localStorage.setItem("poker:cache:g-boot:data", DB_V1);
    const row = {
      data: JSON.parse(DB_V2),
      config: { chipsPerShekel: 2, defaultBuyin: 50, botOn: false },
      live: null,
    };
    const api = {
      from: () => ({
        select: (cols) => ({
          eq: () => ({
            single: async () => {
              if (cols === "data") return { data: { data: row.data }, error: null };
              if (cols === "config") return { data: { config: row.config }, error: null };
              if (cols === "live") return { data: { live: row.live }, error: null };
              return { data: { ...row, updated_at: "2026-01-01T00:00:00.000Z" }, error: null };
            },
          }),
        }),
      }),
      rpc: async () => ({ data: "2026-01-01T00:00:00.000Z", error: null }),
    };
    const onStale = vi.fn();
    configureStore(makeSupabaseStore(api, "g-boot", { onStale }));

    await act(async () => {
      root.render(React.createElement(PokerApp));
      await tick(120);
    });
    const marker = () => container.querySelector('[data-testid="db-marker"]')?.textContent;
    expect(marker()).toBe("sessions:2"); // הטרי מהשרת על המסך
    expect(sentinel.tableMounts).toBe(1); // בלי הרכבה מחדש של העץ
    expect(container.textContent).not.toContain("טוען");
    expect(onStale).not.toHaveBeenCalled(); // boot שקט — ניסוי H נשמר
    localStorage.clear();
  });

  it("באדג' התראות: נצפה נשמר גם אחרי הרכבה מחדש לצופה בלי שם (רגרסיית בודק)", async () => {
    /* שחזור יחידני של ספק הקצה notifications-seen: צופה בלי שם מזוהה
       (viewerName=null) פותח את המגירה — ה־id-ים נשמרים באחסון — ובהרכבה
       הבאה (רענון) הבאדג' חייב להישאר 0. על הקוד הישן מעקב ה־seenFor
       אותחל ל־null, זהה ל־viewerName של צופה בלי שם, וטעינת ה"נצפה"
       מעולם לא נורתה — הבאדג' קם לתחייה בכל רענון. */
    localStorage.clear();
    configureStore(memoryImpl({ [DB_KEY]: JSON.stringify(buildSeedDb()) }));
    const badge = () => container.querySelector('[data-testid="notifications-count"]');

    await act(async () => {
      root.render(React.createElement(PokerApp));
      await tick(120);
    });
    expect(badge()).toBeTruthy();
    expect(Number(badge().textContent)).toBeGreaterThan(0);

    await act(async () => {
      container
        .querySelector('[data-testid="notifications-button"]')
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await tick();
    });
    expect(badge()).toBeNull(); // נצפה — הבאדג' מתאפס

    /* הרכבה מחדש על אותו אחסון — כמו reload */
    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(PokerApp));
      await tick(120);
    });
    expect(badge()).toBeNull(); // הנצפה נטען מהאחסון — הבאדג' לא קם לתחייה
    localStorage.clear();
  });
});
