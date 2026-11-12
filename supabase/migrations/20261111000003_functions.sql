-- TTT App: server-side actions the app calls with supabase.rpc(...)

-- ---------------------------------------------------------------------------
-- assign_member: set someone's role, age group, tags and trainer.
--   Admins: can change anything for anyone.
--   Trainers: can place people nobody has placed yet, or their own trainees,
--             and become their trainer. They cannot change roles.
-- Every call is written to the audit log.
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
  if caller_role is null or caller_role not in ('trainer', 'admin') then
    raise exception 'Only trainers and admins can assign members' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_member for update;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  new_role := coalesce(p_role, target.role);

  if caller_role = 'trainer' then
    if target.role <> 'trainee' then
      raise exception 'Only admins can assign trainers and admins' using errcode = '42501';
    end if;
    -- "is not distinct from" so a missing trainer (null) never counts as a match
    if not (target.age_group_id is null or target.trainer_id is not distinct from auth.uid()) then
      raise exception 'Trainers can only assign unplaced members or their own trainees' using errcode = '42501';
    end if;
    if new_role <> target.role then
      raise exception 'Only admins can change roles' using errcode = '42501';
    end if;
    if p_trainer is distinct from auth.uid() then
      raise exception 'Trainers can only assign members to themselves' using errcode = '42501';
    end if;
  end if;

  if p_trainer is not null then
    if p_trainer = p_member then
      raise exception 'A member cannot be their own trainer';
    end if;
    if not exists (select 1 from public.profiles where id = p_trainer and role in ('trainer', 'admin')) then
      raise exception 'The chosen trainer is not a trainer or admin';
    end if;
  end if;

  -- never leave the app without an admin
  if target.role = 'admin' and new_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'You cannot remove the last admin';
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
-- submit_quiz: mark a quiz on the server so answers never reach the phone
-- before the attempt. p_answers = {"<question_id>": "<option_id>", ...}
-- ---------------------------------------------------------------------------
create or replace function public.submit_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_quiz    public.quizzes%rowtype;
  v_total   int;
  v_score   int;
  v_passed  boolean;
  v_results jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found or not public.can_see_quiz(p_quiz) or not v_quiz.published then
    raise exception 'Quiz not available' using errcode = '42501';
  end if;

  select count(*) into v_total from public.quiz_questions where quiz_id = p_quiz;
  if v_total = 0 then
    raise exception 'This quiz has no questions yet';
  end if;

  select
    count(*) filter (where k.correct_option_id::text = p_answers ->> q.id::text),
    jsonb_agg(jsonb_build_object(
      'question_id', q.id,
      'chosen_option_id', p_answers ->> q.id::text,
      'correct_option_id', k.correct_option_id,
      'correct', k.correct_option_id::text = p_answers ->> q.id::text
    ) order by q.position)
  into v_score, v_results
  from public.quiz_questions q
  left join public.quiz_answer_keys k on k.question_id = q.id
  where q.quiz_id = p_quiz;

  v_passed := (v_score * 100) >= (v_quiz.pass_mark * v_total);

  insert into public.quiz_attempts (quiz_id, profile_id, score, total, passed, answers)
  values (p_quiz, auth.uid(), v_score, v_total, v_passed, coalesce(p_answers, '{}'::jsonb));

  return jsonb_build_object('score', v_score, 'total', v_total, 'passed', v_passed, 'results', v_results);
end
$$;

-- ---------------------------------------------------------------------------
-- get_practice_summary: the weekly card on the Community screen.
-- ---------------------------------------------------------------------------
create or replace function public.get_practice_summary(p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today  date := (now() at time zone p_tz)::date;
  v_monday date := date_trunc('week', (now() at time zone p_tz))::date;
  v_days   jsonb;
  v_week   int;
  v_streak int := 0;
  v_day    date;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object('day', d::date, 'minutes', coalesce(m.minutes, 0)) order by d),
         coalesce(sum(m.minutes), 0)
  into v_days, v_week
  from generate_series(v_monday, v_monday + 6, interval '1 day') as d
  left join lateral (
    select sum(s.minutes)::int as minutes
    from public.practice_sessions s
    where s.profile_id = auth.uid()
      and (s.started_at at time zone p_tz)::date = d::date
  ) m on true;

  -- current streak: consecutive days with practice, ending today (or yesterday
  -- if today has nothing logged yet)
  v_day := v_today;
  if not exists (select 1 from public.practice_sessions
                 where profile_id = auth.uid() and (started_at at time zone p_tz)::date = v_day) then
    v_day := v_today - 1;
  end if;
  while exists (select 1 from public.practice_sessions
                where profile_id = auth.uid() and (started_at at time zone p_tz)::date = v_day) loop
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  return jsonb_build_object('week_minutes', v_week, 'days', v_days, 'streak', v_streak);
end
$$;

-- ---------------------------------------------------------------------------
-- get_wrapped: the year in review. The person, their trainer and admins can
-- open it. The community comparison only appears when the age group has at
-- least 5 trainees, so nobody can work out another person's numbers.
-- ---------------------------------------------------------------------------
create or replace function public.get_wrapped(
  p_year   int  default extract(year from now())::int,
  p_member uuid default null,
  p_tz     text default 'UTC'
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  m              uuid := coalesce(p_member, auth.uid());
  v_minutes      int;
  v_sessions     int;
  v_longest      int;
  v_quiz_taken   int;
  v_quiz_passed  int;
  v_items        int;
  v_feedback     int;
  v_busiest      text;
  v_first        date;
  v_group        uuid;
  v_group_size   int;
  v_percentile   int;
begin
  if m is null or not public.can_view_member(m) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select coalesce(sum(minutes), 0), count(*), min((started_at at time zone p_tz)::date)
  into v_minutes, v_sessions, v_first
  from public.practice_sessions
  where profile_id = m and extract(year from started_at at time zone p_tz) = p_year;

  with d as (
    select distinct (started_at at time zone p_tz)::date as day
    from public.practice_sessions
    where profile_id = m and extract(year from started_at at time zone p_tz) = p_year
  ), g as (
    select day - (row_number() over (order by day))::int as grp from d
  )
  select coalesce(max(c), 0) into v_longest from (select count(*) as c from g group by grp) x;

  select to_char(make_date(p_year, mon::int, 1), 'FMMonth') into v_busiest
  from (
    select extract(month from started_at at time zone p_tz) as mon, sum(minutes) as total
    from public.practice_sessions
    where profile_id = m and extract(year from started_at at time zone p_tz) = p_year
    group by 1 order by 2 desc limit 1
  ) b;

  select count(*), count(*) filter (where passed) into v_quiz_taken, v_quiz_passed
  from public.quiz_attempts
  where profile_id = m and extract(year from created_at at time zone p_tz) = p_year;

  select count(*) into v_items
  from public.lesson_progress
  where profile_id = m and extract(year from completed_at at time zone p_tz) = p_year;

  select count(*) into v_feedback
  from public.feedback_messages f
  join public.submissions s on s.id = f.submission_id
  where s.trainee_id = m and f.author_id <> m
    and extract(year from f.created_at at time zone p_tz) = p_year;

  select age_group_id into v_group from public.profiles where id = m;

  if v_group is not null then
    with totals as (
      select p.id, coalesce(sum(s.minutes), 0) as total
      from public.profiles p
      left join public.practice_sessions s
        on s.profile_id = p.id and extract(year from s.started_at at time zone p_tz) = p_year
      where p.age_group_id = v_group and p.role = 'trainee'
      group by p.id
    )
    select count(*),
           round(100.0 * count(*) filter (where total < v_minutes) / nullif(count(*) - 1, 0))::int
    into v_group_size, v_percentile
    from totals;
    if v_group_size < 5 then
      v_percentile := null;
    end if;
  end if;

  return jsonb_build_object(
    'year', p_year,
    'total_minutes', v_minutes,
    'sessions', v_sessions,
    'longest_streak', v_longest,
    'busiest_month', v_busiest,
    'first_session', v_first,
    'quizzes_taken', v_quiz_taken,
    'quizzes_passed', v_quiz_passed,
    'lessons_completed', v_items,
    'feedback_received', v_feedback,
    'percentile_in_group', v_percentile
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in app users may call these; never the public.
-- ---------------------------------------------------------------------------
revoke execute on function public.assign_member(uuid, uuid, uuid, uuid[], public.user_role) from public, anon;
revoke execute on function public.submit_quiz(uuid, jsonb)                                   from public, anon;
revoke execute on function public.get_practice_summary(text)                                 from public, anon;
revoke execute on function public.get_wrapped(int, uuid, text)                               from public, anon;

grant execute on function public.assign_member(uuid, uuid, uuid, uuid[], public.user_role) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb)                                   to authenticated;
grant execute on function public.get_practice_summary(text)                                 to authenticated;
grant execute on function public.get_wrapped(int, uuid, text)                               to authenticated;

revoke execute on function public.my_role()                 from public, anon;
revoke execute on function public.is_admin()                from public, anon;
revoke execute on function public.is_staff()                from public, anon;
revoke execute on function public.my_age_group()            from public, anon;
revoke execute on function public.can_view_member(uuid)     from public, anon;
revoke execute on function public.can_see_post(uuid)        from public, anon;
revoke execute on function public.can_see_course(uuid)      from public, anon;
revoke execute on function public.course_of_module(uuid)    from public, anon;
revoke execute on function public.can_see_quiz(uuid)        from public, anon;
revoke execute on function public.can_view_submission(uuid) from public, anon;

grant execute on function public.my_role()                 to authenticated;
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.is_staff()                to authenticated;
grant execute on function public.my_age_group()            to authenticated;
grant execute on function public.can_view_member(uuid)     to authenticated;
grant execute on function public.can_see_post(uuid)        to authenticated;
grant execute on function public.can_see_course(uuid)      to authenticated;
grant execute on function public.course_of_module(uuid)    to authenticated;
grant execute on function public.can_see_quiz(uuid)        to authenticated;
grant execute on function public.can_view_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Making the first admin (run once in the SQL editor after you have opened
-- the app in Telegram yourself; replace the number with your Telegram id):
--
--   update public.profiles set role = 'admin' where telegram_id = 123456789;
-- ---------------------------------------------------------------------------
