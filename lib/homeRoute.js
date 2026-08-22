/* לאן להכניס משתמש אחרי `/` או אחרי OAuth.
   צופה ≠ בעלים: לא פותחים לו קופה ריקה עם טאבי מנהל. */

export function isEmptyKupa(data) {
  if (!data || typeof data !== "object") return true;
  const sessions = data.sessions || [];
  const yearly = data.yearly || [];
  return sessions.length === 0 && yearly.length === 0;
}

/**
 * @param {{ ownerSlug?: string|null, viewerSlug?: string|null, localSlug?: string|null, standalone?: boolean, ownerEmpty?: boolean }} p
 * @returns {{ type: "viewer"|"owner"|"standalone-empty"|"create", slug?: string }}
 */
export function resolveLanding({
  ownerSlug = null,
  viewerSlug = null,
  localSlug = null,
  standalone = false,
  ownerEmpty = false,
} = {}) {
  const view = viewerSlug || localSlug || "";
  let owned = ownerSlug || null;
  /* קופה ריקה שנפתחה בטעות לצופה — מתעלמים ממנה אם יש לינק צפייה או PWA */
  if (owned && ownerEmpty && owned !== view) owned = null;

  if (view && owned !== view) return { type: "viewer", slug: view };
  if (!owned && view) return { type: "viewer", slug: view };
  if (!owned && standalone) return { type: "standalone-empty" };
  if (owned) return { type: "owner", slug: owned };
  return { type: "create" };
}
