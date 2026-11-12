import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DEFAULT_ROLE_LABEL, type AccessLevel, type Role } from "./types";

// What each access level is called on this team. Heads of Department rename
// them in the web console (Team setup), e.g. Trainee -> Member.

let labels: Record<Role, string> = { ...DEFAULT_ROLE_LABEL };
let descriptions: Partial<Record<Role, string>> = {};
const listeners = new Set<() => void>();

export function roleLabel(role: Role): string {
  return labels[role] ?? DEFAULT_ROLE_LABEL[role];
}

export function roleDescription(role: Role): string {
  return descriptions[role] ?? "";
}

/** Fetch the team's names for access levels. Safe to call often. */
export async function loadRoleLabels(): Promise<void> {
  const { data } = await supabase.from("access_levels").select("role, label, description");
  if (!data) return;
  const next = { ...DEFAULT_ROLE_LABEL };
  const nextDesc: Partial<Record<Role, string>> = {};
  (data as AccessLevel[]).forEach((a) => {
    next[a.role] = a.label;
    if (a.description) nextDesc[a.role] = a.description;
  });
  const changed = JSON.stringify([next, nextDesc]) !== JSON.stringify([labels, descriptions]);
  labels = next;
  descriptions = nextDesc;
  if (changed) listeners.forEach((f) => f());
}

/** Re-render when the names change. Use once near the top of each app. */
export function useRoleLabels(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
}
