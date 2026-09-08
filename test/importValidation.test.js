import { describe, expect, it } from "vitest";
import { validateImport } from "../components/poker/db.js";
import { buildSeedDb } from "../components/poker/seed.js";

describe("backup validation", () => {
  it("accepts the existing seed backup unchanged", () => {
    const db = buildSeedDb();
    expect(validateImport(db)).toEqual(db);
  });
  it.each([null, [], {}, { sessions: "invalid" }, { sessions: [null] }])("rejects malformed backups: %j", (value) => {
    expect(() => validateImport(value)).toThrow();
  });
  it("rejects nonnumeric results", () => {
    const db = buildSeedDb();
    db.sessions[0].entries[0].amount = "100";
    expect(() => validateImport(db)).toThrow();
  });
  it("rejects impossible dates and duplicate ids", () => {
    const db = buildSeedDb();
    db.sessions[0].iso = "2026-02-31";
    expect(() => validateImport(db)).toThrow();
    const duplicate = buildSeedDb();
    duplicate.sessions.push(duplicate.sessions[0]);
    expect(() => validateImport(duplicate)).toThrow();
  });
});
