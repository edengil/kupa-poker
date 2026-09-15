import { describe, it, expect } from "vitest";
import { mergeGroupDataOnFlush, preferSession } from "../lib/dataMerge.js";

describe("mergeGroupDataOnFlush", () => {
  it("rescues sessions that exist only on the server", () => {
    const remote = {
      sessions: [
        { id: "old", iso: "2026-09-02", entries: [{ name: "א", amount: 1 }] },
        { id: "new", iso: "2026-09-14", entries: [{ name: "ב", amount: 2 }] },
      ],
      roster: ["א"],
    };
    const local = {
      sessions: [
        {
          id: "old",
          iso: "2026-09-02",
          entries: [{ name: "א", amount: 1 }],
          payments: { plan: "x", paid: { 0: true } },
        },
      ],
      roster: ["א", "ב"],
    };
    const { data, adopted, rescuedIds } = mergeGroupDataOnFlush(local, remote);
    expect(adopted).toBe(true);
    expect(rescuedIds).toEqual(["new"]);
    expect(data.sessions.map((s) => s.id).sort()).toEqual(["new", "old"]);
    expect(data.sessions.find((s) => s.id === "old").payments.paid[0]).toBe(true);
    expect(data.roster).toEqual(expect.arrayContaining(["א", "ב"]));
  });

  it("honors deletedSessionIds so intentional deletes stay deleted", () => {
    const remote = {
      sessions: [
        { id: "keep", iso: "2026-09-01", entries: [] },
        { id: "gone", iso: "2026-09-02", entries: [] },
      ],
    };
    const local = {
      sessions: [{ id: "keep", iso: "2026-09-01", entries: [] }],
      deletedSessionIds: ["gone"],
    };
    const { data } = mergeGroupDataOnFlush(local, remote);
    expect(data.sessions.map((s) => s.id)).toEqual(["keep"]);
    expect(data.deletedSessionIds).toContain("gone");
  });
});

describe("preferSession", () => {
  it("keeps local payment marks over plain remote copy", () => {
    const remote = { id: "s", entries: [{ name: "א", amount: 1 }] };
    const local = {
      id: "s",
      entries: [{ name: "א", amount: 1 }],
      payments: { plan: "p", paid: { 0: true } },
    };
    expect(preferSession(remote, local).payments.paid[0]).toBe(true);
  });
});
