import OwnerApp from "@/components/OwnerApp";

// עמוד הבית חייב רינדור דינמי: הוא יוצר לקוח Supabase בזמן רינדור,
// ופרה-רינדור סטטי בבילד נופל כשמשתני הסביבה לא זמינים (Vercel).
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <OwnerApp />;
}
