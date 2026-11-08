/* גל 4ב — בדיקת טעינה מלאה של הסכמה המאוחדת (ממצא ביקורת 15):
   ‏supabase/schema.sql נטען לבדו למסד ריק (PGlite) ומוכיח שהוא נותן את
   מערכת הייצור: המלאי שלו (פונקציות/עמודות/מדיניות/טריגרים/אינדקסים)
   זהה למלאי שמתקבל מהרצת כל שרשרת המיגרציות מעליו — כלומר שום גרסה
   סופית של פונקציה לא סחה, ושום טבלה לא חסרה. בנוסף: טבלת diag_events
   (שחיה רק בייצור מאז 24.10) קיימת ומקבלת את צורת הכתיבה של הקוד,
   נוסח שגיאת ה־vote הוא 'candidate not in session' כמו בשרשרת, והקרנת
   הצופה של public_group מסננת קופה/sid/applied גם בהתקנה מהסכמה. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";

const schemaSql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);

/* סביבת Supabase מדומה: תפקידים + auth.users/auth.uid שהסכמה נשענת עליהם. */
const STUB = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function snapshot(db) {
  const fns = (
    await db.query(
      `select proname, pg_get_functiondef(oid) as def from pg_proc
        where pronamespace = 'public'::regnamespace order by proname, def`
    )
  ).rows.map((r) => r.proname + "::" + norm(r.def));
  const cols = (
    await db.query(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns where table_schema = 'public' order by 1, 2`
    )
  ).rows.map((r) =>
    [r.table_name, r.column_name, r.data_type, r.is_nullable, r.column_default].join("|")
  );
  const pols = (
    await db.query(
      `select tablename, policyname, cmd, qual, with_check from pg_policies
        where schemaname = 'public' order by 1, 2`
    )
  ).rows.map((r) =>
    [r.tablename, r.policyname, r.cmd, norm(r.qual), norm(r.with_check)].join("|")
  );
  const trigs = (
    await db.query(
      `select tgname, pg_get_triggerdef(oid) as def from pg_trigger
        where not tgisinternal order by 1`
    )
  ).rows.map((r) => r.tgname + "::" + norm(r.def));
  const idx = (
    await db.query(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`
    )
  ).rows.map((r) => r.indexname + "::" + norm(r.indexdef));
  return { fns, cols, pols, trigs, idx };
}

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  return db;
}

describe("wave4 consolidated schema load", () => {
  let solo;
  let snapSolo;
  let snapChain;

  beforeAll(async () => {
    solo = await freshDb();
    await solo.exec(schemaSql); // הטעינה עצמה היא הבדיקה: כל שגיאה נכשלת כאן
    snapSolo = await snapshot(solo);

    const chain = await freshDb();
    await chain.exec(schemaSql);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(18);
    for (const f of files) {
      await chain.exec(readFileSync(new URL(f, MIGRATIONS_DIR), "utf8"));
    }
    snapChain = await snapshot(chain);
    await chain.close();
  }, 120000);
  afterAll(async () => {
    await solo?.close();
  });

  it("המלאי של הסכמה לבדה זהה למלאי של הסכמה + כל שרשרת המיגרציות", () => {
    expect(snapSolo).toEqual(snapChain);
  });

  it("כל הטבלאות והפונקציות של מערכת הייצור קיימות", async () => {
    const tables = (
      await solo.query(
        `select table_name from information_schema.tables where table_schema = 'public' order by 1`
      )
    ).rows.map((r) => r.table_name);
    expect(tables).toEqual([
      "calendar_credentials",
      "diag_events",
      "game_rsvps",
      "group_views",
      "groups",
      "push_subscriptions",
    ]);
    const fns = (
      await solo.query(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace`
      )
    ).rows.map((r) => r.proname);
    for (const name of [
      "touch_updated_at",
      "strip_buyin_event_sids",
      "project_payments_for_viewer",
      "project_session_for_viewer",
      "filter_shared_group_data",
      "public_group",
      "public_group_v2",
      "mark_group_payment",
      "vote_player_of_night",
      "write_group_cas",
    ]) {
      expect(fns).toContain(name);
    }
  });

  it("diag_events מקבלת את צורת הכתיבה של הקוד (נתיב /api/diag + רישום הבוט)", async () => {
    const entry = {
      kind: "error",
      message: "boom",
      stack: "trace",
      url: "https://example.com/",
      ua: "ua-string",
      phase: 3,
      payload: { kind: "error", message: "boom", detail: "", ts: "2026-10-30T00:00:00Z" },
    };
    const { rows } = await solo.query(
      `insert into diag_events (kind, message, stack, url, ua, phase, payload)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at`,
      [entry.kind, entry.message, entry.stack, entry.url, entry.ua, entry.phase, JSON.stringify(entry.payload)]
    );
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].created_at).toBeTruthy();
    await solo.query(
      `insert into diag_events (kind, message, payload) values ('wa-send-fail', $1, $2)`,
      ["send failed", JSON.stringify({ kind: "wa-send-fail", detail: "whatsapp/reply" })]
    );
    const count = await solo.query(`select count(*)::int as n from diag_events`);
    expect(count.rows[0].n).toBe(2);
  });

  it("שגיאת הצבעה על מועמד שלא ישב היא 'candidate not in session' (נוסח השרשרת)", async () => {
    await solo.query(`insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1')`);
    await solo.query(
      `insert into groups (id, owner_id, slug, name, data, config) values ($1, $2, 'vote-g', 't', $3, '{}')`,
      [
        "00000000-0000-0000-0000-0000000000b1",
        "00000000-0000-0000-0000-0000000000a1",
        JSON.stringify({
          sessions: [
            { id: "s1", iso: "2026-10-24", entries: [{ name: "אבי" }, { name: "משה" }] },
          ],
        }),
      ]
    );
    await expect(
      solo.query(`select vote_player_of_night('vote-g', 's1', 'זר', 'אבי')`)
    ).rejects.toThrow("candidate not in session");
    const ok = await solo.query(`select vote_player_of_night('vote-g', 's1', 'משה', 'אבי') as r`);
    expect(ok.rows[0].r).toBeTruthy();
  });

  it("public_group מהסכמה מסנן קופה, sid ו־applied מהקרנת הצופה", async () => {
    await solo.query(
      `insert into groups (id, owner_id, slug, name, data, config, live) values ($1, $2, 'pub-g', 't', $3, '{}', $4)`,
      [
        "00000000-0000-0000-0000-0000000000b2",
        "00000000-0000-0000-0000-0000000000a1",
        JSON.stringify({
          savingsPot: 163,
          savingsWithdrawals: [{ label: "x", amount: 30 }],
          sessions: [
            {
              id: "s1",
              iso: "2026-10-24",
              endedAt: 5,
              savingsPot: 93,
              entries: [
                { name: "אבי", buyinEvents: [{ amount: 550, pot: 27.5, sid: "wamid.N:0" }] },
              ],
            },
          ],
        }),
        JSON.stringify({
          savingsPot: 2.5,
          applied: { "wamid.N": { kind: "create" } },
          players: [{ name: "אבי", buyinEvents: [{ amount: 50, sid: "wamid.N:0" }] }],
        }),
      ]
    );
    const { rows } = await solo.query(`select data, live from public_group('pub-g')`);
    expect(rows).toHaveLength(1);
    expect(rows[0].data).not.toHaveProperty("savingsPot");
    expect(rows[0].data).not.toHaveProperty("savingsWithdrawals");
    expect(rows[0].data.sessions[0]).not.toHaveProperty("savingsPot");
    expect(rows[0].data.sessions[0].entries[0].buyinEvents[0]).not.toHaveProperty("sid");
    expect(rows[0].data.sessions[0].entries[0].buyinEvents[0].amount).toBe(550);
    expect(rows[0].live).not.toHaveProperty("applied");
    expect(rows[0].live).not.toHaveProperty("savingsPot");
    expect(rows[0].live.players[0].buyinEvents[0]).not.toHaveProperty("sid");
  });

  it("write_group_cas מהסכמה כותב עם חותמת עדכנית ודוחה מיושנת", async () => {
    const before = (
      await solo.query(`select updated_at::text as u from groups where slug = 'pub-g'`)
    ).rows[0].u;
    const written = await solo.query(
      `select write_group_cas($1, $2::timestamptz, $3::jsonb)::text as u`,
      ["00000000-0000-0000-0000-0000000000b2", before, JSON.stringify({ config: { botOn: true } })]
    );
    expect(written.rows[0].u).not.toBeNull();
    const stale = await solo.query(
      `select write_group_cas($1, $2::timestamptz, $3::jsonb)::text as u`,
      ["00000000-0000-0000-0000-0000000000b2", before, JSON.stringify({ config: { botOn: false } })]
    );
    expect(stale.rows[0].u).toBeNull();
  });
});
