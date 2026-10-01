-- הצבעת «שחקן הערב» מהלינק הציבורי.
-- הקולות יושבים על הערב עצמו: session.playerOfNightVotes = { שם־מצביע: שם־מועמד }.
-- בלי טבלה חדשה — אותו דפוס blob כמו שאר שדות הערב בתוך groups.data.
-- להריץ ידנית ב־Supabase (SQL Editor) — עד אז ההצבעה עובדת רק למנהל באפליקציה,
-- וצופה מהלינק יקבל הודעה שההצבעה עדיין לא פעילה בצד השרת.
create or replace function public.vote_player_of_night(
  p_slug text,
  p_session_id text,
  p_candidate text,
  p_voter text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups%rowtype;
  sessions jsonb;
  sess jsonb;
  i integer;
  sid text;
  votes jsonb;
  out_sessions jsonb := '[]'::jsonb;
  session_found boolean := false;
  candidate_ok boolean := false;
  e jsonb;
begin
  if p_slug is null or p_session_id is null
     or coalesce(btrim(p_candidate), '') = ''
     or coalesce(btrim(p_voter), '') = '' then
    raise exception 'missing arguments';
  end if;

  select * into g from public.groups where slug = p_slug for update;
  if not found then
    raise exception 'group not found';
  end if;

  sessions := coalesce(g.data->'sessions', '[]'::jsonb);

  for i in 0 .. jsonb_array_length(sessions) - 1 loop
    sess := sessions->i;
    sid := sess->>'id';
    if sid = p_session_id then
      session_found := true;
      -- המועמד חייב להיות מי שישב בערב הזה
      candidate_ok := false;
      for e in select value from jsonb_array_elements(coalesce(sess->'entries', '[]'::jsonb)) loop
        if e->>'name' = btrim(p_candidate) then
          candidate_ok := true;
        end if;
      end loop;
      if not candidate_ok then
        raise exception 'candidate did not sit this night';
      end if;
      votes := coalesce(sess->'playerOfNightVotes', '{}'::jsonb);
      votes := jsonb_set(votes, array[btrim(p_voter)], to_jsonb(btrim(p_candidate)), true);
      sess := jsonb_set(sess, '{playerOfNightVotes}', votes, true);
    end if;
    out_sessions := out_sessions || jsonb_build_array(sess);
  end loop;

  if not session_found then
    raise exception 'session not found';
  end if;

  update public.groups
  set data = jsonb_set(coalesce(g.data, '{}'::jsonb), '{sessions}', out_sessions, true),
      updated_at = now()
  where id = g.id
  returning data into g.data;

  return g.data;
end;
$$;

revoke all on function public.vote_player_of_night(text, text, text, text) from public, anon;
grant execute on function public.vote_player_of_night(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
