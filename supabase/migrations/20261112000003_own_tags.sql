-- TTT App: let people see their own serving areas.
--
-- Leaders tag people with instruments (Drums, Vocals, Live sound…), levels
-- (Beginner…) and general tags. Until now only leaders could read tag names,
-- so a trainee never saw what a Head of Department set for them. Now each
-- person can read the instrument and level tags on their own profile; the
-- mini app shows them as serving areas on their Journey.
--
-- General tags stay leader-only, so leaders can keep using them as private
-- notes (for example "Needs a mentor").

create policy "people read their own instrument and level tags" on public.tags
  for select to authenticated using (
    kind in ('instrument', 'level')
    and exists (
      select 1 from public.profile_tags pt
      where pt.tag_id = tags.id and pt.profile_id = auth.uid()
    )
  );
