import fs from "fs";

const text = fs.readFileSync(new URL("./_chat.txt", import.meta.url), "utf8");
const lines = text.split(/\r?\n/);
let cur = null;
const msgs = [];
const re = /^\[(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)$/;
for (const line of lines) {
  const m = line.match(re);
  if (m) {
    if (cur) msgs.push(cur);
    cur = { date: m[1], time: m[2], author: m[3].trim(), text: m[4] };
  } else if (cur) cur.text += "\n" + line;
}
if (cur) msgs.push(cur);

const night = msgs.filter((m) => {
  if (m.date === "1.9.2026") {
    const [h] = m.time.split(":").map(Number);
    return h >= 20;
  }
  if (m.date === "2.9.2026") {
    const [h] = m.time.split(":").map(Number);
    return h < 3;
  }
  return false;
});

const interesting =
  /(?:עוד|טיפ|טיפים|התחלה|כניס|נכנס|יצא|יצאה|סיים|סיימה|ג.?יטון|מלאי|סיכום|חלוקה|מגיע|חייב|קופה|סיום|עדכון|שלח)/;

const out = [];
for (const m of night) {
  const t = m.text;
  if (
    interesting.test(t) ||
    t.includes("🃏") ||
    t.includes("💸") ||
    /^\d+$/.test(t.trim()) ||
    t.includes("ג׳") ||
    t.includes("ג'")
  ) {
    out.push({ date: m.date, time: m.time, author: m.author, text: t });
  }
}
fs.writeFileSync(new URL("./night-dump.json", import.meta.url), JSON.stringify(out, null, 2), "utf8");
console.log("wrote", out.length, "msgs");
