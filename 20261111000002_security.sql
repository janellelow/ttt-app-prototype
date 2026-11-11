-- TTT App: who can see and change what.
--
-- The rules, in plain words:
--   * Nobody outside the app (the "anon" role) can read anything.
--   * People see the community posts of their own age group only.
--   * Private things (feedback, recordings, practice log, quiz results, tags,
--     Telegram details) are visible only to the person, their assigned
--     trainer and admins.
--   * Only trainers and admins create lessons and quizzes.
--   * Only admins change roles. Admins and trainers assign age groups,
--     tags and trainers, always through assign_member(), which is logged.
--
-- Every check below runs inside the database, so a bug in the app cannot
-- leak data that these rules do not allow.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read profiles without
-- tripping the profiles policies themselves)
-- ---------------------------------------------------------------------------

create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('trainer', 'admin') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.my_age_group()
returns uuid
language sql stable security definer set search_path = public
as $$ select age_group_id from public.profiles where id = auth.uid() $$;

-- True for the person themselves, their assigned trainer, and admins.
create or replace function public.can_view_member(member uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select member = auth.uid()
      or public.is_admin()
      or exists (select 1 from public.profiles p where p.id = member and p.trainer_id = auth.uid())
$$;

create or replace function public.can_see_post(post uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = post
      and (public.is_staff() or p.age_group_id = public.my_age_group())
  )
$$;

create or replace function public.can_see_course(course uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.courses c
    where c.id = course
      and (
        public.is_staff()
        or (c.published and (c.age_group_id is null or c.age_group_id = public.my_age_group()))
      )
  )
$$;

create or replace function public.course_of_module(m uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select course_id from public.modules where id = m $$;

create or replace function public.can_see_quiz(q uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.quizzes z
    where z.id = q
      and public.can_see_course(public.course_of_module(z.module_id))
      and (z.published or public.is_staff())
  )
$$;

-- Folder names in storage paths are text; turn them into ids without
-- erroring on a malformed path (a bad path simply matches nothing).
create or replace function public.try_uuid(t text)
returns uuid
language plpgsql immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end
$$;

create or replace function public.can_view_submission(s uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.submissions x
    where x.id = s and public.can_view_member(x.trainee_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Lock down defaults, then grant back only what's needed
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- profiles: no direct inserts or updates except your own display name.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- quiz attempts and the audit log are written only by functions.
revoke insert, update, delete on public.quiz_attempts from authenticated;
revoke insert, update, delete on public.audit_log    from authenticated;

-- profile tags are changed only by assign_member().
revoke insert, update, delete on public.profile_tags from authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.age_groups        enable row level security;
alter table public.profiles          enable row level security;
alter table public.tags              enable row level security;
alter table public.profile_tags      enable row level security;
alter table public.posts             enable row level security;
alter table public.post_reactions    enable row level security;
alter table public.post_comments     enable row level security;
alter table public.courses           enable row level security;
alter table public.modules           enable row level security;
alter table public.lesson_items      enable row level security;
alter table public.lesson_progress   enable row level security;
alter table public.quizzes           enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_options      enable row level security;
alter table public.quiz_answer_keys  enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.submissions       enable row level security;
alter table public.feedback_messages enable row level security;
alter table public.audit_log         enable row level security;

-- age groups -----------------------------------------------------------------
create policy "everyone signed in reads age groups" on public.age_groups
  for select to authenticated using (true);
create policy "admins manage age groups" on public.age_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles -------------------------------------------------------------------
-- Full profile rows (Telegram id, username, group, trainer) are private.
-- Trainers also see people nobody has placed yet, so they can assign them.
create policy "read own, assigned or unassigned profiles" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or trainer_id = auth.uid()
    or (public.is_staff() and age_group_id is null and role = 'trainee')
  );
create policy "update own display name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Names and roles only, for showing who wrote a post. Limited to your own
-- age group (staff see everyone, so they can pick trainers and moderate).
create view public.member_directory
with (security_barrier = true) as
  select p.id, p.display_name, p.photo_url, p.role
  from public.profiles p
  where p.id = auth.uid()
     or public.is_staff()
     or (p.age_group_id is not null and p.age_group_id = public.my_age_group())
     or p.role in ('trainer', 'admin');

revoke all on public.member_directory from anon;
grant select on public.member_directory to authenticated;

-- tags -----------------------------------------------------------------------
create policy "staff read tags" on public.tags
  for select to authenticated using (public.is_staff());
create policy "staff create tags" on public.tags
  for insert to authenticated with check (public.is_staff());
create policy "admins edit tags" on public.tags
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete tags" on public.tags
  for delete to authenticated using (public.is_admin());

create policy "tags visible to the person, their trainer and admins" on public.profile_tags
  for select to authenticated using (
    public.can_view_member(profile_id)
    -- trainers also see tags of people nobody has placed yet, while assigning them
    or (public.is_staff() and exists (
      select 1 from public.profiles p where p.id = profile_id and p.age_group_id is null and p.role = 'trainee'
    ))
  );

-- posts ----------------------------------------------------------------------
create policy "read posts in my age group" on public.posts
  for select to authenticated using (public.is_staff() or age_group_id = public.my_age_group());
create policy "post into my age group" on public.posts
  for insert to authenticated with check (
    author_id = auth.uid()
    and (age_group_id = public.my_age_group() or public.is_staff())
    and (media_path is null or media_path like age_group_id::text || '/' || auth.uid()::text || '/%')
  );
create policy "delete own posts, staff delete any" on public.posts
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

create policy "read reactions on visible posts" on public.post_reactions
  for select to authenticated using (public.can_see_post(post_id));
create policy "react to visible posts" on public.post_reactions
  for insert to authenticated with check (profile_id = auth.uid() and public.can_see_post(post_id));
create policy "remove own reaction" on public.post_reactions
  for delete to authenticated using (profile_id = auth.uid());

create policy "read comments on visible posts" on public.post_comments
  for select to authenticated using (public.can_see_post(post_id));
create policy "comment on visible posts" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and public.can_see_post(post_id));
create policy "delete own comments, staff delete any" on public.post_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

-- courses, modules, lesson items --------------------------------------------
create policy "read visible courses" on public.courses
  for select to authenticated using (public.can_see_course(id));
create policy "staff create courses" on public.courses
  for insert to authenticated with check (public.is_staff() and created_by = auth.uid());
create policy "staff edit courses" on public.courses
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete courses" on public.courses
  for delete to authenticated using (public.is_staff());

create policy "read modules of visible courses" on public.modules
  for select to authenticated using (public.can_see_course(course_id));
create policy "staff manage modules" on public.modules
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "read items of visible courses" on public.lesson_items
  for select to authenticated using (public.can_see_course(public.course_of_module(module_id)));
create policy "staff manage items" on public.lesson_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "own progress, trainer and admins read" on public.lesson_progress
  for select to authenticated using (public.can_view_member(profile_id));
create policy "mark own progress" on public.lesson_progress
  for insert to authenticated with check (profile_id = auth.uid());
create policy "unmark own progress" on public.lesson_progress
  for delete to authenticated using (profile_id = auth.uid());

-- quizzes --------------------------------------------------------------------
create policy "read visible quizzes" on public.quizzes
  for select to authenticated using (public.can_see_quiz(id));
create policy "staff manage quizzes" on public.quizzes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "read questions of visible quizzes" on public.quiz_questions
  for select to authenticated using (public.can_see_quiz(quiz_id));
create policy "staff manage questions" on public.quiz_questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "read options of visible quizzes" on public.quiz_options
  for select to authenticated using (
    public.can_see_quiz((select q.quiz_id from public.quiz_questions q where q.id = question_id))
  );
create policy "staff manage options" on public.quiz_options
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "only staff see answer keys" on public.quiz_answer_keys
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "attempts visible to the person, their trainer and admins" on public.quiz_attempts
  for select to authenticated using (public.can_view_member(profile_id));

-- practice log ---------------------------------------------------------------
create policy "practice visible to the person, their trainer and admins" on public.practice_sessions
  for select to authenticated using (public.can_view_member(profile_id));
create policy "log own practice" on public.practice_sessions
  for insert to authenticated with check (profile_id = auth.uid());
create policy "delete own practice" on public.practice_sessions
  for delete to authenticated using (profile_id = auth.uid());

-- submissions and feedback ---------------------------------------------------
create policy "submissions visible to the trainee, their trainer and admins" on public.submissions
  for select to authenticated using (public.can_view_member(trainee_id));
create policy "trainees submit their own takes" on public.submissions
  for insert to authenticated with check (
    trainee_id = auth.uid()
    and storage_path like auth.uid()::text || '/submissions/%'
  );
create policy "trainees delete their own takes" on public.submissions
  for delete to authenticated using (trainee_id = auth.uid() or public.is_admin());

create policy "thread visible to the trainee, their trainer and admins" on public.feedback_messages
  for select to authenticated using (public.can_view_submission(submission_id));
create policy "trainee, their trainer or admins post in the thread" on public.feedback_messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.can_view_submission(submission_id)
    -- rubric scores come from trainers and admins only
    and (rubric is null or public.is_staff())
    and (
      voice_path is null
      or voice_path like (select s.trainee_id::text from public.submissions s where s.id = submission_id) || '/voice/%'
    )
  );
create policy "delete own messages" on public.feedback_messages
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- audit log ------------------------------------------------------------------
create policy "admins read the audit log" on public.audit_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- File storage (all buckets private; the app shows files through short-lived
-- signed links)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('lesson-media',    'lesson-media',    false, 209715200,
     array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('community-media', 'community-media', false, 52428800,
     array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('private-media',   'private-media',   false, 209715200,
     array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- lesson-media: <course_id>/<file>
create policy "read lesson media of visible courses" on storage.objects
  for select to authenticated using (
    bucket_id = 'lesson-media'
    and public.can_see_course(public.try_uuid((storage.foldername(name))[1]))
  );
create policy "staff upload lesson media" on storage.objects
  for insert to authenticated with check (bucket_id = 'lesson-media' and public.is_staff());
create policy "staff delete lesson media" on storage.objects
  for delete to authenticated using (bucket_id = 'lesson-media' and public.is_staff());

-- community-media: <age_group_id>/<user_id>/<file>
create policy "read community media of my age group" on storage.objects
  for select to authenticated using (
    bucket_id = 'community-media'
    and (public.is_staff() or (storage.foldername(name))[1] = public.my_age_group()::text)
  );
create policy "upload community media into my age group" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and ((storage.foldername(name))[1] = public.my_age_group()::text or public.is_staff())
  );
create policy "delete own community media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'community-media'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_staff())
  );

-- private-media: <trainee_id>/submissions/<file> and <trainee_id>/voice/<file>
create policy "private media visible to the trainee, their trainer and admins" on storage.objects
  for select to authenticated using (
    bucket_id = 'private-media'
    and public.can_view_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy "trainees upload their takes" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'private-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'submissions'
  );
create policy "thread members upload voice notes" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'private-media'
    and (storage.foldername(name))[2] = 'voice'
    and public.can_view_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy "trainees and admins delete private media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'private-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
