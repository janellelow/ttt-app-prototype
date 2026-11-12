import { supabase } from "./supabase";
import type { Department, DepartmentMember } from "./types";

export interface MyDepartment {
  department: Department;
  /** This person is a Head of the department. */
  isHead: boolean;
  /** Names of the department's Heads (that you are allowed to see). */
  heads: string[];
}

/** The departments a person is in, with their Heads. */
export async function fetchDepartmentsOf(personId: string): Promise<MyDepartment[]> {
  const [{ data: depts }, { data: rows }] = await Promise.all([
    supabase.from("departments").select("*").order("sort_order").order("name"),
    supabase.from("department_members").select("department_id, profile_id, is_head"),
  ]);
  const members = (rows as DepartmentMember[] | null) ?? [];
  const mine = members.filter((m) => m.profile_id === personId);
  const headIds = [...new Set(members.filter((m) => m.is_head).map((m) => m.profile_id))];
  const { data: names } = headIds.length
    ? await supabase.from("member_directory").select("id, display_name").in("id", headIds)
    : { data: [] };
  const nameOf = (id: string) => (names as { id: string; display_name: string }[] | null)?.find((n) => n.id === id)?.display_name;
  return ((depts as Department[] | null) ?? [])
    .filter((d) => mine.some((m) => m.department_id === d.id))
    .map((d) => ({
      department: d,
      isHead: mine.some((m) => m.department_id === d.id && m.is_head),
      heads: members
        .filter((m) => m.department_id === d.id && m.is_head && m.profile_id !== personId)
        .map((m) => nameOf(m.profile_id))
        .filter((n): n is string => Boolean(n)),
    }));
}

/** Can the signed-in person record this member's journey? Asks the database, which decides. */
export async function canManageMember(memberId: string): Promise<boolean> {
  const { data } = await supabase.rpc("can_manage_member", { member: memberId });
  return data === true;
}
