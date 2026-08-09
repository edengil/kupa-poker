/* ============================================================================
   יצירת אייקוני האפליקציה מהלוגו של עדן, בצבעי האפליקציה.

   הרצה:  npm run icons   (דורש sharp — מותקן כ-devDependency)

   מייצר:
     public/icon-192.png        — אנדרואיד / manifest
     public/icon-512.png        — אנדרואיד / manifest
     public/apple-touch-icon.png — מסך הבית באייפון (רקע מלא, בלי שקיפות,
                                    כי iOS שם רקע שחור מאחורי פינות שקופות)
   ============================================================================ */

import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

/* אותו ציור כמו components/Logo.jsx — לשמור מסונכרן */
const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="egFelt" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2C6B54"/>
      <stop offset="0.55" stop-color="#15493A"/>
      <stop offset="1" stop-color="#0A2B21"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="30" fill="url(#egFelt)"/>
  <circle cx="32" cy="32" r="26.5" stroke="rgba(217,164,65,0.45)" stroke-width="1"/>
  <path fill="#EFE7D2" d="M15.5 20h14.2c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H19.4v4.35h8.6c.8 0 1.35.5 1.35 1.25v1.4c0 .75-.55 1.25-1.35 1.25h-8.6v4.55h10.5c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H15.5c-.85 0-1.45-.55-1.45-1.35V21.35c0-.8.6-1.35 1.45-1.35z"/>
  <path fill="#EFE7D2" d="M47.8 22.1c-2.2-2.55-5.55-4.05-9.3-4.05-7.35 0-12.85 5.35-12.85 13.05S31.15 44.1 38.5 44.1c3.55 0 6.75-1.3 9.05-3.55.55-.55.55-1.4.05-1.9l-1.45-1.4c-.5-.5-1.3-.5-1.8.05-1.55 1.5-3.55 2.3-5.85 2.3-4.55 0-7.7-3.2-7.7-7.95s3.15-7.95 7.7-7.95c2.2 0 4.1.75 5.55 2.1.45.4 1.15.4 1.6-.05l1.5-1.5c.5-.5.5-1.3 0-1.8z"/>
  <path fill="#EFE7D2" d="M48.2 31.2h-7.4c-.85 0-1.45.6-1.45 1.4v1.7c0 .8.6 1.4 1.45 1.4H45v3.35c0 .75.55 1.3 1.3 1.3h1.55c.75 0 1.3-.55 1.3-1.3V32.6c0-.8-.6-1.4-1.4-1.4z"/>
  <circle cx="50.5" cy="47.5" r="2.2" fill="#D9A441"/>
</svg>`;

const svgAt = (px) => Buffer.from(MARK.replace("<svg ", `<svg width="${px}" height="${px}" `));

// אנדרואיד — עיגול על רקע שקוף
for (const px of [192, 512]) {
  await sharp(svgAt(px)).png().toFile(path.join(pub, `icon-${px}.png`));
  console.log(`icon-${px}.png ✓`);
}

// אייפון — ריבוע מלא ברקע הלבד, הלוגו במרכז. iOS מעגל את הפינות לבד.
const mark = await sharp(svgAt(150)).png().toBuffer();
await sharp({
  create: { width: 180, height: 180, channels: 4, background: "#0A2B21" },
})
  .composite([{ input: mark, gravity: "center" }])
  .png()
  .toFile(path.join(pub, "apple-touch-icon.png"));
console.log("apple-touch-icon.png ✓");
