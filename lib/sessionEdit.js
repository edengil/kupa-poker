/** עדכון ערב קיים בלי ליצור כפילות או למחוק טיפים/חלוקה. */
export function applySessionEdit(db, session, { raw, entries, date }) {
  const updated = {
    ...session,
    id: session.id,
    raw,
    entries,
    d: date.d,
    mo: date.mo,
    y: date.y,
    iso: date.iso,
  };
  const sessions = (db.sessions || []).map((s) => (s.id === session.id ? updated : s));
  return {
    ...db,
    sessions: [...sessions].sort((a, b) => String(a.iso).localeCompare(String(b.iso))),
    deletedSessionIds: (db.deletedSessionIds || []).filter((id) => id !== session.id),
  };
}
