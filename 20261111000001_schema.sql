-- TTT App: tables
-- Run order: schema -> security -> functions (Supabase CLI applies these in filename order).

create extension if not exists pgcrypto;

create type public.user_role as enum ('trainee', 'trainer', 'admin');

-- ---------------------------------------------------------------------------
-- People, groups and tags
-- ---------------------------------------------------------------------------

create table public.age_groups (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  sort_order int  not null default 0
);

insert into public.age_groups (label, sort_order) values
  ('13–15', 1), ('16–19', 2), ('20–24', 3), ('25–40', 4);

-- One row per person. Created by the telegram-auth function on first sign-in.
-- Role, age group, tags and trainer are ONLY changed through assign_member().
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  telegram_id   bigint not null unique,
  display_name  text   not null check (char_length(display_name) between 1 and 80),
  username      text,
  photo_url     text,
  role          public.user_role not null default 'trainee',
  age_group_id  uuid references public.age_groups (id) on delete set null,
  trainer_id    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index on public.profiles (age_group_id);
create index on public.profiles (trainer_id);

-- Demographic / skill tags an admin or trainer can attach to a person
-- (instrument, level, school, region...).
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (char_length(label) between 1 and 40),
  kind       text not null default 'general' check (kind in ('instrument', 'level', 'general')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.tags (label, kind) values
  ('Drums', 'instrument'), ('Guitar', 'instrument'), ('Bass', 'instrument'),
  ('Keys', 'instrument'), ('Vocals', 'instrument'), ('Live sound', 'instrument'),
  ('Beginner', 'level'), ('Intermediate', 'level'), ('Advanced', 'level');

create table public.profile_tags (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  primary key (profile_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Community
-- ---------------------------------------------------------------------------

create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  age_group_id uuid not null references public.age_groups (id) on delete cascade,
  channel      text not null default 'general'
               check (channel in ('general', 'drums', 'guitar', 'bass', 'keys', 'vocals', 'live-sound')),
  body         text not null check (char_length(body) between 1 and 2000),
  media_path   text,
  media_kind   text check (media_kind in ('audio', 'image', 'video')),
  created_at   timestamptz not null default now()
);

create index on public.posts (age_group_id, created_at desc);

create table public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index on public.post_comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- Training content
-- ---------------------------------------------------------------------------

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  description  text,
  age_group_id uuid references public.age_groups (id) on delete set null, -- null = every group
  published    boolean not null default false,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);

create table public.modules (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title     text not null check (char_length(title) between 1 and 120),
  position  int  not null default 0
);

create index on public.modules (course_id, position);

create table public.lesson_items (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid not null references public.modules (id) on delete cascade,
  kind         text not null check (kind in ('video', 'photo', 'link', 'text')),
  title        text not null check (char_length(title) between 1 and 120),
  url          text,          -- for links (and externally hosted videos)
  storage_path text,          -- for uploaded files in the lesson-media bucket
  body         text,          -- for text notes
  position     int  not null default 0,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (url is not null or storage_path is not null or body is not null)
);

create index on public.lesson_items (module_id, position);

create table public.lesson_progress (
  profile_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id      uuid not null references public.lesson_items (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Quizzes and exams
-- ---------------------------------------------------------------------------

create table public.quizzes (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.modules (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  pass_mark  int  not null default 60 check (pass_mark between 0 and 100),
  published  boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references public.quizzes (id) on delete cascade,
  prompt   text not null check (char_length(prompt) between 1 and 500),
  position int  not null default 0
);

create table public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 200),
  position    int  not null default 0
);

-- Correct answers live in their own table so trainees can never read them.
create table public.quiz_answer_keys (
  question_id       uuid primary key references public.quiz_questions (id) on delete cascade,
  correct_option_id uuid not null references public.quiz_options (id) on delete cascade
);

-- Written only by submit_quiz(), which marks answers on the server.
create table public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  score      int  not null,
  total      int  not null,
  passed     boolean not null,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);

create index on public.quiz_attempts (profile_id, created_at);

-- ---------------------------------------------------------------------------
-- Practice log (feeds the weekly card and Wrapped)
-- ---------------------------------------------------------------------------

create table public.practice_sessions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  minutes    int  not null check (minutes between 1 and 600),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index on public.practice_sessions (profile_id, started_at);

-- ---------------------------------------------------------------------------
-- Private feedback
-- ---------------------------------------------------------------------------

-- A recording a trainee sends for feedback.
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  storage_path text not null,           -- private-media bucket: <trainee_id>/submissions/<file>
  media_kind   text not null check (media_kind in ('audio', 'video')),
  note         text check (char_length(note) <= 1000),
  created_at   timestamptz not null default now()
);

create index on public.submissions (trainee_id, created_at desc);

-- Messages in a submission's private thread, from the trainee, their trainer or an admin.
create table public.feedback_messages (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body          text check (char_length(body) <= 2000),
  voice_path    text,                     -- private-media bucket: <trainee_id>/voice/<file>
  timestamps    jsonb not null default '[]'::jsonb, -- [{"at": 32}, {"at": 70}] seconds into the take
  rubric        jsonb,                    -- {"Timing": 3, "Dynamics": 4, "Feel": 4} (1-5), trainers only
  created_at    timestamptz not null default now(),
  check (body is not null or voice_path is not null)
);

create index on public.feedback_messages (submission_id, created_at);

-- ---------------------------------------------------------------------------
-- Audit log: who changed whose role, group, tags or trainer
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  target_id  uuid,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
