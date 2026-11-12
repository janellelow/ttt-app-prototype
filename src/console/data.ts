// Everything the web console shows, loaded in one go. The database rules
// decide what comes back: Heads and admins get everyone, trainers get their
// own trainees and people nobody has placed yet.

import { focusStep, type Journey, type StepState } from "../lib/journey";
import { fetchAgeGroups } from "../lib/members";
import { supabase, unwrap } from "../lib/supabase";
import type {
  Accomplishment,
  AgeGroup,
  Member,
  Profile,
  RoadmapProgress,
  RoadmapStep,
  Tag,
} from "../lib/types";

export interface Team {
  people: Profile[];
  groups: AgeGroup[];
  tags: Tag[];
  tagsOf: Record<string, string[]>;
  /** Trainers, admins and Heads (for names and the trainer picker). */
  leaders: Member[];
  steps: RoadmapStep[];
  progress: RoadmapProgress[];
  accomplishments: Accomplishment[];
}

export async function fetchTeam(): Promise<Team> {
  const people = unwrap(await supabase.from("profiles").select("*").order("display_name")) as Profile[];
  const ids = people.map((p) => p.id);
  const [groups, tags, pt, leaders, steps, progress, wins] = await Promise.all([
    fetchAgeGroups(),
    supabase.from("tags").select("*").order("kind").order("label"),
    ids.length ? supabase.from("profile_tags").select("profile_id, tag_id").in("profile_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("member_directory").select("*").in("role", ["trainer", "admin", "head"]).order("display_name"),
    supabase.from("roadmap_steps").select("*").order("position"),
    supabase.from("roadmap_progress").select("*"),
    supabase.from("accomplishments").select("*").order("achieved_on", { ascending: false }),
  ]);
  const tagsOf: Record<string, string[]> = {};
  ((pt.data ?? []) as { profile_id: string; tag_id: string }[]).forEach((r) => (tagsOf[r.profile_id] ??= []).push(r.tag_id));
  return {
    people,
    groups,
    tags: (tags.data as Tag[]) ?? [],
    tagsOf,
    leaders: (leaders.data as Member[]) ?? [],
    steps: unwrap(steps) as RoadmapStep[],
    progress: unwrap(progress) as RoadmapProgress[],
    accomplishments: unwrap(wins) as Accomplishment[],
  };
}

/** One person's journey, built from the team data already loaded. */
export function journeyOf(team: Team, personId: string): Journey {
  const steps = team.steps
    .filter((s) => s.profile_id === null || s.profile_id === personId)
    .sort((a, b) => a.position - b.position || Number(a.profile_id !== null) - Number(b.profile_id !== null));
  const progress: Journey["progress"] = {};
  team.progress.filter((p) => p.profile_id === personId).forEach((p) => (progress[p.step_id] = p));
  return { steps, progress, accomplishments: team.accomplishments.filter((a) => a.profile_id === personId) };
}

export interface RoadPosition {
  index: number;
  title: string;
  state: StepState;
}

export function positionOf(team: Team, personId: string): RoadPosition | null {
  const f = focusStep(journeyOf(team, personId));
  return f ? { index: f.index, title: f.step.title, state: f.state } : null;
}

export function namesOf(team: Team): Record<string, Member> {
  const out: Record<string, Member> = {};
  team.leaders.forEach((m) => (out[m.id] = m));
  team.people.forEach((p) => (out[p.id] = { id: p.id, display_name: p.display_name, photo_url: p.photo_url, role: p.role }));
  return out;
}

export function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}
