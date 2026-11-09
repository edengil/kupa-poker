// כלל 8.3 (גל 8): חומת הכינוי. מודולי lib נטענים רק דרך "@/lib/…".
// ייבוא יחסי שחוצה מאזור אחר (app/components/scripts/e2e) אל תוך lib/
// שובר את האחידות ומקשה על מעברי קבצים (כמו מעברי 8.2/8.3 עצמם) —
// נחסם כאן. חריגים מודעים, לפי תחום הקובץ המייבא: קבצים בתוך lib
// עצמה מייבאים יחסית בינם לבין עצמם, וקבצי בדיקה מייבאים את יחידת
// הבדיקה בנתיב יחסי — שני התחומים פשוט לא נכללים ב־files של הבלוק.
const RULE = {
  meta: {
    type: "suggestion",
    docs: {
      description: "lib modules must be imported via the @/lib alias outside lib itself",
    },
    schema: [],
    messages: {
      useAlias: "ייבוא ל־lib חייב לעבור דרך הכינוי \"@/lib/…\" — לא בנתיב יחסי.",
    },
  },
  create(context) {
    const check = (node) => {
      const src = node.source && node.source.value;
      if (typeof src !== "string") return;
      if (/^(\.\.\/)+lib\//.test(src) || /^(\.\.\/)+lib$/.test(src)) {
        context.report({ node: node.source, messageId: "useAlias" });
      }
    };
    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      // ייבוא דינמי: import("…") — אותו זיהוי נתיב, node.source הוא הליטרל.
      ImportExpression: check,
    };
  },
};

export default {
  rules: {
    "no-relative-lib-import": RULE,
  },
};
