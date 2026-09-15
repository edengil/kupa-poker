import fs from "fs";

const j = JSON.parse(fs.readFileSync(new URL("./night-dump.json", import.meta.url), "utf8"));

const tips = {};
for (const m of j) {
  if (m.text.startsWith("🤖")) continue;
  const t = m.text.trim();
  let mm = t.match(/^(.+?)\s+(\d+)\s+טיפ\s*$/);
  let name, amt;
  if (mm) {
    name = mm[1];
    amt = +mm[2];
  } else {
    mm = t.match(/^(.+?)\s+טיפ\s+(\d+)\s*$/);
    if (mm) {
      name = mm[1];
      amt = +mm[2];
    }
  }
  if (!name) continue;
  tips[name] = (tips[name] || 0) + amt;
}

const cash = {};
const buyinsAtCash = {};
for (const m of j) {
  const mm = m.text.match(/🤖\s*(.+?)\s+יצא עם\s+(\d+)\s+ג/);
  if (mm) cash[mm[1]] = +mm[2];
  // capture buyin list from first cashout report
  if (/יצא עם/.test(m.text) && /ביט/.test(m.text) && Object.keys(buyinsAtCash).length === 0) {
    for (const line of m.text.split("\n")) {
      const b = line.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+ביט$/);
      if (b) buyinsAtCash[b[1]] = +b[2];
    }
  }
}

// also get buyins that were already cashed (removed from list) from individual messages
// Final buyins: from first cashout + cashed player's own line isn't in list — use nets
const firstOut = j.find((m) => /יצא עם/.test(m.text) && /ביט/.test(m.text));
const buyins = { ...buyinsAtCash };
// אופיר was cashed first so not in remaining list - net 210, chips 720 => buyin = chips/2 - net = 360-210 = 150
for (const [name, chips] of Object.entries(cash)) {
  if (buyins[name] == null) {
    const netM = firstOut?.text.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(?:מגיע|חייב)\\s+(\\d+)`));
    // better: from each cashout message
  }
}

for (const m of j) {
  const mm = m.text.match(/🤖\s*(.+?)\s+יצא עם\s+(\d+)\s+ג['׳']יטונים\s*·\s*\1\s+(מגיע|חייב)\s+(\d+)/);
  if (!mm) continue;
  const name = mm[1];
  const chips = +mm[2];
  const dir = mm[3];
  const shekels = +mm[4];
  const net = dir === "מגיע" ? shekels : -shekels;
  const buyin = chips / 2 - net;
  buyins[name] = buyin;
}

// settlement message after 1:20
const settle = j.find(
  (m) =>
    m.date === "2.9.2026" &&
    m.time >= "1:20" &&
    m.time < "1:30" &&
    /מגיע|חייב/.test(m.text) &&
    !/יצא עם/.test(m.text)
);

const result = { tips, cash, buyins, settle: settle ? { time: settle.time, text: settle.text } : null };
fs.writeFileSync(new URL("./night-final.json", import.meta.url), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
