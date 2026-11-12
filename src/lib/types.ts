export type Role = "trainee" | "trainer" | "admin" | "head";

/** How each role is named on screen. */
export const ROLE_LABEL: Record<Role, string> = {
  trainee: "Trainee",
  trainer: "Trainer",
  admin: "Admin",
  head: "Head of Dept",
};

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export interface Profile {
  id: string;
  telegram_id: number;
  display_name: string;
  username: string | null;
  photo_url: string | null;
  role: Role;
  age_group_id: string | null;
  trainer_id: string | null;
  created_at: string;
  /** Written by the person themselves. */
  vision: string | null;
  growing_in: string | null;
  profile_updated_at: string | null;
}

/** Public-safe slice of a profile (member_directory view). */
export interface Member {
  id: string;
  display_name: string;
  photo_url: string | null;
  role: Role;
}

export interface AgeGroup {
  id: string;
  label: string;
  sort_order: number;
}

export interface Tag {
  id: string;
  label: string;
  kind: "instrument" | "level" | "general";
}

export type Channel = "general" | "drums" | "guitar" | "bass" | "keys" | "vocals" | "live-sound";

export interface Post {
  id: string;
  author_id: string;
  age_group_id: string;
  channel: Channel;
  body: string;
  media_path: string | null;
  media_kind: "audio" | "image" | "video" | null;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  age_group_id: string | null;
  published: boolean;
  created_by: string;
  created_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  position: number;
}

export type ItemKind = "video" | "photo" | "link" | "text";

export interface LessonItem {
  id: string;
  module_id: string;
  kind: ItemKind;
  title: string;
  url: string | null;
  storage_path: string | null;
  body: string | null;
  position: number;
}

export interface Quiz {
  id: string;
  module_id: string;
  title: string;
  pass_mark: number;
  published: boolean;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  prompt: string;
  position: number;
}

export interface QuizOption {
  id: string;
  question_id: string;
  label: string;
  position: number;
}

export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  results: { question_id: string; chosen_option_id: string | null; correct_option_id: string; correct: boolean }[];
}

export interface Submission {
  id: string;
  trainee_id: string;
  title: string;
  storage_path: string;
  media_kind: "audio" | "video";
  note: string | null;
  created_at: string;
}

export interface FeedbackMessage {
  id: string;
  submission_id: string;
  author_id: string;
  body: string | null;
  voice_path: string | null;
  timestamps: { at: number }[];
  rubric: Record<string, number> | null;
  created_at: string;
}

export interface PracticeSummary {
  week_minutes: number;
  days: { day: string; minutes: number }[];
  streak: number;
}

export interface WrappedData {
  year: number;
  total_minutes: number;
  sessions: number;
  longest_streak: number;
  busiest_month: string | null;
  first_session: string | null;
  quizzes_taken: number;
  quizzes_passed: number;
  lessons_completed: number;
  feedback_received: number;
  percentile_in_group: number | null;
}

/** profile_id null = a step on the general roadmap everyone walks. */
export interface RoadmapStep {
  id: string;
  profile_id: string | null;
  title: string;
  description: string | null;
  position: number;
}

export type StepStatus = "in_progress" | "done";

export interface RoadmapProgress {
  profile_id: string;
  step_id: string;
  status: StepStatus;
  note: string | null;
  done_on: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Accomplishment {
  id: string;
  profile_id: string;
  title: string;
  note: string | null;
  achieved_on: string;
  created_by: string | null;
  created_at: string;
}

export interface ConsoleAccess {
  profile_id: string;
  email: string;
  granted_by: string | null;
  granted_at: string;
}
