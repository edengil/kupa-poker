import { describe, expect, it } from "vitest";
import { noticeDeliveryDecision } from "../lib/noticeDelivery.js";

describe("notice delivery by capability", () => {
  it("suppresses entry popups when installed, granted and subscribed", () => {
    const d = noticeDeliveryDecision({ installed: true, permission: "granted", hasSubscription: true });
    expect(d.canPush).toBe(true);
    expect(d.suppressEntryPopups).toBe(true);
    expect(d.showInScreen).toBe(false);
  });

  it("keeps in-screen notices when the app is not installed to the home screen", () => {
    const d = noticeDeliveryDecision({ installed: false, permission: "granted", hasSubscription: true });
    expect(d.canPush).toBe(false);
    expect(d.showInScreen).toBe(true);
  });

  it("keeps in-screen notices when permission was denied", () => {
    const d = noticeDeliveryDecision({ installed: true, permission: "denied", hasSubscription: false });
    expect(d.canPush).toBe(false);
    expect(d.showInScreen).toBe(true);
  });

  it("keeps in-screen notices when permission was never asked", () => {
    const d = noticeDeliveryDecision({ installed: true, permission: "default", hasSubscription: false });
    expect(d.showInScreen).toBe(true);
  });

  it("keeps in-screen notices when installed and granted but no active subscription", () => {
    const d = noticeDeliveryDecision({ installed: true, permission: "granted", hasSubscription: false });
    expect(d.canPush).toBe(false);
    expect(d.showInScreen).toBe(true);
  });

  it("defaults to showing in-screen when state is missing", () => {
    expect(noticeDeliveryDecision().showInScreen).toBe(true);
    expect(noticeDeliveryDecision({}).suppressEntryPopups).toBe(false);
  });
});
