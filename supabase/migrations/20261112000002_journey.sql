-- TTT App: worship team journey (roadmap, profiles, accomplishments),
-- the Head of Department role, and web console access.
--
-- The rules, in plain words:
--   * Everyone writes their own dreams & vision and what they want to grow in.
--     Only they can change it. They, their trainer, admins and Heads can read it.
--   * Accomplishments and roadmap progress are recorded by the person's
--     trainer, admins or Heads, never by the person themselves.
--   * The general roadmap (steps everyone walks) is edited by Heads only.
--     Trainers, admins and Heads can add personal steps for people they look after.
--   * Only Heads change roles, see the change log and decide who may use the
--     web console. Those powers used to belong to admins.
--   * Changes to roadmap progress and accomplishments are written to the
--     change log.

-- ---------------------------------------------------------------------------
-- Helpers: Heads can do everything admins can
-- ---------------------------------------------------------------------------

create or replace function public.is_head()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'head' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin', 'head') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('trainer', 'admin', 'head') from public.profiles where id = auth.uid()), false) $$;

-- True for anyone with a profile (a signed-in auth user without one sees nothing).
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid()) $$;

-- Who may record progress and accomplishments for a person: their trainer,
-- admins and Heads. Nobody signs off their own journey, except a Head.
create or replace function public.can_manage_member(member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.is_head()
    or (member <> auth.uid() and (
          public.is_admin()
       or exists (select 1 from public.profiles p where p.id = member and p.trainer_id = auth.uid())
    )),
    false)
$$;

-- ---------------------------------------------------------------------------
-- assign_member: same as before, but roles now belong to Heads.
--   Heads:    can change anything for anyone.
--   Admins:   can place anyone except a Head, but cannot change roles.
--   Trainers: can place people nobody has placed yet, or their own trainees,
--             and become their trainer.
-- ---------------------------------------------------------------------------
create or replace function public.assign_member(
  p_member    uuid,
  p_age_group uuid,
  p_trainer   uuid,
  p_tag_ids   uuid[] default '{}',
  p_role      public.user_role default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller_role public.user_role := public.my_role();
  target      public.profiles%rowtype;
  new_role    public.user_role;
  old_tags    uuid[];
begin
  if caller_role is null or caller_role not in ('trainer', 'admin', 'head') then
    raise exception 'Only trainers, admins and Heads of Department can assign members' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_member for update;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  new_role := coalesce(p_role, target.role);

  if new_role <> target.role and caller_role <> 'head' then
    raise exception 'Only the Head of Department can change roles' using errcode = '42501';
  end if;
  if target.role = 'head' and caller_role <> 'head' then
    raise exception 'Only a Head of Department can change another Head of Department' using errcode = '42501';
  end if;

  if caller_role = 'trainer' then
    if target.role <> 'trainee' then
      raise exception 'Only admins can assign trainers and admins' using errcode = '42501';
    end if;
    -- "is not distinct from" so a missing trainer (null) never counts as a match
    if not (target.age_group_id is null or target.trainer_id is not distinct from auth.uid()) then
      raise exception 'Trainers can only assign unplaced members or their own trainees' using errcode = '42501';
    end if;
    if p_trainer is distinct from auth.uid() then
      raise exception 'Trainers can only assign members to themselves' using errcode = '42501';
    end if;
  end if;

  if p_trainer is not null then
    if p_trainer = p_member then
      raise exception 'A member cannot be their own trainer';
    end if;
    if not exists (select 1 from public.profiles where id = p_trainer and role in ('trainer', 'admin', 'head')) then
      raise exception 'The chosen trainer is not a trainer, admin or Head of Department';
    end if;
  end if;

  -- never leave the team without a Head of Department
  if target.role = 'head' and new_role <> 'head'
     and (select count(*) from public.profiles where role = 'head') <= 1 then
    raise exception 'You cannot remove the last Head of Department';
  end if;

  select coalesce(array_agg(tag_id order by tag_id), '{}') into old_tags
  from public.profile_tags where profile_id = p_member;

  update public.profiles
     set role = new_role, age_group_id = p_age_group, trainer_id = p_trainer
   where id = p_member;

  delete from public.profile_tags where profile_id = p_member;
  insert into public.profile_tags (profile_id, tag_id)
  select p_member, t from unnest(coalesce(p_tag_ids, '{}')) as t
  on conflict do nothing;

  insert into public.audit_log (actor_id, action, target_id, details)
  values (auth.uid(), 'assign_member', p_member, jsonb_build_object(
    'before', jsonb_build_object('role', target.role, 'age_group_id', target.age_group_id,
                                 'trainer_id', target.trainer_id, 'tag_ids', to_jsonb(old_tags)),
    'after',  jsonb_build_object('role', new_role, 'age_group_id', p_age_group,
                                 'trainer_id', p_trainer, 'tag_ids', to_jsonb(coalesce(p_tag_ids, '{}')))
  ));
end
$$;

-- Names and roles for showing who wrote something. Same as before, plus
-- Heads are always listed and an auth user without a profile sees nobody.
create or replace view public.member_directory
with (security_barrier = true) as
  select p.id, p.display_name, p.photo_url, p.role
  from public.profiles p
  where public.is_member()
    and (
         p.id = auth.uid()
      or public.is_staff()
      or (p.age_group_id is not null and p.age_group_id = public.my_age_group())
      or p.role in ('trainer', 'admin', 'head')
    );

-- The change log is for Heads only now.
drop policy if exists "admins read the audit log" on public.audit_log;
create policy "heads read the audit log" on public.audit_log
  for select to authenticated using (public.is_head());

-- ---------------------------------------------------------------------------
-- Profiles: dreams & vision, and what each person wants to grow in
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column vision             text check (char_length(vision) <= 1500),
  add column growing_in         text check (char_length(growing_in) <= 1500),
  add column profile_updated_at timestamptz;

-- The existing "update own display name" policy limits updates to your own
-- row; these column grants let you change these two fields on it as well.
grant update (vision, growing_in) on public.profiles to authenticated;

create or replace function public.touch_profile_story()
returns trigger
language plpgsql
as $$
begin
  if new.vision is distinct from old.vision or new.growing_in is distinct from old.growing_in then
    new.profile_updated_at := now();
  end if;
  return new;
end
$$;

create trigger profiles_touch_story
  before update on public.profiles
  for each row execute function public.touch_profile_story();

-- ---------------------------------------------------------------------------
-- Accomplishments, recorded by leaders
-- ---------------------------------------------------------------------------

create table public.accomplishments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  note        text check (char_length(note) <= 1000),
  achieved_on date not null default current_date,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on public.accomplishments (profile_id, achieved_on desc);

-- ---------------------------------------------------------------------------
-- Roadmap: general steps everyone walks (profile_id is null) plus personal
-- steps a leader adds for one person. Progress is signed off by leaders.
-- ---------------------------------------------------------------------------

create table public.roadmap_steps (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 600),
  position    int  not null default 0,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on public.roadmap_steps (profile_id, position);

create table public.roadmap_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  step_id    uuid not null references public.roadmap_steps (id) on delete cascade,
  status     text not null check (status in ('in_progress', 'done')),
  note       text check (char_length(note) <= 600),
  done_on    date,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, step_id)
);

create or replace function public.touch_roadmap_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'done' and new.done_on is null then
    new.done_on := current_date;
  elsif new.status <> 'done' then
    new.done_on := null;
  end if;
  return new;
end
$$;

create trigger roadmap_progress_touch
  before insert or update on public.roadmap_progress
  for each row execute function public.touch_roadmap_progress();

-- A step can be marked for a person only if it is a general step or one of
-- that person's own personal steps.
create or replace function public.step_fits(step uuid, member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.roadmap_steps s
    where s.id = step and (s.profile_id is null or s.profile_id = member)
  )
$$;

-- A general roadmap to start from. Heads of Department replace or extend it
-- (and add personal steps for each person) from the web console.
insert into public.roadmap_steps (title, description, position) values
  ('Welcome to the team',        'Meet your trainer, join the team chat and get to know how we serve together.', 1),
  ('Heart of worship',           'Foundations: why we worship, our team values, and what serving on a Sunday asks of us.', 2),
  ('Shadow a service',           'Sit in with your section at a rehearsal and a Sunday service. Watch, listen and ask questions.', 3),
  ('First rehearsal',            'Play or sing your part with the full band at a midweek rehearsal.', 4),
  ('First Sunday',               'Serve on the roster for your first Sunday service.', 5),
  ('Serving regularly',          'On the roster most months. You come prepared, on time and ready to help.', 6),
  ('Growing in your craft',      'Go deeper: dynamics, arrangements, in-ear mixes and leading moments in a set.', 7),
  ('Leading and raising others', 'Lead your section at rehearsal and walk alongside newer members.', 8);

-- ---------------------------------------------------------------------------
-- Change log entries for journey changes
-- ---------------------------------------------------------------------------

create or replace function public.log_journey_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r       record;
  v_action text;
  v_details jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  if tg_table_name = 'roadmap_progress' then
    v_action := case tg_op when 'DELETE' then 'roadmap_step_cleared' else 'roadmap_step_updated' end;
    v_details := jsonb_build_object(
      'step', (select s.title from public.roadmap_steps s where s.id = r.step_id),
      'status', case when tg_op = 'DELETE' then null else r.status end
    );
  else
    v_action := case tg_op
      when 'INSERT' then 'accomplishment_added'
      when 'UPDATE' then 'accomplishment_edited'
      else 'accomplishment_removed' end;
    v_details := jsonb_build_object('title', r.title);
  end if;

  insert into public.audit_log (actor_id, action, target_id, details)
  values (auth.uid(), v_action, r.profile_id, v_details);
  return null;
end
$$;

create trigger roadmap_progress_log
  after insert or update or delete on public.roadmap_progress
  for each row execute function public.log_journey_change();

create trigger accomplishments_log
  after insert or update or delete on public.accomplishments
  for each row execute function public.log_journey_change();

-- ---------------------------------------------------------------------------
-- Web console access: which Google account belongs to which leader.
-- Rows are written only by the console-access Edge Function, which checks
-- that the caller is a Head of Department.
-- ---------------------------------------------------------------------------

create table public.console_access (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  email         text not null unique
                check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- the Supabase auth user the Google sign-in lands on (created when access is granted)
  login_user_id uuid unique references auth.users (id) on delete set null,
  granted_by    uuid references public.profiles (id) on delete set null,
  granted_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

revoke all on public.accomplishments, public.roadmap_steps, public.roadmap_progress, public.console_access from anon;
revoke insert, update, delete on public.console_access from authenticated;

alter table public.accomplishments  enable row level security;
alter table public.roadmap_steps    enable row level security;
alter table public.roadmap_progress enable row level security;
alter table public.console_access   enable row level security;

-- accomplishments --------------------------------------------------------------
create policy "accomplishments visible to the person, their trainer, admins and heads" on public.accomplishments
  for select to authenticated using (public.can_view_member(profile_id));
create policy "leaders record accomplishments" on public.accomplishments
  for insert to authenticated with check (public.can_manage_member(profile_id) and created_by = auth.uid());
create policy "leaders edit accomplishments" on public.accomplishments
  for update to authenticated
  using (public.can_manage_member(profile_id)) with check (public.can_manage_member(profile_id));
create policy "leaders remove accomplishments" on public.accomplishments
  for delete to authenticated using (public.can_manage_member(profile_id));

-- roadmap steps ----------------------------------------------------------------
create policy "general steps for everyone, personal steps for the person and their leaders" on public.roadmap_steps
  for select to authenticated using (
    (profile_id is null and public.is_member())
    or (profile_id is not null and public.can_view_member(profile_id))
  );
create policy "heads add general steps, leaders add personal steps" on public.roadmap_steps
  for insert to authenticated with check (
    (profile_id is null and public.is_head())
    or (profile_id is not null and public.can_manage_member(profile_id))
  );
create policy "heads edit general steps, leaders edit personal steps" on public.roadmap_steps
  for update to authenticated
  using (
    (profile_id is null and public.is_head())
    or (profile_id is not null and public.can_manage_member(profile_id))
  )
  with check (
    (profile_id is null and public.is_head())
    or (profile_id is not null and public.can_manage_member(profile_id))
  );
create policy "heads remove general steps, leaders remove personal steps" on public.roadmap_steps
  for delete to authenticated using (
    (profile_id is null and public.is_head())
    or (profile_id is not null and public.can_manage_member(profile_id))
  );

-- roadmap progress -------------------------------------------------------------
create policy "progress visible to the person, their trainer, admins and heads" on public.roadmap_progress
  for select to authenticated using (public.can_view_member(profile_id));
create policy "leaders sign off steps" on public.roadmap_progress
  for insert to authenticated with check (
    public.can_manage_member(profile_id) and public.step_fits(step_id, profile_id)
  );
create policy "leaders update steps" on public.roadmap_progress
  for update to authenticated
  using (public.can_manage_member(profile_id))
  with check (public.can_manage_member(profile_id) and public.step_fits(step_id, profile_id));
create policy "leaders clear steps" on public.roadmap_progress
  for delete to authenticated using (public.can_manage_member(profile_id));

-- console access ---------------------------------------------------------------
create policy "heads see console access; leaders see their own" on public.console_access
  for select to authenticated using (public.is_head() or profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.is_head()                     from public, anon;
revoke execute on function public.is_member()                   from public, anon;
revoke execute on function public.can_manage_member(uuid)       from public, anon;
revoke execute on function public.step_fits(uuid, uuid)         from public, anon;
revoke execute on function public.log_journey_change()          from public, anon, authenticated;
revoke execute on function public.touch_profile_story()         from public, anon, authenticated;
revoke execute on function public.touch_roadmap_progress()      from public, anon, authenticated;

grant execute on function public.is_head()               to authenticated;
grant execute on function public.is_member()             to authenticated;
grant execute on function public.can_manage_member(uuid) to authenticated;
grant execute on function public.step_fits(uuid, uuid)   to authenticated;
