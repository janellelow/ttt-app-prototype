-- TTT App: team setup the Heads of Department customise from the web console.
--
--   * Departments (Band, Vocals, Production…) with their own department Heads.
--     A department Head looks after the trainees and trainers in their
--     department the way a trainer looks after their own trainees: they see
--     their journeys and private data, sign off steps, record accomplishments
--     and place them. They cannot change roles.
--   * Only the overall Head (role 'head') and admins put people in
--     departments, and only the overall Head appoints department Heads,
--     because department membership decides who can see someone's data.
--   * Serving roles (Worship Leader, Drummer, Sound Engineer…) are the
--     existing tags of kind 'instrument', now with an optional department and
--     description. Levels and private notes stay as they are.
--   * Access levels keep their meaning, but Heads can rename them (for
--     example Trainee -> Member) and describe them.
--   * Age groups can be added, renamed and reordered by admins and Heads.
--     One that still has people or posts can't be deleted (deleting it would
--     also delete its Community posts).
--   * Every change here is written to the change log.

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 300),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.department_members (
  department_id uuid not null references public.departments (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  is_head       boolean not null default false,
  added_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at      timestamptz not null default now(),
  primary key (department_id, profile_id)
);

create index on public.department_members (profile_id);

create or replace function public.in_department(dept uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.department_members where department_id = dept and profile_id = auth.uid()) $$;

create or replace function public.heads_department(dept uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_staff() and exists (
    select 1 from public.department_members
    where department_id = dept and profile_id = auth.uid() and is_head
  )
$$;

-- True when you are a Head of a department this trainee or trainer is in.
-- Admins and overall Heads are never "led" by a department Head. Losing the
-- trainer-or-higher role ends a department Head's reach straight away.
create or replace function public.leads_member(member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select member <> auth.uid()
     and public.is_staff()
     and exists (
       select 1
       from public.department_members h
       join public.department_members m on m.department_id = h.department_id
       join public.profiles p on p.id = m.profile_id
       where h.profile_id = auth.uid() and h.is_head
         and m.profile_id = member
         and p.role in ('trainee', 'trainer')
     )
$$;

-- Department Heads must be trainers or higher.
create or replace function public.check_department_head()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_head and not exists (
    select 1 from public.profiles where id = new.profile_id and role in ('trainer', 'admin', 'head')
  ) then
    raise exception 'Make this person a trainer or higher before making them a department Head';
  end if;
  return new;
end
$$;

create trigger department_members_check_head
  before insert or update on public.department_members
  for each row execute function public.check_department_head();

-- ---------------------------------------------------------------------------
-- Department Heads join the people who can see and look after a member
-- ---------------------------------------------------------------------------

create or replace function public.can_view_member(member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select member = auth.uid()
      or public.is_admin()
      or exists (select 1 from public.profiles p where p.id = member and p.trainer_id = auth.uid())
      or public.leads_member(member)
$$;

create or replace function public.can_manage_member(member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.is_head()
    or (member <> auth.uid() and (
          public.is_admin()
       or exists (select 1 from public.profiles p where p.id = member and p.trainer_id = auth.uid())
       or public.leads_member(member)
    )),
    false)
$$;

drop policy if exists "read own, assigned or unassigned profiles" on public.profiles;
create policy "read own, assigned, departmental or unassigned profiles" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or trainer_id = auth.uid()
    or public.leads_member(id)
    or (public.is_staff() and age_group_id is null and role = 'trainee')
  );

-- assign_member: as before, plus department Heads can place the trainees and
-- trainers in their department (age group, tags, any leader as trainer).
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

  if caller_role = 'trainer' and not public.leads_member(p_member) then
    if target.role <> 'trainee' then
      raise exception 'Only admins can assign trainers and admins' using errcode = '42501';
    end if;
    -- "is not distinct from" so a missing trainer (null) never counts as a match
    if not (target.age_group_id is null or target.trainer_id is not distinct from auth.uid()) then
      raise exception 'Trainers can only assign unplaced members, their own trainees or their department' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- Serving roles: tags of kind 'instrument' can belong to a department
-- ---------------------------------------------------------------------------

alter table public.tags
  add column department_id uuid references public.departments (id) on delete set null,
  add column description   text check (char_length(description) <= 200);

-- ---------------------------------------------------------------------------
-- Access level names
-- ---------------------------------------------------------------------------

create table public.access_levels (
  role        public.user_role primary key,
  label       text not null check (char_length(label) between 1 and 30),
  description text check (char_length(description) <= 200),
  updated_at  timestamptz not null default now()
);

insert into public.access_levels (role, label, description) values
  ('trainee', 'Trainee',      'Everyone on the team: their own journey, community, lessons and feedback.'),
  ('trainer', 'Trainer',      'Looks after their own trainees: journeys, feedback and lessons.'),
  ('admin',   'Admin',        'Places people and looks after everyone''s journeys.'),
  ('head',    'Head of Dept', 'Runs the whole team: roles, departments, roadmap, team setup, console access and the change log.');

-- ---------------------------------------------------------------------------
-- Age groups: keep their people and posts safe
-- ---------------------------------------------------------------------------

create or replace function public.protect_age_group()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where age_group_id = old.id)
     or exists (select 1 from public.posts where age_group_id = old.id) then
    raise exception 'This age group still has people or posts. Rename it, or move everyone out first.';
  end if;
  return old;
end
$$;

create trigger age_groups_protect
  before delete on public.age_groups
  for each row execute function public.protect_age_group();

-- ---------------------------------------------------------------------------
-- Change log entries for team setup
-- ---------------------------------------------------------------------------

create or replace function public.log_setup_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r         jsonb;
  v_action  text;
  v_target  uuid;
  v_details jsonb;
begin
  r := to_jsonb(case when tg_op = 'DELETE' then old else new end);

  if tg_table_name = 'department_members' then
    if tg_op = 'UPDATE' and old.is_head = new.is_head then return null; end if;
    v_target := (r ->> 'profile_id')::uuid;
    v_action := case tg_op
      when 'INSERT' then 'department_member_added'
      when 'DELETE' then 'department_member_removed'
      else 'department_head_changed' end;
    v_details := jsonb_build_object(
      'department', (select d.name from public.departments d where d.id = (r ->> 'department_id')::uuid),
      'is_head', (r ->> 'is_head')::boolean
    );
  else
    v_action := 'setup_changed';
    v_details := jsonb_build_object(
      'area', case tg_table_name
        when 'departments'   then 'department'
        when 'access_levels' then 'access level'
        when 'age_groups'    then 'age group'
        else case r ->> 'kind' when 'instrument' then 'serving role' when 'level' then 'level' else 'private note' end
      end,
      'op', case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'changed' end,
      'name', coalesce(r ->> 'name', r ->> 'label')
    );
  end if;

  insert into public.audit_log (actor_id, action, target_id, details)
  values (auth.uid(), v_action, v_target, v_details);
  return null;
end
$$;

create trigger departments_log        after insert or update or delete on public.departments        for each row execute function public.log_setup_change();
create trigger department_members_log after insert or update or delete on public.department_members for each row execute function public.log_setup_change();
create trigger access_levels_log      after update                     on public.access_levels      for each row execute function public.log_setup_change();
create trigger tags_log               after insert or update or delete on public.tags               for each row execute function public.log_setup_change();
create trigger age_groups_log         after insert or update or delete on public.age_groups         for each row execute function public.log_setup_change();

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

revoke all on public.departments, public.department_members, public.access_levels from anon;
revoke insert, delete on public.access_levels from authenticated;

alter table public.departments        enable row level security;
alter table public.department_members enable row level security;
alter table public.access_levels      enable row level security;

create policy "everyone on the team reads departments" on public.departments
  for select to authenticated using (public.is_member());
create policy "heads manage departments" on public.departments
  for all to authenticated using (public.is_head()) with check (public.is_head());

create policy "see your own departments, their Heads, and the people you look after" on public.department_members
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.heads_department(department_id)
    or (is_head and public.in_department(department_id))
    or public.can_view_member(profile_id)
  );
create policy "admins and heads put people in departments; only heads appoint department Heads" on public.department_members
  for insert to authenticated with check (public.is_head() or (public.is_admin() and not is_head));
create policy "admins and heads update department membership" on public.department_members
  for update to authenticated
  using (public.is_head() or (public.is_admin() and not is_head))
  with check (public.is_head() or (public.is_admin() and not is_head));
create policy "admins and heads take people out of departments" on public.department_members
  for delete to authenticated using (public.is_head() or (public.is_admin() and not is_head));

create policy "everyone on the team reads access level names" on public.access_levels
  for select to authenticated using (public.is_member());
create policy "heads rename access levels" on public.access_levels
  for update to authenticated using (public.is_head()) with check (public.is_head());

revoke execute on function public.in_department(uuid)         from public, anon;
revoke execute on function public.heads_department(uuid)      from public, anon;
revoke execute on function public.leads_member(uuid)          from public, anon;
revoke execute on function public.check_department_head()     from public, anon, authenticated;
revoke execute on function public.protect_age_group()         from public, anon, authenticated;
revoke execute on function public.log_setup_change()          from public, anon, authenticated;

grant execute on function public.in_department(uuid)    to authenticated;
grant execute on function public.heads_department(uuid) to authenticated;
grant execute on function public.leads_member(uuid)     to authenticated;
