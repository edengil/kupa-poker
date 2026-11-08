// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

/* גל 4 · פריט 4.6 — PotDashboard בודק את ערך ההחזרה של flushStore:
   שמירת "רשום"/"בפועל" שלא הגיעה לענן משאירה את העורך פתוח עם הודעה,
   במקום לסגור אותו כאילו הכול תקין (הכשל נבלע ב־void flushStore()). */

const flushState = { result: true };
vi.mock("../lib/store.js", () => ({
  flushStore: () => Promise.resolve(flushState.result),
}));

import { PotDashboard } from "../components/poker/PotDashboard.jsx";

const db = {
  sessions: [
    {
      id: "s1",
      d: 8,
      mo: 11,
      y: 2026,
      iso: "2026-11-08",
      players: [{ name: "עדן גיל", buyin: 100, cashout: 200 }],
      savingsPot: 5,
    },
  ],
  savingsPot: 5,
};

let container;
let root;
let alertSpy;

beforeEach(() => {
  flushState.result = true;
  alertSpy = vi.fn();
  vi.stubGlobal("alert", alertSpy);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const buttonsByText = (text) =>
  [...container.querySelectorAll("button")].filter((b) => b.textContent === text);

const openEditorAndSave = async (editBtnIndex) => {
  await act(async () => {
    root.render(React.createElement(PotDashboard, { db, commit: vi.fn(), isAdmin: true }));
  });
  const editBtns = buttonsByText("ערוך");
  expect(editBtns.length).toBeGreaterThan(editBtnIndex);
  await act(async () => {
    editBtns[editBtnIndex].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const saveBtn = buttonsByText("שמור")[0];
  expect(saveBtn).toBeTruthy();
  await act(async () => {
    saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("4.6 — flushStore נכשל: העורך נשאר פתוח עם הודעה", () => {
  it("עריכת 'רשום'", async () => {
    flushState.result = false;
    await openEditorAndSave(0);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("לא הגיע לענן"));
    expect(buttonsByText("שמור")).toHaveLength(1);
  });

  it("עריכת 'בפועל'", async () => {
    flushState.result = false;
    await openEditorAndSave(1);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("לא הגיע לענן"));
    expect(buttonsByText("שמור")).toHaveLength(1);
  });
});

describe("4.6 — flushStore תקין: העורך נסגר", () => {
  it("עריכת 'רשום'", async () => {
    await openEditorAndSave(0);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(buttonsByText("שמור")).toHaveLength(0);
    expect(buttonsByText("ערוך").length).toBeGreaterThan(0);
  });

  it("עריכת 'בפועל'", async () => {
    await openEditorAndSave(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(buttonsByText("שמור")).toHaveLength(0);
  });
});
