/* מקור האמת הדינמי ל־slug של קבוצת הבוט/התזכורות (גל 6, פריט 6.1 / ו-31).

   עד הגל, ששת צרכני הקרון והבוט קראו את KUPA_GROUP_SLUG ממשתנה הסביבה
   בלבד — וסיבוב slug בממשק השתיק את כולם עד לעדכון ידני ב־Vercel
   ו־Redeploy.

   המנגנון: הסיבוב הוא כתיבה אטומית אחת (slug חדש + config). כדי שה־env
   הישן ימשיך למצוא את השורה גם אחרי שה־slug התחלף, הסיבוב שומר בקונפיג
   את רשימת ה־slugs הקודמים (config.prevSlugs): כל slug שהשורה נשאה אי־
   פעם נשאר עוגן חיפוש. הפותר כאן:

   1. שורה שנמצאה לפי ה־slug שבסביבה (עמודת slug) — ה־slug שלה הוא
      האפקטיבי (היא חיה שם עכשיו).
   2. שורה שנמצאה כי ה־slug שבסביבה מופיע ב־prevSlugs שלה — ה־slug
      הנוכחי שלה הוא האפקטיבי. זהו מצב "אחרי סיבוב": ה־env מצביע על
      עוגן היסטורי, והשורה ממשיכה להתגלות.
   3. אחרת — ה־slug שבסביבה כמות שהוא (התנהגות טרום־הגל בדיוק).

   בלי תלות בביקור Vercel ובלי טוקן Vercel באפליקציה: העוגנים חיים
   במסד, והצרכנים קוראים אותם בכל ריצה.

   מימוש טהור של הפתרון (בלי I/O) — נבדק ישירות. */

export function effectiveSlugFromRows(rows, envSlug) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const bySlug = list.find((r) => r?.slug === envSlug);
  if (bySlug) return bySlug.slug;
  const byAnchor = list.find(
    (r) => Array.isArray(r?.config?.prevSlugs) && r.config.prevSlugs.includes(envSlug)
  );
  if (byAnchor && typeof byAnchor.slug === "string" && byAnchor.slug) return byAnchor.slug;
  return envSlug;
}

/* פתרון slug אפקטיבי מול מסד הנתונים. מחזיר מחרוזת slug — לעולם לא זורק:
   כשל בקריאה נופל חזרה ל־slug שבסביבה, בדיוק כמו לפני הגל. */
export async function resolveEffectiveSlug(admin, envValue) {
  const envSlug = envValue("KUPA_GROUP_SLUG");
  if (!envSlug) return "";
  try {
    const { data, error } = await admin
      .from("groups")
      .select("slug, config")
      .or(`slug.eq.${envSlug},config->prevSlugs.cs.["${envSlug}"]`);
    if (error || !data) return envSlug;
    return effectiveSlugFromRows(data, envSlug);
  } catch {
    return envSlug;
  }
}
