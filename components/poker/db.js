/* עזרי DB קטנים — חולצו מ-PokerApp.jsx. */

export const normalize = (d) => ({
  sessions: [],
  yearly: [],
  monthly: [],
  aliases: {},
  roster: [],
  ...d,
});

export function exportDb(db) {
  const blob = new Blob([JSON.stringify(db, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kupa-poker-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
