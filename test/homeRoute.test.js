import { describe, it, expect } from "vitest";
import { isEmptyKupa, resolveLanding } from "../lib/homeRoute.js";

describe("isEmptyKupa", () => {
  it("treats missing / empty data as empty", () => {
    expect(isEmptyKupa(null)).toBe(true);
    expect(isEmptyKupa({})).toBe(true);
    expect(isEmptyKupa({ sessions: [], yearly: [] })).toBe(true);
  });

  it("treats a group with nights as real", () => {
    expect(isEmptyKupa({ sessions: [{ iso: "2026-08-01" }] })).toBe(false);
    expect(isEmptyKupa({ yearly: [{ y: 2025 }] })).toBe(false);
  });
});

describe("resolveLanding", () => {
  it("owner of the viewed group stays owner", () => {
    expect(resolveLanding({ ownerSlug: "abc", viewerSlug: "abc" })).toEqual({
      type: "owner",
      slug: "abc",
    });
  });

  it("viewer with server last-view and no owned group goes to /g", () => {
    expect(resolveLanding({ viewerSlug: "abc", standalone: true })).toEqual({
      type: "viewer",
      slug: "abc",
    });
  });

  it("accidental empty owned kupa + last view → viewer, even on iPhone", () => {
    expect(
      resolveLanding({
        ownerSlug: "empty9",
        viewerSlug: "abc",
        ownerEmpty: true,
        standalone: true,
      })
    ).toEqual({ type: "viewer", slug: "abc" });
  });

  it("standalone with no group and no last-view does not create", () => {
    expect(resolveLanding({ standalone: true })).toEqual({ type: "standalone-empty" });
  });

  it("desktop first-time owner may create", () => {
    expect(resolveLanding({ standalone: false })).toEqual({ type: "create" });
  });

  it("local slug is enough when the server has not logged a view yet", () => {
    expect(resolveLanding({ localSlug: "abc", standalone: true })).toEqual({
      type: "viewer",
      slug: "abc",
    });
  });
});
