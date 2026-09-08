/** עזרי ניווט ל־/preview בבדיקות Playwright. */

export async function resetPreview(page) {
  await page.goto("/preview");
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("poker:preview:")) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  });
  await page.reload();
  await page.getByTestId("preview-banner").waitFor({ state: "visible" });
}

export async function openLive(page) {
  await page.getByTestId("tab-live").click();
  await page.getByTestId("live-player-name").waitFor({ state: "visible" });
}

export async function addPlayer(page, name) {
  await page.getByTestId("live-player-name").fill(name);
  await page.getByTestId("live-add-player").click();
  await page.getByTestId(`live-cashout-${name}`).waitFor({ state: "visible" });
}

export async function setCashout(page, name, chips) {
  const input = page.getByTestId(`live-cashout-${name}`);
  await input.fill(String(chips));
  await input.blur();
}
