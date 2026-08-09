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
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          html,body{margin:0;padding:0;background:#0A2B21;-webkit-text-size-adjust:100%;}
          /* באייפון (PWA) התוכן נמתח עד מתחת לשעון — הריווח מחזיר אותו למקום */
          body{padding-top:env(safe-area-inset-top);}
          body{font-family:'Rubik',system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;}
          *{-webkit-tap-highlight-color:transparent;}
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
