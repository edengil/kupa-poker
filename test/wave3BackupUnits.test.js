/* גל 3 — בדיקות יחידה JS:
   3.2 גיבוי מלא (round-trip של שלושת הבלובים, שם קובץ עם חותמת מלאה,
   תאימות לאחור לקובץ db ישן); 3.4 סניטציית אבחון (slug החוצה, טוקנים
   החוצה, חיתוך); 3.1/3.4 מריץ הצילומים והגיזום מול לקוח מזויף; 3.3
   runNoticeEmails עם order+limit מפורשים. */
import { describe, it, expect, vi } from "vitest";

const noticeH = vi.hoisted(() => ({ orderArgs: null, limitArgs: null }));

import {
  FULL_BACKUP_FORMAT,
  buildFullBackup,
  fullBackupFilename,
  fullBackupTimestamp,
  parseFullBackup,
} from "../lib/poker/db.js";
import {
  sanitizeDiagText,
  stripGroupSlugFromUrl,
} from "../lib/diagSanitize.js";
import { sanitizeDiagEntry } from "../lib/diagGuard.js";
import { runGroupSnapshots } from "../lib/groupSnapshots.js";

const DB = {
  sessions: [
    {
      id: "s1",
      y: 2026,
      mo: 10,
      d: 24,
      iso: "2026-10-24",
      entries: [{ name: "אבי", amount: 100 }],
    },
  ],
  yearly: [],
  monthly: [],
  aliases: {},
  emails: {},
  phones: {},
  roster: ["אבי"],
};
const CONFIG = { botOn: true, hosts: ["eden"] };
const LIVE = { players: [{ name: "אבי", buyin: 200 }], ts: 123 };

describe("3.2 full backup round-trip", () => {
  it("build → JSON → parse = שוויון של שלושת הבלובים", () => {
    const built = buildFullBackup({ db: DB, config: CONFIG, live: LIVE });
    expect(built.format).toBe(FULL_BACKUP_FORMAT);
    const parsed = parseFullBackup(JSON.parse(JSON.stringify(built)));
    expect(parsed.full).toBe(true);
    expect(parsed.db).toEqual(built.db);
    expect(parsed.config).toEqual(CONFIG);
    expect(parsed.live).toEqual(LIVE);
  });

  it("live ריק נשמר כ־null ועובר round-trip", () => {
    const built = buildFullBackup({ db: DB, config: CONFIG, live: null });
    const parsed = parseFullBackup(JSON.parse(JSON.stringify(built)));
    expect(parsed.live).toBeNull();
  });

  it("שם קובץ עם חותמת זמן מלאה — שני גיבויים באותו יום לא מתנגשים", () => {
    const a = fullBackupFilename(new Date("2026-11-08T09:15:00.000Z"));
    const b = fullBackupFilename(new Date("2026-11-08T21:40:05.000Z"));
    expect(a).toBe("kupa-poker-full-2026-11-08T09-15-00.json");
    expect(b).toBe("kupa-poker-full-2026-11-08T21-40-05.json");
    expect(a).not.toBe(b);
    expect(fullBackupTimestamp(new Date("2026-11-08T09:15:00.000Z"))).toBe(
      "2026-11-08T09-15-00"
    );
  });

  it("קובץ ישן (db בלבד) נקרא כתאימות־לאחור: full=false", () => {
    const parsed = parseFullBackup(JSON.parse(JSON.stringify(DB)));
    expect(parsed.full).toBe(false);
    expect(parsed.db.sessions).toHaveLength(1);
    expect(parsed.config).toBeUndefined();
  });

  it("config שאינו אובייקט נדחה; db פגום נדחה", () => {
    expect(() =>
      parseFullBackup({ format: FULL_BACKUP_FORMAT, db: DB, config: [1, 2], live: null })
    ).toThrow(/config/);
    expect(() =>
      parseFullBackup({ format: FULL_BACKUP_FORMAT, db: { nope: true }, config: {}, live: null })
    ).toThrow();
    expect(() => parseFullBackup(null)).toThrow();
  });
});

describe("3.4 diag sanitize", () => {
  it("ה־slug יוצא מה־URL; query ו־hash נושרים", () => {
    expect(
      stripGroupSlugFromUrl("https://kupa-poker.vercel.app/g/502329063a21?token=abc#x")
    ).toBe("https://kupa-poker.vercel.app/g/%E2%80%A6");
    expect(stripGroupSlugFromUrl("https://x.example/")).toBe("https://x.example/");
    expect(stripGroupSlugFromUrl("")).toBe("");
    expect(stripGroupSlugFromUrl("/g/abc123/n/boot")).toBe("/g/…/n/boot");
  });

  it("תבניות טוקן מוסרות מהטקסט החופשי + חיתוך אורך", () => {
    const out = sanitizeDiagText(
      "failed with Bearer abc.def-123 and key sb_secret_XYZ789 and apikey=zzz",
      1000
    );
    expect(out).not.toContain("abc.def-123");
    expect(out).not.toContain("sb_secret_XYZ789");
    expect(out).not.toContain("zzz");
    expect(out).toContain("[נמחק]");
    expect(sanitizeDiagText("x".repeat(50), 10)).toHaveLength(10);
  });

  it("sanitizeDiagEntry: ‏URL בלי slug, הודעה מסוננת — גם במסלול מנהל וגם לקוח", () => {
    const raw = {
      kind: "error",
      message: "boom Bearer tok123",
      stack: "trace",
      url: "https://kupa-poker.vercel.app/g/mysecretslug",
      ua: "ua",
    };
    for (const admin of [true, false]) {
      const e = sanitizeDiagEntry(raw, { admin });
      expect(e.url).not.toContain("mysecretslug");
      expect(e.message).not.toContain("tok123");
    }
  });
});

/* לקוח אדמין מזויף למריץ הצילומים: groups ב־select, ‏rpc snapshot_group,
   ומחיקות עם lt+select שמחזירות שורות "שנמחקו". */
function fakeAdmin({ groups = [], rpcFailFor = new Set(), deletedRows = 3 } = {}) {
  const calls = { rpc: [], deletes: [] };
  return {
    calls,
    from(table) {
      if (table === "groups") {
        return { select: async () => ({ data: groups, error: null }) };
      }
      return {
        delete() {
          const chain = {
            lt(col, val) {
              calls.deletes.push({ table, col, val });
              return chain;
            },
            select: async () => ({
              data: Array.from({ length: deletedRows }, (_, i) => ({ id: i })),
              error: null,
            }),
          };
          return chain;
        },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (rpcFailFor.has(args.p_group_id)) {
        return { data: null, error: { message: "boom" } };
      }
      return { data: "snap-id", error: null };
    },
  };
}

describe("3.1/3.4 snapshot runner", () => {
  const NOW = new Date("2026-11-08T05:00:00.000Z");

  it("מצלם כל קבוצה ב־reason=daily וגוזם צילומים (30 יום) ו־diag (90 יום)", async () => {
    const admin = fakeAdmin({ groups: [{ id: "g1" }, { id: "g2" }] });
    const res = await runGroupSnapshots(admin, { now: NOW });
    expect(res.groups).toBe(2);
    expect(res.snapshotted).toBe(2);
    expect(res.failed).toBe(0);
    expect(admin.calls.rpc).toEqual([
      { name: "snapshot_group", args: { p_group_id: "g1", p_reason: "daily" } },
      { name: "snapshot_group", args: { p_group_id: "g2", p_reason: "daily" } },
    ]);
    const snapCut = admin.calls.deletes.find((d) => d.table === "group_snapshots");
    const diagCut = admin.calls.deletes.find((d) => d.table === "diag_events");
    expect(snapCut.val).toBe("2026-10-09T05:00:00.000Z");
    expect(diagCut.val).toBe("2026-08-10T05:00:00.000Z");
    expect(res.snapshotsPruned).toBe(3);
    expect(res.diagPruned).toBe(3);
  });

  it("כשל צילום של קבוצה אחת נספר ומדווח בסיכום — לא נבלע, לא עוצר את השאר", async () => {
    const admin = fakeAdmin({
      groups: [{ id: "g1" }, { id: "bad" }, { id: "g3" }],
      rpcFailFor: new Set(["bad"]),
    });
    const res = await runGroupSnapshots(admin, { now: NOW });
    expect(res.snapshotted).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("bad");
  });
});

describe("3.3 runNoticeEmails window", () => {
  it("שליפת הצפיות עם order(at desc) ו־limit(200)", async () => {
    const h = noticeH;
    vi.resetModules();
    vi.doMock("../lib/supabaseAdmin.js", () => ({
      getAdminSupabase: () => ({
        from(table) {
          if (table === "groups") {
            const chain = {
              select: () => chain,
              eq: () => chain,
              single: async () => ({
                data: {
                  id: "g1",
                  slug: "s",
                  data: { sessions: [], yearly: [], monthly: [] },
                  config: {},
                },
                error: null,
              }),
            };
            return chain;
          }
          const chain = {
            select: () => chain,
            eq: () => chain,
            order: (...a) => {
              h.orderArgs = a;
              return chain;
            },
            limit: async (...a) => {
              h.limitArgs = a;
              return { data: [], error: null };
            },
          };
          return chain;
        },
      }),
    }));
    const { runNoticeEmails } = await import("../lib/runNoticeEmails.js");
    const res = await runNoticeEmails({ now: new Date("2026-11-08T00:00:00Z") });
    expect(res.ok).toBe(true);
    expect(h.orderArgs).toEqual(["at", { ascending: false }]);
    expect(h.limitArgs).toEqual([200]);
    vi.doUnmock("../lib/supabaseAdmin.js");
  });
});
