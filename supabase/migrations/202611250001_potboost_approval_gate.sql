-- ============================================================================
-- Pot Boost (25.11.2026) — שער אישור החלוקה (כלל ברזל 3) בהקרנת הצופה.
--
-- project_session_for_viewer מתעדכן:
--  1. frozenPot מצטרף לרשימת־ההסרה האחת של manualSettlement (סכום הקופה
--     שעליו נבנתה התוכנית — נתון קופה, מנהל בלבד), כמו ב־JS
--     (VIEWER_MANUAL_SETTLEMENT_STRIP_KEYS ב־lib/viewerProjection.js).
--  2. ערב בלי settlementApprovedAt — הצופה לא מקבל את payments בכלל:
--     חלוקת הערב נסתרת מהשחקנים עד אישור המנהל (כפתור בדף הערבים).
--
-- קובץ בלבד בגל הזה — לא הוחל על המסד החי (ההרצה היא צעד שחרור נפרד
-- של המתאם, אחרי אישור הבודקים).
-- ============================================================================

create or replace function public.project_session_for_viewer(p_sess jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  out jsonb;
begin
  if p_sess is null or jsonb_typeof(p_sess) <> 'object' then
    return p_sess;
  end if;
  out := p_sess - 'savingsPot' - 'savingsPotActual' - 'coupleFills';
  if out ? 'manualSettlement' and jsonb_typeof(out->'manualSettlement') = 'object' then
    out := jsonb_set(out, '{manualSettlement}', (out->'manualSettlement') - 'frozenActual' - 'frozenReal' - 'frozenAuto' - 'frozenPot', true);
  end if;
  -- שער כלל 3 (25.11.2026): ערב בלי settlementApprovedAt — הצופה לא מקבל
  -- את תוכנית החלוקה בכלל. (קובץ בלבד — לא הוחל על המסד החי בגל הזה.)
  if not (out ? 'settlementApprovedAt') then
    out := out - 'payments';
  elsif out ? 'payments' then
    out := jsonb_set(out, '{payments}', public.project_payments_for_viewer(out->'payments'), true);
  end if;
  if out ? 'entries' and jsonb_typeof(out->'entries') = 'array' then
    out := jsonb_set(out, '{entries}', public.strip_buyin_event_sids(out->'entries'), true);
  end if;
  return out;
end;
$$;

revoke all on function public.project_session_for_viewer(jsonb) from public, anon, authenticated, service_role;
