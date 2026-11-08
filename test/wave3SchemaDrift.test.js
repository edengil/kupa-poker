/* גל 3 (3.6) — שומר סחף סכמה קבוע בסוללה.
   שני מסדים: אחד מ־schema.sql לבדו, שני מ־schema.sql + כל שרשרת
   המיגרציות לפי סדר. המלאים חייבים להיות זהים: טבלאות, עמודות,
   פונקציות (הגדרה מלאה מנורמלת), מדיניות, טריגרים ואינדקסים.
   בדיקת־הבקרה מוכיחה שהשומר רגיש: הסרת פונקציה מהסכמה שוברת את
   השוויון (כלומר מיגרציה עתידית שלא תשוקף ל־schema.sql תיתפס). */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";

const schemaSql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);

const STUB = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function inventory(db) {
  const tables = (
    await db.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by 1`
    )
  ).rows.map((r) => r.table_name);
  const cols = (
    await db.query(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns where table_schema = 'public' order by 1, 2`
    )
  ).rows.map((r) =>
    [r.table_name, r.column_name, r.data_type, r.is_nullable, r.column_default].join("|")
  );
  const fns = (
    await db.query(
      `select proname, pg_get_functiondef(oid) as def from pg_proc
        where pronamespace = 'public'::regnamespace order by proname, def`
    )
  ).rows.map((r) => r.proname + "::" + norm(r.def));
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
  return { tables, cols, fns, pols, trigs, idx };
}

async function buildDb(withChain) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  await db.exec(schemaSql);
  if (withChain) {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), "utf8"));
    }
  }
  return db;
}

describe("wave3 schema drift guard", () => {
  let invSolo;
  let invChain;
  let dbs = [];

  beforeAll(async () => {
    const solo = await buildDb(false);
    const chain = await buildDb(true);
    dbs = [solo, chain];
    invSolo = await inventory(solo);
    invChain = await inventory(chain);
  }, 180000);
  afterAll(async () => {
    for (const d of dbs) await d?.close();
  });

  it("המלאי של schema.sql זהה למלאי של schema.sql + כל המיגרציות", () => {
    expect(invSolo.tables).toEqual(invChain.tables);
    expect(invSolo.cols).toEqual(invChain.cols);
    expect(invSolo.fns).toEqual(invChain.fns);
    expect(invSolo.pols).toEqual(invChain.pols);
    expect(invSolo.trigs).toEqual(invChain.trigs);
    expect(invSolo.idx).toEqual(invChain.idx);
  });

  it("המלאי כולל את אובייקטי גל 3 (טבלת צילומים, אינדקס צפיות, 4 פונקציות)", () => {
    expect(invSolo.tables).toContain("group_snapshots");
    expect(invSolo.idx.some((x) => x.startsWith("group_views_user_recent_idx"))).toBe(true);
    expect(invSolo.idx.some((x) => x.startsWith("group_snapshots_group_idx"))).toBe(true);
    for (const fn of ["snapshot_group", "delete_group_with_snapshot", "restore_group_snapshot", "list_group_snapshots"]) {
      expect(invSolo.fns.some((x) => x.startsWith(fn + "::"))).toBe(true);
    }
  });

  it("בקרה: הסרת פונקציה מהסכמה שוברת את השוויון (השומר רגיש)", async () => {
    /* מסירים את גוף הפונקציה אבל משאירים revoke/grant תלויים־באוויר?
       לא — מסירים את כל הבלוק: גוף + revoke + grant, כמו מיגרציה
       שהתפספסה בשלמותה. */
    const tampered = schemaSql.replace(
      /create or replace function public\.snapshot_group[\s\S]*?grant execute on function public\.snapshot_group\(uuid, text\) to authenticated, service_role;\n/,
      ""
    );
    expect(tampered).not.toBe(schemaSql); // ההסרה באמת קרתה
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(STUB);
      await db.exec(tampered);
      const invTampered = await inventory(db);
      expect(invTampered.fns).not.toEqual(invChain.fns);
      expect(
        invTampered.fns.some((x) => x.startsWith("snapshot_group::"))
      ).toBe(false);
    } finally {
      await db.close();
    }
  }, 180000);
});
