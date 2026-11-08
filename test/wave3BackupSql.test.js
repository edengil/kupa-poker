/* גל 3 (3.1) — תרגיל השחזור המלא ב־PGlite, על הסכמה המאוחדת בלבד:
   קבוצת מבחן עם בלובים ייחודיים → צילום → מחיקה־עם־צילום־חובה → שחזור
   → שוויון מפורש של שלושת הבלובים (data/config/live). בנוסף: צילום
   נכשל ⇒ המחיקה נחסמת והקבוצה נשארת; בעלות זרה נדחית; slug תפוס מקבל
   סיומת; RLS סגור ו־grants כנדרש; revoke מורחב (3.5); אינדקס 3.3. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const schemaSql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

/* סביבת Supabase מדומה עם auth.uid() נשלט: ה־GUC ‏test.uid קובע את
   הזהות של המתקשר (ריק = שרת בלי סשן, כמו service_role). */
const STUB = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
`;

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const OTHER = "00000000-0000-0000-0000-0000000000a2";
const GROUP = "00000000-0000-0000-0000-0000000000b1";

const DATA = {
  sessions: [{ id: "s1", iso: "2026-10-24", entries: [{ name: "אבי", amount: 100 }] }],
  savingsPot: 163,
  marker: "wave3-drill-data",
};
const CONFIG = { botOn: true, noticeEmails: { x: 1 }, marker: "wave3-drill-config" };
const LIVE = { players: [{ name: "אבי", buyin: 200 }], marker: "wave3-drill-live" };

async function freshDb(sql = schemaSql) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  await db.exec(sql);
  return db;
}

async function asUser(db, uid) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid || ""]);
}

async function seedGroup(db) {
  await db.query(`insert into auth.users (id) values ($1), ($2) on conflict do nothing`, [OWNER, OTHER]);
  await db.query(
    `insert into groups (id, owner_id, slug, name, data, config, live)
     values ($1, $2, 'drill-g', 'קבוצת מבחן', $3, $4, $5)`,
    [GROUP, OWNER, JSON.stringify(DATA), JSON.stringify(CONFIG), JSON.stringify(LIVE)]
  );
}

describe("wave3 backup snapshots — drill", () => {
  let db;
  beforeAll(async () => {
    db = await freshDb();
    await seedGroup(db);
    await asUser(db, null); // שרת
  }, 120000);
  afterAll(async () => {
    await db?.close();
  });

  it("צילום שרת: שלושת הבלובים נשמרים בשלמותם", async () => {
    const { rows } = await db.query(`select snapshot_group($1, 'daily') as id`, [GROUP]);
    expect(rows[0].id).toBeTruthy();
    const snap = await db.query(`select * from group_snapshots where id = $1`, [rows[0].id]);
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0].reason).toBe("daily");
    expect(snap.rows[0].slug).toBe("drill-g");
    expect(snap.rows[0].data).toEqual(DATA);
    expect(snap.rows[0].config).toEqual(CONFIG);
    expect(snap.rows[0].live).toEqual(LIVE);
  });

  it("סיבה לא חוקית נדחית; בעלות זרה נדחית; הבעלים מותר", async () => {
    await expect(db.query(`select snapshot_group($1, 'bogus')`, [GROUP])).rejects.toThrow(
      "invalid snapshot reason"
    );
    await asUser(db, OTHER);
    await expect(db.query(`select snapshot_group($1, 'manual')`, [GROUP])).rejects.toThrow(
      "forbidden"
    );
    await asUser(db, OWNER);
    const ok = await db.query(`select snapshot_group($1, 'manual') as id`, [GROUP]);
    expect(ok.rows[0].id).toBeTruthy();
    await asUser(db, null);
  });

  it("תרגיל מלא: מחיקה־עם־צילום → שחזור → שוויון שלושת הבלובים", async () => {
    const del = await db.query(`select delete_group_with_snapshot($1) as snap`, [GROUP]);
    expect(del.rows[0].snap).toBeTruthy();

    const gone = await db.query(`select count(*)::int as n from groups where id = $1`, [GROUP]);
    expect(gone.rows[0].n).toBe(0);

    /* הצילום שלפני־המחיקה שרד את מחיקת הקבוצה (אין cascade עליו) */
    const pre = await db.query(
      `select * from group_snapshots where id = $1 and reason = 'pre-delete'`,
      [del.rows[0].snap]
    );
    expect(pre.rows).toHaveLength(1);

    const restored = await db.query(`select * from restore_group_snapshot($1)`, [
      del.rows[0].snap,
    ]);
    expect(restored.rows).toHaveLength(1);
    expect(restored.rows[0].slug).toBe("drill-g"); // ה־slug התפנה במחיקה

    const row = await db.query(`select data, config, live, owner_id, name from groups where id = $1`, [
      restored.rows[0].id,
    ]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].data).toEqual(DATA);
    expect(row.rows[0].config).toEqual(CONFIG);
    expect(row.rows[0].live).toEqual(LIVE);
    expect(row.rows[0].owner_id).toBe(OWNER);
    expect(row.rows[0].name).toBe("קבוצת מבחן");
  });

  it("שחזור כשה־slug תפוס: נוצרת קבוצה עם סיומת, הבלובים זהים", async () => {
    /* הקבוצה המקורית נמחקה בתרגיל הקודם — הרשימה עבורה זורקת */
    await expect(db.query(`select * from list_group_snapshots($1)`, [GROUP])).rejects.toThrow(
      "group not found"
    );
    const snaps = await db.query(
      `select id from group_snapshots where slug = 'drill-g' order by created_at limit 1`
    );
    const again = await db.query(`select * from restore_group_snapshot($1)`, [snaps.rows[0].id]);
    expect(again.rows[0].slug).toMatch(/^drill-g-[0-9a-f]{6}$/);
    const row = await db.query(`select data, config, live from groups where id = $1`, [
      again.rows[0].id,
    ]);
    expect(row.rows[0].data).toEqual(DATA);
    expect(row.rows[0].config).toEqual(CONFIG);
    expect(row.rows[0].live).toEqual(LIVE);
  });

  it("רשימת צילומים לבעלים בלבד", async () => {
    const g2 = await db.query(
      `insert into groups (owner_id, slug, name, data, config) values ($1, 'list-g', 'רשימה', '{}', '{}') returning id`,
      [OWNER]
    );
    const gid = g2.rows[0].id;
    await db.query(`select snapshot_group($1, 'manual')`, [gid]);
    await asUser(db, OTHER);
    await expect(db.query(`select * from list_group_snapshots($1)`, [gid])).rejects.toThrow(
      "forbidden"
    );
    await asUser(db, OWNER);
    const rows = await db.query(`select * from list_group_snapshots($1)`, [gid]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].reason).toBe("manual");
    await asUser(db, null);
  });
});

describe("wave3 snapshot failure blocks deletion", () => {
  it("טבלת צילומים חסרה ⇒ delete_group_with_snapshot זורק והקבוצה נשארת", async () => {
    const broken = await freshDb();
    try {
      await seedGroup(broken);
      await broken.exec(`drop table public.group_snapshots`);
      await expect(
        broken.query(`select delete_group_with_snapshot($1)`, [GROUP])
      ).rejects.toThrow();
      const still = await broken.query(`select count(*)::int as n from groups where id = $1`, [
        GROUP,
      ]);
      expect(still.rows[0].n).toBe(1);
    } finally {
      await broken.close();
    }
  }, 120000);
});

describe("wave3 grants, RLS, index, revokes", () => {
  let db;
  beforeAll(async () => {
    db = await freshDb();
  }, 120000);
  afterAll(async () => {
    await db?.close();
  });

  it("group_snapshots: ‏RLS פעיל, בלי מדיניות, anon/authenticated בלי שום הרשאה, service_role מלא", async () => {
    const rls = await db.query(
      `select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'group_snapshots'`
    );
    expect(rls.rows[0].rowsecurity).toBe(true);
    const pols = await db.query(
      `select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'group_snapshots'`
    );
    expect(pols.rows[0].n).toBe(0);
    for (const role of ["anon", "authenticated"]) {
      const priv = await db.query(`select has_table_privilege($1, 'public.group_snapshots', 'select') as ok`, [role]);
      expect(priv.rows[0].ok).toBe(false);
    }
    const svc = await db.query(
      `select has_table_privilege('service_role', 'public.group_snapshots', 'select') as ok`
    );
    expect(svc.rows[0].ok).toBe(true);
  });

  it("אינדקס הצפיות (user_id, at desc, id desc) קיים", async () => {
    const idx = await db.query(
      `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'group_views_user_recent_idx'`
    );
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toContain("user_id");
    expect(idx.rows[0].indexdef).toContain("at DESC");
    expect(idx.rows[0].indexdef).toContain("id DESC");
  });

  it("3.5: ‏execute על פונקציות העזר ועל touch_updated_at בוטל מ־authenticated ומ־service_role", async () => {
    const names = [
      "touch_updated_at",
      "strip_buyin_event_sids",
      "project_payments_for_viewer",
      "project_session_for_viewer",
      "filter_shared_group_data",
    ];
    for (const name of names) {
      const oid = await db.query(
        `select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = $1 limit 1`,
        [name]
      );
      expect(oid.rows).toHaveLength(1);
      for (const role of ["authenticated", "service_role", "anon"]) {
        const priv = await db.query(`select has_function_privilege($1, $2::oid, 'execute') as ok`, [
          role,
          oid.rows[0].oid,
        ]);
        expect(priv.rows[0].ok, `${name} / ${role}`).toBe(false);
      }
    }
    /* וה־RPC הציבוריים עדיין פתוחים ל־authenticated — ה־revoke לא שבר אותם */
    for (const name of ["snapshot_group", "restore_group_snapshot", "vote_player_of_night"]) {
      const priv = await db.query(
        `select has_function_privilege('authenticated', oid, 'execute') as ok
           from pg_proc where pronamespace = 'public'::regnamespace and proname = $1 limit 1`,
        [name]
      );
      expect(priv.rows[0].ok, name).toBe(true);
    }
  });
});
