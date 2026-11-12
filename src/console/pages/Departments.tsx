import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Avatar, ErrorNote } from "../../components/ui";
import { errorText } from "../../lib/format";
import { roleLabel } from "../../lib/labels";
import { supabase, unwrap } from "../../lib/supabase";
import type { Department } from "../../lib/types";
import { useConsoleAuth } from "../auth";
import { useTeam } from "../ConsoleApp";

/**
 * Departments of the worship team. The overall Head creates them and appoints
 * department Heads; admins put people in them. Department Heads look after
 * the trainees and trainers in their department.
 */
export function Departments() {
  const { isAdmin, isHead } = useConsoleAuth();
  const { team, reload } = useTeam();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const person = (id: string) => team.people.find((p) => p.id === id);
  const leader = (id: string) => person(id) ?? team.leaders.find((l) => l.id === id);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">Departments</h1>
          <p className="muted">
            Each department can have its own Heads, who look after the {roleLabel("trainee").toLowerCase()}s and{" "}
            {roleLabel("trainer").toLowerCase()}s in it: their journeys, sign-offs and placement.{" "}
            {isHead
              ? `Only people at the ${roleLabel("head")} level create departments and appoint their Heads; admins can add and remove members.`
              : isAdmin
                ? `You can add and remove members. Only a ${roleLabel("head")} creates departments and appoints their Heads.`
                : "These are the departments you're a Head of."}
          </p>
        </div>
      </header>
      <ErrorNote error={error} />

      {isHead ? (
        editing === "new" ? (
          <DepartmentForm
            onCancel={() => setEditing(null)}
            onSave={(name, description) =>
              act(async () => {
                const sort = Math.max(0, ...team.departments.map((d) => d.sort_order)) + 1;
                unwrap(await supabase.from("departments").insert({ name, description: description || null, sort_order: sort }));
                setEditing(null);
              })
            }
          />
        ) : (
          <button className="btn btn--primary" style={{ alignSelf: "flex-start" }} onClick={() => setEditing("new")}>
            <Icon name="plus" size={16} /> New department
          </button>
        )
      ) : null}

      {team.departments.length === 0 ? (
        <div className="panel">
          <p className="muted">
            {isHead
              ? "No departments yet. Create the first one, for example Band, Vocals, Production or Media."
              : "There are no departments to show yet."}
          </p>
        </div>
      ) : (
        <div className="dept-grid">
          {team.departments.map((d) => {
            const rows = team.deptMembers.filter((m) => m.department_id === d.id);
            const heads = rows.filter((m) => m.is_head);
            const members = rows.filter((m) => !m.is_head);
            const roles = team.tags.filter((t) => t.department_id === d.id && t.kind === "instrument");
            const candidates = team.people.filter((p) => !rows.some((r) => r.profile_id === p.id));
            return editing === d.id ? (
              <DepartmentForm
                key={d.id}
                initial={d}
                onCancel={() => setEditing(null)}
                onSave={(name, description) =>
                  act(async () => {
                    unwrap(await supabase.from("departments").update({ name, description: description || null }).eq("id", d.id));
                    setEditing(null);
                  })
                }
              />
            ) : (
              <section key={d.id} className="panel dept">
                <div className="panel__head">
                  <div className="stack" style={{ gap: 2 }}>
                    <h2 className="h3">{d.name}</h2>
                    {d.description ? <span className="small muted">{d.description}</span> : null}
                  </div>
                  {isHead ? (
                    <div className="row" style={{ gap: 4 }}>
                      <button className="icon-btn icon-btn--sm" aria-label={`Edit ${d.name}`} onClick={() => setEditing(d.id)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="icon-btn icon-btn--sm"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete the ${d.name} department? Its ${rows.length} members stay on the team.`)) {
                            act(async () => unwrap(await supabase.from("departments").delete().eq("id", d.id)));
                          }
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">Heads</span>
                  {heads.length === 0 ? <span className="small muted">No Head yet.</span> : null}
                  {heads.map((h) => (
                    <MemberRow
                      key={h.profile_id}
                      id={h.profile_id}
                      name={leader(h.profile_id)?.display_name ?? "Someone"}
                      photo={leader(h.profile_id)?.photo_url ?? null}
                      sub={`Head of ${d.name}`}
                      actions={
                        isHead ? (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() =>
                              act(async () =>
                                unwrap(await supabase.from("department_members").update({ is_head: false }).eq("department_id", d.id).eq("profile_id", h.profile_id)),
                              )
                            }
                          >
                            Stop being Head
                          </button>
                        ) : null
                      }
                    />
                  ))}
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">Members · {members.length}</span>
                  {members.map((m) => {
                    const p = person(m.profile_id);
                    const canLead = p && p.role !== "trainee";
                    return (
                      <MemberRow
                        key={m.profile_id}
                        id={m.profile_id}
                        name={p?.display_name ?? "Someone"}
                        photo={p?.photo_url ?? null}
                        sub={p ? roleLabel(p.role) : ""}
                        actions={
                          <>
                            {isHead && canLead ? (
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() =>
                                  act(async () =>
                                    unwrap(await supabase.from("department_members").update({ is_head: true }).eq("department_id", d.id).eq("profile_id", m.profile_id)),
                                  )
                                }
                              >
                                Make Head
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                className="icon-btn icon-btn--sm"
                                aria-label={`Remove ${p?.display_name ?? "member"} from ${d.name}`}
                                onClick={() =>
                                  act(async () =>
                                    unwrap(await supabase.from("department_members").delete().eq("department_id", d.id).eq("profile_id", m.profile_id)),
                                  )
                                }
                              >
                                <Icon name="close" size={14} />
                              </button>
                            ) : null}
                          </>
                        }
                      />
                    );
                  })}
                </div>

                {isAdmin ? (
                  <AddMember
                    departmentName={d.name}
                    candidates={candidates.map((p) => ({ id: p.id, label: `${p.display_name} · ${roleLabel(p.role)}` }))}
                    onAdd={(profileId) =>
                      act(async () => unwrap(await supabase.from("department_members").insert({ department_id: d.id, profile_id: profileId })))
                    }
                  />
                ) : null}

                {roles.length ? (
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    <span className="tiny muted">Serving roles:</span>
                    {roles.map((r) => (
                      <span key={r.id} className="pill">{r.label}</span>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberRow({ id, name, photo, sub, actions }: { id: string; name: string; photo: string | null; sub: string; actions: ReactNode }) {
  return (
    <div className="member-row">
      <Link to={`/people/${id}`} className="row grow" style={{ gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
        <Avatar name={name} photo={photo} />
        <span className="stack" style={{ gap: 0, minWidth: 0 }}>
          <strong className="small">{name}</strong>
          <span className="tiny muted">{sub}</span>
        </span>
      </Link>
      <div className="row" style={{ gap: 6 }}>{actions}</div>
    </div>
  );
}

function AddMember({
  departmentName, candidates, onAdd,
}: { departmentName: string; candidates: { id: string; label: string }[]; onAdd: (id: string) => void }) {
  const [id, setId] = useState("");
  const selectId = `add-${departmentName.replace(/\W+/g, "-")}`;
  return (
    <form
      className="row"
      style={{ gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (id) onAdd(id);
        setId("");
      }}
    >
      <label className="sr-only" htmlFor={selectId}>Add someone to {departmentName}</label>
      <select id={selectId} className="select grow" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Add someone to {departmentName}…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <button type="submit" className="btn btn--dark btn--sm" disabled={!id}>Add</button>
    </form>
  );
}

function DepartmentForm({
  initial, onSave, onCancel,
}: { initial?: Department; onSave: (name: string, description: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <form
      className="panel step-card--form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim(), description.trim());
      }}
    >
      <div className="field">
        <label className="label" htmlFor="df-name">Department</label>
        <input id="df-name" className="input" maxLength={40} placeholder="e.g. Production" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label className="label" htmlFor="df-desc">What it does (optional)</label>
        <input id="df-desc" className="input" maxLength={300} placeholder="e.g. Sound, lights and live stream" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn--dark btn--sm" disabled={!name.trim()}>Save</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
