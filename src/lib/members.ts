import { supabase } from "./supabase";
import type { AgeGroup, Member } from "./types";

const cache = new Map<string, Member>();

/** Names/photos/roles for the given people (only those you're allowed to see). */
export async function fetchMembers(ids: string[]): Promise<Record<string, Member>> {
  const missing = [...new Set(ids)].filter((id) => !cache.has(id));
  if (missing.length) {
    const { data } = await supabase.from("member_directory").select("*").in("id", missing);
    (data as Member[] | null)?.forEach((m) => cache.set(m.id, m));
  }
  const out: Record<string, Member> = {};
  ids.forEach((id) => {
    const m = cache.get(id);
    if (m) out[id] = m;
  });
  return out;
}

export function memberName(members: Record<string, Member>, id: string): string {
  return members[id]?.display_name ?? "Member";
}

let groupsPromise: Promise<AgeGroup[]> | null = null;

export function fetchAgeGroups(): Promise<AgeGroup[]> {
  groupsPromise ??= Promise.resolve(
    supabase.from("age_groups").select("*").order("sort_order"),
  ).then(({ data }) => (data as AgeGroup[]) ?? []);
  return groupsPromise;
}
