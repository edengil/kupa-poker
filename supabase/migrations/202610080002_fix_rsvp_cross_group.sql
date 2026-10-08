-- תיקון אבטחה: game_rsvps היתה פתוחה לקריאה חוצת-קבוצות (using(true)).
-- מעכשיו: רק מי שביקר בקבוצה (יש לו שורת group_views) יכול לקרוא את ההיענויות שלה.

drop policy if exists "rsvp read" on public.game_rsvps;

create policy "rsvp read"
  on public.game_rsvps for select
  to authenticated
  using (
    exists (
      select 1 from public.group_views gv
      where gv.group_id = game_rsvps.group_id
        and gv.user_id = auth.uid()
    )
  );
