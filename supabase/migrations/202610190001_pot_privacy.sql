begin;

-- קופת החיסכון (לשעבר "קופה צדדית") גלויה למנהל בלבד (עדן, 19.10.2026).
-- ההקרנה הציבורית (public_group, שממנה נטען עמוד הקבוצה הציבורי) לא תחזיר
-- יותר את נתוני הקופה: היתרה המצטברת, המשיכות, שדה הקופה בכל ערב,
-- ומצב הקופה בלייב (savingsPot + עריכת המנהל potDraft).
-- הבעלים/אדמין קורא את הטבלה ישירות (RLS) וממשיך לראות הכול.
create or replace function public.public_group(p_slug text)
returns table (id uuid, name text, data jsonb, live jsonb, updated_at timestamptz)
language sql security definer stable set search_path = public
as $$
  select g.id, g.name,
    case when g.config->'shareHistory' = 'false'::jsonb then
      jsonb_build_object('sessions', '[]'::jsonb, 'yearly', '[]'::jsonb,
        'monthly', '[]'::jsonb, 'roster', '[]'::jsonb, 'aliases', '{}'::jsonb,
        'plan', g.data->'plan')
    else
      (g.data - 'savingsPot' - 'savingsWithdrawals')
        || jsonb_build_object('sessions',
             coalesce(
               (select jsonb_agg(s - 'savingsPot' order by ord)
                  from jsonb_array_elements(coalesce(g.data->'sessions', '[]'::jsonb))
                         with ordinality as t(s, ord)),
               '[]'::jsonb))
    end,
    case when g.live is null then null
         else g.live - 'savingsPot' - 'potDraft' end,
    g.updated_at
  from public.groups g where g.slug = p_slug limit 1;
$$;
revoke all on function public.public_group(text) from public, anon;
grant execute on function public.public_group(text) to authenticated;

notify pgrst, 'reload schema';
commit;
