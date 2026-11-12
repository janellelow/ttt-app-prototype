import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { AccomplishmentSheet, AddStepSheet, StepSheet } from "../../components/JourneySheets";
import { Roadmap } from "../../components/Roadmap";
import { Avatar, ErrorNote, RoleBadge } from "../../components/ui";
import { errorText, timeAgo } from "../../lib/format";
import { formatDay, removeAccomplishment } from "../../lib/journey";
import { supabase } from "../../lib/supabase";
import { firstName, type Profile, type Role, type RoadmapStep } from "../../lib/types";
import { useConsoleAuth, useLeader } from "../auth";
import { useTeam } from "../ConsoleApp";
import { journeyOf, namesOf } from "../data";

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
        <p className="muted">This person isn't on your list. Trainers see their own trainees and people nobody has placed yet.</p>
      </div>
    );
  }

  const journey = journeyOf(team, person.id);
  const first = firstName(person.display_name);
  // Mirrors can_manage_member() in the database, which has the final say.
  const canManage = isHead || (person.id !== me.id && (isAdmin || person.trainer_id === me.id));
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
  const [trainerId, setTrainerId] = useState(person.trainer_id ?? (isAdmin ? "" : me.id));
  const [selected, setSelected] = useState<string[]>(team.tagsOf[person.id] ?? []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit =
    isHead ||
    (isAdmin && person.role !== "head") ||
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
              <option value="trainee">Trainee</option>
              <option value="trainer">Trainer</option>
              <option value="admin">Admin</option>
              <option value="head">Head of Department</option>
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
          <label className="label" htmlFor="pl-trainer">Trainer</label>
          {isAdmin ? (
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
      <div className="field">
        <span className="label" id="pl-tags">Serving areas and tags</span>
        <div className="row row--wrap" style={{ gap: 6 }} role="group" aria-labelledby="pl-tags">
          {team.tags.map((t) => (
            <button
              key={t.id}
              className={`chip chip--sm${selected.includes(t.id) ? " chip--sage" : ""}`}
              style={selected.includes(t.id) ? undefined : { border: "1px solid var(--line-2)" }}
              aria-pressed={selected.includes(t.id)}
              onClick={() => toggle(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
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
