/* דף מדיניות פרטיות — נדרש לפרסום מסך ההסכמה של גוגל ל-Production.
   דו-לשוני: עברית למשתמשים, אנגלית לסוקרי גוגל. */

export const metadata = {
  title: "מדיניות פרטיות — קופת פוקר / Privacy Policy",
};

const box = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "32px 20px",
  fontFamily: "inherit",
  lineHeight: 1.8,
};

export default function PrivacyPage() {
  return (
    <main style={box}>
      <div dir="rtl">
        <h1>מדיניות פרטיות — קופת פוקר</h1>
        <p>עדכון אחרון: אוקטובר 2026</p>

        <h2>מה האפליקציה עושה</h2>
        <p>
          קופת פוקר היא אפליקציה לניהול קופת פוקר של קבוצה פרטית: מעקב אחרי כניסות,
          טיפים, יתרות ותכנון ערבים.
        </p>

        <h2>איזה מידע נאסף</h2>
        <ul>
          <li>שם ושם משפחה של שחקנים, כפי שהוזנו על ידי מנהל הקבוצה.</li>
          <li>כתובות אימייל של שחקנים — לצורך שליחת זימונים לערבים.</li>
          <li>נתוני משחק: כניסות, טיפים, יתרות ותשובות הגעה (RSVP).</li>
          <li>פרטי התחברות דרך גוגל (שם ואימייל) — לצורך זיהוי המשתמש.</li>
        </ul>

        <h2>גישה ליומן גוגל</h2>
        <p>
          האפליקציה מבקשת הרשאת גישה ליומן גוגל (calendar.events) למטרה אחת בלבד:
          יצירת אירועי ערב ביומן של מנהל הקבוצה, עם השחקנים כאורחים, כדי שגוגל
          תשלח להם זימון. האפליקציה קוראת את תשובות האורחים (אישור/דחייה) כדי
          לעדכן את רשימת המגיעים — ולא עושה שימוש אחר ביומן.
        </p>

        <h2>שיתוף מידע</h2>
        <p>
          המידע אינו נמכר ואינו משותף עם צדדים שלישיים, למעט השירותים ההכרחיים
          להפעלת האפליקציה (אחסון, שליחת אימיילים, יומן גוגל).
        </p>

        <h2>מחיקת מידע</h2>
        <p>ניתן לבקש מחיקת מידע אישי בכל עת בפנייה למנהל הקבוצה.</p>

        <h2>יצירת קשר</h2>
        <p>edengil94@gmail.com</p>
      </div>

      <hr style={{ margin: "40px 0" }} />

      <div dir="ltr">
        <h1>Privacy Policy — Kupa Poker</h1>
        <p>Last updated: October 2026</p>

        <h2>What the app does</h2>
        <p>
          Kupa Poker is an app for managing a private poker group&apos;s fund: tracking
          buy-ins, tips, balances, and planning poker evenings.
        </p>

        <h2>Data we collect</h2>
        <ul>
          <li>Players&apos; first and last names, as entered by the group manager.</li>
          <li>Players&apos; email addresses — for sending evening invitations.</li>
          <li>Game data: buy-ins, tips, balances, and RSVP responses.</li>
          <li>Google sign-in details (name and email) — for user identification.</li>
        </ul>

        <h2>Google Calendar access</h2>
        <p>
          The app requests Google Calendar access (calendar.events scope) for one
          purpose only: creating poker evening events in the group manager&apos;s
          calendar, with players as guests, so Google sends them invitations. The
          app reads guests&apos; responses (accepted/declined) to update the attendee
          list — and makes no other use of the calendar.
        </p>

        <h2>Limited use disclosure</h2>
        <p>
          Kupa Poker&apos;s use and transfer of information received from Google APIs
          adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Calendar data is used only to
          provide the user-facing calendar invitation feature described above. We
          do not sell user data, do not use it for advertising, and do not use it
          to train AI models.
        </p>

        <h2>Data sharing</h2>
        <p>
          Data is not sold and not shared with third parties, except for services
          essential to operating the app (hosting, email delivery, Google Calendar).
        </p>

        <h2>Data deletion</h2>
        <p>
          You may request deletion of personal data at any time by contacting the
          group manager.
        </p>

        <h2>Contact</h2>
        <p>edengil94@gmail.com</p>
      </div>
    </main>
  );
}
