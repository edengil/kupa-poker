/* מסך 404 עברי ללינק קבוצה שלא קיים (גל 6, פריט 6.3). */
export default function GroupNotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
        color: "#F3E9D2",
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden>
        ♠
      </div>
      <p style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>הקבוצה לא נמצאה</p>
      <p style={{ fontSize: 14.5, margin: 0, opacity: 0.8, lineHeight: 1.6, maxWidth: 420 }}>
        הלינק הזה לא מוביל לקבוצה פעילה — אולי הוא הוחלף או הוקלד עם שגיאה.
        בקשו מהמארח לינק עדכני.
      </p>
    </main>
  );
}
