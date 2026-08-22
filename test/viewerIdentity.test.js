import { describe, it, expect } from "vitest";
import { shouldOpenAsViewer } from "../lib/viewerIdentity.js";

describe("shouldOpenAsViewer", () => {
  it("owner of the same group stays on /", () => {
    expect(shouldOpenAsViewer("abc123", "abc123")).toBe(false);
  });

  it("viewer with a last-view slug and no owned group opens /g", () => {
    expect(shouldOpenAsViewer("abc123", null)).toBe(true);
    expect(shouldOpenAsViewer("abc123", undefined)).toBe(true);
  });

  it("accidental empty group (different slug) still opens the viewer link", () => {
    expect(shouldOpenAsViewer("abc123", "empty999")).toBe(true);
  });

  it("no last-view — do not hijack the owner bootstrap", () => {
    expect(shouldOpenAsViewer("", null)).toBe(false);
    expect(shouldOpenAsViewer(null, "abc123")).toBe(false);
  });
});
