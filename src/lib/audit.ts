// Turns change log rows into sentences. Used by the mini app and the web console.

export interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** "Marcus Lee signed off a roadmap step for Sofia Lim: First Sunday" */
export function describeAudit(r: AuditRow, name: (id: string | null) => string): string {
  const who = name(r.actor_id);
  const whom = name(r.target_id);
  const d = r.details ?? {};
  const step = typeof d.step === "string" ? d.step : null;
  const title = typeof d.title === "string" ? d.title : null;
  const dept = typeof d.department === "string" ? d.department : "a department";
  switch (r.action) {
    case "assign_member":
      return `${who} updated ${whom}'s placement`;
    case "roadmap_step_updated":
      return `${who} ${d.status === "done" ? "signed off" : "marked in progress"} "${step ?? "a step"}" for ${whom}`;
    case "roadmap_step_cleared":
      return `${who} cleared "${step ?? "a step"}" for ${whom}`;
    case "accomplishment_added":
      return `${who} recorded "${title ?? "an accomplishment"}" for ${whom}`;
    case "accomplishment_edited":
      return `${who} edited "${title ?? "an accomplishment"}" for ${whom}`;
    case "accomplishment_removed":
      return `${who} removed "${title ?? "an accomplishment"}" from ${whom}`;
    case "console_access_granted":
      return `${who} gave ${whom} web console access`;
    case "console_access_revoked":
      return `${who} removed ${whom}'s web console access`;
    case "department_member_added":
      return `${who} added ${whom} to ${dept}${d.is_head ? " as Head" : ""}`;
    case "department_member_removed":
      return `${who} took ${whom} out of ${dept}`;
    case "department_head_changed":
      return d.is_head ? `${who} made ${whom} Head of ${dept}` : `${who} removed ${whom} as Head of ${dept}`;
    case "setup_changed":
      return `${who} ${typeof d.op === "string" ? d.op : "changed"} the ${typeof d.area === "string" ? d.area : "setting"} "${typeof d.name === "string" ? d.name : ""}"`;
    default:
      return `${who} updated ${whom}`;
  }
}
