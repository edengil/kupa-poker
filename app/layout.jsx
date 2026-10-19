import AnalyticsInit from "@/components/AnalyticsInit";
import { Rubik, Outfit } from "next/font/google";

/* פונטים דרך next/font (מאוחסנים עצמית) במקום <link> ל־Google Fonts —
   גם מהיר יותר וגם סוגר את @next/next/no-page-custom-font. השמות נחשפים
   כמשתני CSS, וכל ה־font-family באפליקציה מפנים אליהם. */
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rubik",
  display: "swap",
});
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata = {
  title: "קופה — פוקר",
  description: "מעקב אחרי ערבי הפוקר של הקבוצה",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=2",
  },
  // "הוסף למסך הבית" באייפון: פותח כאפליקציה, בלי סרגלי הדפדפן
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "קופה — פוקר",
  },
};

export const viewport = {
  themeColor: "#0A2B21",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${outfit.variable}`}>
      <head>
        {/* dangerouslySetInnerHTML ולא children: כשה-CSS מגיע כטקסט-ילד, React
            מקודד מחדש את המרכאות ('Rubik' → &#x27;) בצד השרת אך לא בלקוח, וזה
            יצר שגיאת hydration שהחזירה את כל הדף לרינדור-לקוח. הזרקה ישירה
            עוקפת את ההשוואה הזאת. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          html,body{margin:0;padding:0;background:#0A2B21;-webkit-text-size-adjust:100%;}
          /* באייפון (PWA) התוכן נמתח עד מתחת לשעון — הריווח מחזיר אותו למקום */
          body{padding-top:env(safe-area-inset-top);}
          body{font-family:var(--font-rubik),system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;}
          *{-webkit-tap-highlight-color:transparent;}
        `,
          }}
        />
      </head>
      <body>
        <AnalyticsInit />
        {children}
      </body>
    </html>
  );
}
