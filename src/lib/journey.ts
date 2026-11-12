// Reading and recording someone's worship team journey: roadmap steps,
// which ones leaders have signed off, and accomplishments.
// The database decides who may do what (supabase/migrations/*_journey.sql);
// these helpers just call it. Used by the mini app and the web console.

import { supabase, unwrap } from "./supabase";
import type { Accomplishment, RoadmapProgress, RoadmapStep, StepStatus } from "./types";

export interface Journey {
  /** General steps and this person's own steps, in walking order. */
  steps: RoadmapStep[];
  progress: Record<string, RoadmapProgress>;
  accomplishments: Accomplishment[];
}

export type StepState = "done" | "current" | "next" | "upcoming";

export async function fetchJourney(memberId: string): Promise<Journey> {
  const [general, personal, progress, accomplishments] = await Promise.all([
    supabase.from("roadmap_steps").select("*").is("profile_id", null).order("position"),
    supabase.from("roadmap_steps").select("*").eq("profile_id", memberId).order("position"),
    supabase.from("roadmap_progress").select("*").eq("profile_id", memberId),
    supabase.from("accomplishments").select("*").eq("profile_id", memberId).order("achieved_on", { ascending: false }),
  ]);
  const steps = [...(unwrap(general) as RoadmapStep[]), ...(unwrap(personal) as RoadmapStep[])].sort(
    (a, b) => a.position - b.position || Number(a.profile_id !== null) - Number(b.profile_id !== null),
  );
  const byStep: Record<string, RoadmapProgress> = {};
  (unwrap(progress) as RoadmapProgress[]).forEach((p) => (byStep[p.step_id] = p));
  return { steps, progress: byStep, accomplishments: unwrap(accomplishments) as Accomplishment[] };
}

/**
 * Where each step stands. "current" is a step a leader marked in progress;
 * if none is, the first step after the furthest signed-off one is "next".
 */
export function stepStates(journey: Journey): Record<string, StepState> {
  const { steps, progress } = journey;
  const out: Record<string, StepState> = {};
  const hasCurrent = steps.some((s) => progress[s.id]?.status === "in_progress");
  let lastDone = -1;
  steps.forEach((s, i) => {
    if (progress[s.id]?.status === "done") lastDone = i;
  });
  steps.forEach((s, i) => {
    const p = progress[s.id];
    if (p?.status === "done") out[s.id] = "done";
    else if (p?.status === "in_progress") out[s.id] = "current";
    else if (!hasCurrent && i === lastDone + 1) out[s.id] = "next";
    else out[s.id] = "upcoming";
  });
  return out;
}

/** The step to headline: the one in progress, else the next one, else the last signed off. */
export function focusStep(journey: Journey): { step: RoadmapStep; index: number; state: StepState } | null {
  const states = stepStates(journey);
  const pick = (want: StepState) => journey.steps.findIndex((s) => states[s.id] === want);
  for (const want of ["current", "next"] as StepState[]) {
    const i = pick(want);
    if (i >= 0) return { step: journey.steps[i]!, index: i, state: want };
  }
  const done = journey.steps.map((s, i) => [s, i] as const).filter(([s]) => states[s.id] === "done");
  const last = done[done.length - 1];
  return last ? { step: last[0], index: last[1], state: "done" } : null;
}

/** Sign off a step, mark it in progress, or clear it (status null). */
export async function saveStep(
  memberId: string,
  stepId: string,
  status: StepStatus | null,
  note: string,
  doneOn: string | null,
): Promise<void> {
  if (status === null) {
    unwrap(await supabase.from("roadmap_progress").delete().eq("profile_id", memberId).eq("step_id", stepId));
    return;
  }
  unwrap(
    await supabase.from("roadmap_progress").upsert(
      { profile_id: memberId, step_id: stepId, status, note: note.trim() || null, done_on: status === "done" ? doneOn : null },
      { onConflict: "profile_id,step_id" },
    ),
  );
}

export async function addPersonalStep(memberId: string, title: string, description: string, position: number) {
  unwrap(
    await supabase
      .from("roadmap_steps")
      .insert({ profile_id: memberId, title: title.trim(), description: description.trim() || null, position }),
  );
}

export async function addAccomplishment(memberId: string, title: string, note: string, achievedOn: string) {
  unwrap(
    await supabase
      .from("accomplishments")
      .insert({ profile_id: memberId, title: title.trim(), note: note.trim() || null, achieved_on: achievedOn }),
  );
}

export async function removeAccomplishment(id: string) {
  unwrap(await supabase.from("accomplishments").delete().eq("id", id));
}

/** Each person writes their own dreams & vision and what they want to grow in. */
export async function saveMyStory(myId: string, vision: string, growingIn: string) {
  unwrap(
    await supabase
      .from("profiles")
      .update({ vision: vision.trim() || null, growing_in: growingIn.trim() || null })
      .eq("id", myId),
  );
}

/** "2026-03-14" -> "14 Mar 2026" */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "";
  const d = new Date(`${day.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
