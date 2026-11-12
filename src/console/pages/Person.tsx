import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { AccomplishmentSheet, AddStepSheet, StepSheet } from "../../components/JourneySheets";
import { Roadmap } from "../../components/Roadmap";
import { Avatar, ErrorNote, RoleBadge } from "../../components/ui";
import { errorText, timeAgo } from "../../lib/format";
import { formatDay, removeAccomplishment } from "../../lib/journey";
import { roleLabel } from "../../lib/labels";
import { supabase, unwrap } from "../../lib/supabase";
import { firstName, TAG_KIND_LABEL, type Profile, type Role, type RoadmapStep, type TagKind } from "../../lib/types";
import { useConsoleAuth, useLeader } from "../auth";
import { useTeam } from "../ConsoleApp";
import { departmentsOf, headedBy, journeyOf, namesOf, type Team } from "../data";

export function Person() {
  const me = useLeader();
  const { isAdmin, isHead } = useConsoleAuth();
  const { team, reload } = useTeam();
  const { personId } = useParams();
  const person = team.people.find((p) => p.id === personId);
  const names = useMemo(() => namesOf(team), [team]);
  const [sheet, setSheet] = useState<{ kind: "step"; step: RoadmapStep } | { kind: "add-step" } | { kind: "win" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!person) {
    return (
      <div className="page">
        <Link to="/people" className="back-link">← People</Link>
        <p className="muted">
          This person isn't on your list. Trainers see their own trainees, their department (if they head one) and people
          nobody has placed yet.
        </p>
      </div>
    );
  }

  const journey = journeyOf(team, person.id);
  const first = firstName(person.display_name);
  // Mirrors can_manage_member() in the database, which has the final say.
  const canManage = isHead || (person.id !== me.id && (isAdmin || person.trainer_id === me.id || leadsMember(team, me.id, person)));
  const done = () => {
    setSheet(null);
    reload();
  };

  return (
    <div className="page">
      <Link to="/people" className="back-link">← People</Link>
      <header className="person-head">
        <Avatar name={person.display_name} photo={person.photo_url} large />
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="h1">
            {person.display_name}
            <RoleBadge role={person.role} />
          </h1>
          <span className="muted small">
            {person.username ? `@${person.username} · ` : ""}Joined {timeAgo(person.created_at)}
          </span>
        </div>
      </header>

      <div className="split split--person">
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel">
            <h2 className="h3">About {first}</h2>
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Dreams &amp; vision</span>
              <p className={`body${person.vision ? "" : " muted"}`}>{person.vision ?? `${first} hasn't written this yet.`}</p>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">I want to grow in</span>
              <p className={`body${person.growing_in ? "" : " muted"}`}>{person.growing_in ?? `${first} hasn't written this yet.`}</p>
            </div>
            <span className="tiny muted">
              Written by {first} in the app{person.profile_updated_at ? `, updated ${timeAgo(person.profile_updated_at)}` : ""}. Only they can change it.
            </span>
          </section>

          <DepartmentsPanel person={person} />
          <Placement person={person} onSaved={reload} />
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <section className="panel">
            <div className="panel__head">
              <h2 className="h3">Roadmap</h2>
              {canManage ? <span className="tiny muted">Click a step to sign it off</span> : null}
            </div>
            <Roadmap
              journey={journey}
              names={names}
              self={false}
              onStep={canManage ? (step) => setSheet({ kind: "step", step }) : undefined}
              onAddStep={canManage ? () => setSheet({ kind: "add-step" }) : undefined}
              beyond={`The road keeps going. Add personal steps as ${first} grows.`}
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="h3">Accomplishments</h2>
              {canManage ? (
                <button className="btn btn--primary btn--sm" onClick={() => setSheet({ kind: "win" })}>
                  <Icon name="plus" size={14} /> Record
                </button>
              ) : null}
            </div>
            <ErrorNote error={error} />
            {journey.accomplishments.length === 0 ? (
              <p className="muted small">Nothing recorded yet.</p>
            ) : (
              <ul className="feed">
                {journey.accomplishments.map((a) => (
                  <li key={a.id} className="feed__item">
                    <span className="win-icon" aria-hidden="true"><Icon name="flag" size={16} /></span>
                    <span className="stack grow" style={{ gap: 2 }}>
                      <strong className="small">{a.title}</strong>
                      <span className="tiny muted">
                        {formatDay(a.achieved_on)}
                        {a.created_by && names[a.created_by] ? ` · recorded by ${names[a.created_by]!.display_name}` : ""}
                      </span>
                      {a.note ? <span className="small" style={{ color: "var(--ink-2)" }}>{a.note}</span> : null}
                    </span>
                    {canManage ? (
                      <button
                        className="icon-btn icon-btn--sm"
                        aria-label={`Remove ${a.title}`}
                        onClick={async () => {
                          if (!window.confirm(`Remove "${a.title}"?`)) return;
                          try {
                            await removeAccomplishment(a.id);
                            await reload();
                          } catch (e) {
                            setError(errorText(e));
                          }
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {sheet?.kind === "step" ? (
        <StepSheet memberId={person.id} first={first} step={sheet.step} current={journey.progress[sheet.step.id]} onClose={() => setSheet(null)} onSaved={done} />
      ) : null}
      {sheet?.kind === "add-step" ? (
        <AddStepSheet
          memberId={person.id}
          first={first}
          position={Math.max(0, ...journey.steps.map((s) => s.position)) + 1}
          onClose={() => setSheet(null)}
          onSaved={done}
        />
      ) : null}
      {sheet?.kind === "win" ? <AccomplishmentSheet memberId={person.id} first={first} onClose={() => setSheet(null)} onSaved={done} /> : null}
    </div>
  );
}

/** Age group, trainer, tags and (for Heads) role. Saved through assign_member(), which is logged. */
function Placement({ person, onSaved }: { person: Profile; onSaved: () => Promise<void> }) {
  const me = useLeader();
  const { isAdmin, isHead } = useConsoleAuth();
  const { team } = useTeam();
  const [role, setRole] = useState<Role>(person.role);
  const [groupId, setGroupId] = useState(person.age_group_id ?? "");
  const [trainerId, setTrainerId] = useState(
    person.trainer_id ?? (isAdmin || leadsMember(team, me.id, person) ? "" : me.id),
  );
  const [selected, setSelected] = useState<string[]>(team.tagsOf[person.id] ?? []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leads = leadsMember(team, me.id, person);
  const canEdit =
    isHead ||
    (isAdmin && person.role !== "head") ||
    leads ||
    (person.role === "trainee" && (!person.age_group_id || person.trainer_id === me.id));
  if (!canEdit) return null;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { error } = await supabase.rpc("assign_member", {
        p_member: person.id,
        p_age_group: groupId || null,
        p_trainer: trainerId || null,
        p_tag_ids: selected,
        p_role: isHead ? role : null,
      });
      if (error) throw new Error(error.message);
      setSaved(true);
      await onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="h3">Placement</h2>
      <div className="form-grid">
        {isHead ? (
          <div className="field">
            <label className="label" htmlFor="pl-role">Role</label>
            <select id="pl-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(["trainee", "trainer", "admin", "head"] as Role[]).map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="pl-group">Age group</label>
          <select id="pl-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Not placed yet</option>
            {team.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="pl-trainer">{roleLabel("trainer")}</label>
          {isAdmin || leads ? (
            <select id="pl-trainer" className="select" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">No trainer</option>
              {team.leaders.filter((l) => l.id !== person.id).map((l) => (
                <option key={l.id} value={l.id}>{l.display_name}</option>
              ))}
            </select>
          ) : (
            <span className="body">You</span>
          )}
        </div>
      </div>
      {(["instrument", "level", "general"] as TagKind[]).map((kind) => {
        const tags = team.tags.filter((t) => t.kind === kind);
        if (!tags.length) return null;
        return (
          <div className="field" key={kind}>
            <span className="label" id={`pl-tags-${kind}`}>
              {TAG_KIND_LABEL[kind]}s{kind === "general" ? " (only leaders see these)" : ""}
            </span>
            <div className="row row--wrap" style={{ gap: 6 }} role="group" aria-labelledby={`pl-tags-${kind}`}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`chip chip--sm${selected.includes(t.id) ? " chip--sage" : ""}`}
                  style={selected.includes(t.id) ? undefined : { border: "1px solid var(--line-2)" }}
                  aria-pressed={selected.includes(t.id)}
                  title={t.description ?? undefined}
                  onClick={() => toggle(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <ErrorNote error={error} />
      <div className="row" style={{ gap: 12 }}>
        <button className="btn btn--dark btn--sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save placement"}
        </button>
        {saved ? <span className="small muted">Saved and logged.</span> : null}
      </div>
    </section>
  );
}

/** A department Head looks after the trainees and trainers in their department (see leads_member()). */
function leadsMember(team: Team, leaderId: string, person: Profile): boolean {
  if (person.id === leaderId || (person.role !== "trainee" && person.role !== "trainer")) return false;
  const mine = headedBy(team, leaderId);
  return departmentsOf(team, person.id).some((d) => mine.includes(d.department.id));
}

/** Which departments someone is in. Admins and Heads change it; only Heads appoint department Heads. */
function DepartmentsPanel({ person }: { person: Profile }) {
  const { isAdmin, isHead } = useConsoleAuth();
  const { team, reload } = useTeam();
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = departmentsOf(team, person.id);
  const others = team.departments.filter((d) => !current.some((c) => c.department.id === d.id));
  const canLead = person.role !== "trainee";

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (!current.length && !isAdmin) return null;

  return (
    <section className="panel">
      <h2 className="h3">Departments</h2>
      {current.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Not in a department yet.</p> : null}
      {current.map(({ department, isHead: heads }) => (
        <div key={department.id} className="member-row">
          <span className="row" style={{ gap: 8 }}>
            <span className="pill dept-chip">{department.name}</span>
            {heads ? <span className="small">Head of {department.name}</span> : null}
          </span>
          <span className="row" style={{ gap: 6 }}>
            {isHead && (heads || canLead) ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  act(async () =>
                    unwrap(await supabase.from("department_members").update({ is_head: !heads }).eq("department_id", department.id).eq("profile_id", person.id)),
                  )
                }
              >
                {heads ? "Stop being Head" : "Make Head"}
              </button>
            ) : null}
            {isAdmin && (!heads || isHead) ? (
              <button
                className="icon-btn icon-btn--sm"
                aria-label={`Take ${person.display_name} out of ${department.name}`}
                onClick={() =>
                  act(async () => unwrap(await supabase.from("department_members").delete().eq("department_id", department.id).eq("profile_id", person.id)))
                }
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </span>
        </div>
      ))}
      {isAdmin && others.length ? (
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding) return;
            act(async () => unwrap(await supabase.from("department_members").insert({ department_id: adding, profile_id: person.id })));
            setAdding("");
          }}
        >
          <label className="sr-only" htmlFor="dp-add">Add to a department</label>
          <select id="dp-add" className="select grow" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add to a department…</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button type="submit" className="btn btn--dark btn--sm" disabled={!adding}>Add</button>
        </form>
      ) : null}
      <ErrorNote error={error} />
    </section>
  );
}
