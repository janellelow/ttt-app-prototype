import { useState } from "react";
import { Icon } from "../../components/Icon";
import { ErrorNote } from "../../components/ui";
import { errorText } from "../../lib/format";
import { loadRoleLabels, roleDescription, roleLabel } from "../../lib/labels";
import { supabase, unwrap } from "../../lib/supabase";
import { TAG_KIND_LABEL, type AgeGroup, type Role, type Tag, type TagKind } from "../../lib/types";
import { useConsoleAuth } from "../auth";
import { useTeam } from "../ConsoleApp";

type Section = "roles" | "levels" | "notes" | "access" | "groups";

/** What each access level can do. Renaming a level never changes this. */
const POWERS: Record<Role, string> = {
  trainee: "Their own journey, community, lessons, practice and feedback.",
  trainer: "Plus their own trainees' journeys, feedback and lessons. Can head a department.",
  admin: "Plus everyone's journeys and placement; adds people to departments.",
  head: "Plus roles, departments and their Heads, the roadmap, team setup, console access and the change log.",
};

/** Customise the team: serving roles, levels, private notes, access level names and age groups. */
export function TeamSetup() {
  const { isHead } = useConsoleAuth();
  const [section, setSection] = useState<Section>("roles");
  const tabs: { id: Section; label: string }[] = [
    { id: "roles", label: "Serving roles" },
    { id: "levels", label: "Levels" },
    { id: "notes", label: "Private notes" },
    ...(isHead ? [{ id: "access" as Section, label: "Access level names" }] : []),
    { id: "groups", label: "Age groups" },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">Team setup</h1>
          <p className="muted">Name things the way your worship team does. Changes show up in the Telegram app for everyone.</p>
        </div>
      </header>
      <div className="chips" role="tablist" aria-label="Setup sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={section === t.id} className={`chip${section === t.id ? " chip--active" : ""}`} onClick={() => setSection(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {section === "roles" ? (
        <TagList kind="instrument" intro="The positions people serve in, like Worship Leader, Vocalist, Drummer or Sound Engineer. People see their own serving roles on their Journey." />
      ) : null}
      {section === "levels" ? (
        <TagList kind="level" intro="How far along someone is, like Beginner or Advanced. People see their own level on their Journey." />
      ) : null}
      {section === "notes" ? (
        <TagList kind="general" intro="Tags only leaders see, like “Needs a mentor” or “Away until March”. Never shown to the person." />
      ) : null}
      {section === "access" && isHead ? <AccessLevels /> : null}
      {section === "groups" ? <AgeGroups /> : null}
    </div>
  );
}

function useAct() {
  const { reload } = useTeam();
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  return { error, act };
}

function TagList({ kind, intro }: { kind: TagKind; intro: string }) {
  const { team } = useTeam();
  const { error, act } = useAct();
  const [editing, setEditing] = useState<string | null>(null);
  const tags = team.tags.filter((t) => t.kind === kind).sort((a, b) => a.label.localeCompare(b.label));
  const usedBy = (id: string) => Object.values(team.tagsOf).filter((ids) => ids.includes(id)).length;
  const noun = TAG_KIND_LABEL[kind].toLowerCase();

  const save = (t: Tag | null, label: string, description: string, departmentId: string) =>
    act(async () => {
      const row = { label, description: description || null, department_id: kind === "instrument" ? departmentId || null : null };
      if (t) unwrap(await supabase.from("tags").update(row).eq("id", t.id));
      else unwrap(await supabase.from("tags").insert({ ...row, kind }));
      setEditing(null);
    });

  return (
    <section className="stack" style={{ gap: 12 }}>
      <p className="muted small" style={{ margin: 0, maxWidth: "70ch" }}>{intro}</p>
      <ErrorNote error={error} />
      <div className="setup-list">
        {tags.map((t) =>
          editing === t.id ? (
            <TagForm key={t.id} kind={kind} initial={t} onCancel={() => setEditing(null)} onSave={(l, d, dept) => save(t, l, d, dept)} />
          ) : (
            <div key={t.id} className="setup-row">
              <div className="stack grow" style={{ gap: 2 }}>
                <strong>{t.label}</strong>
                {t.description ? <span className="small muted">{t.description}</span> : null}
              </div>
              {kind === "instrument" ? (
                <span className="pill" style={{ visibility: t.department_id ? "visible" : "hidden" }}>
                  {team.departments.find((d) => d.id === t.department_id)?.name ?? "–"}
                </span>
              ) : null}
              <span className="tiny muted setup-row__count">{usedBy(t.id)} {usedBy(t.id) === 1 ? "person" : "people"}</span>
              <button className="icon-btn icon-btn--sm" aria-label={`Edit ${t.label}`} onClick={() => setEditing(t.id)}>
                <Icon name="edit" size={16} />
              </button>
              <button
                className="icon-btn icon-btn--sm"
                aria-label={`Delete ${t.label}`}
                onClick={() => {
                  const n = usedBy(t.id);
                  if (window.confirm(`Delete the ${noun} “${t.label}”?${n ? ` It will be taken off ${n} ${n === 1 ? "person" : "people"}.` : ""}`)) {
                    act(async () => unwrap(await supabase.from("tags").delete().eq("id", t.id)));
                  }
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ),
        )}
        {tags.length === 0 ? <div className="setup-row"><span className="muted small">No {noun}s yet.</span></div> : null}
      </div>
      {editing === "new" ? (
        <TagForm kind={kind} onCancel={() => setEditing(null)} onSave={(l, d, dept) => save(null, l, d, dept)} />
      ) : (
        <button className="btn btn--ghost" style={{ alignSelf: "flex-start" }} onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} /> Add a {noun}
        </button>
      )}
    </section>
  );
}

function TagForm({
  kind, initial, onSave, onCancel,
}: { kind: TagKind; initial?: Tag; onSave: (label: string, description: string, departmentId: string) => void; onCancel: () => void }) {
  const { team } = useTeam();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dept, setDept] = useState(initial?.department_id ?? "");
  const placeholder = { instrument: "e.g. Worship Leader", level: "e.g. Ready to lead", general: "e.g. Needs a mentor" }[kind];
  return (
    <form
      className="setup-row setup-row--form"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) onSave(label.trim(), description.trim(), dept);
      }}
    >
      <div className="form-grid grow">
        <div className="field">
          <label className="label" htmlFor="tf-label">{TAG_KIND_LABEL[kind]}</label>
          <input id="tf-label" className="input" maxLength={40} placeholder={placeholder} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label className="label" htmlFor="tf-desc">Description (optional)</label>
          <input id="tf-desc" className="input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {kind === "instrument" ? (
          <div className="field">
            <label className="label" htmlFor="tf-dept">Department (optional)</label>
            <select id="tf-dept" className="select" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">No department</option>
              {team.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="row" style={{ gap: 8, alignSelf: "flex-end" }}>
        <button type="submit" className="btn btn--dark btn--sm" disabled={!label.trim()}>Save</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function AccessLevels() {
  const { error, act } = useAct();
  const roles: Role[] = ["trainee", "trainer", "admin", "head"];
  return (
    <section className="stack" style={{ gap: 12 }}>
      <p className="muted small" style={{ margin: 0, maxWidth: "70ch" }}>
        Rename the four access levels to match your team, for example Trainee → Member or Trainer → Mentor. The new names
        appear everywhere, in both apps. Renaming never changes what a level can do.
      </p>
      <ErrorNote error={error} />
      <div className="setup-list">
        {roles.map((r) => (
          <AccessLevelRow
            key={r}
            role={r}
            onSave={(label, description) =>
              act(async () => {
                unwrap(await supabase.from("access_levels").update({ label, description: description || null, updated_at: new Date().toISOString() }).eq("role", r));
                await loadRoleLabels();
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function AccessLevelRow({ role, onSave }: { role: Role; onSave: (label: string, description: string) => Promise<boolean> }) {
  const [label, setLabel] = useState(roleLabel(role));
  const [description, setDescription] = useState(roleDescription(role));
  const [saved, setSaved] = useState(false);
  const dirty = label.trim() !== roleLabel(role) || description.trim() !== roleDescription(role);
  return (
    <form
      className="setup-row setup-row--form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (label.trim() && (await onSave(label.trim(), description.trim()))) setSaved(true);
      }}
    >
      <div className="form-grid form-grid--pair grow">
        <div className="field">
          <label className="label" htmlFor={`al-${role}`}>Name</label>
          <input id={`al-${role}`} className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`ad-${role}`}>Description</label>
          <input id={`ad-${role}`} className="input" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <span className="tiny muted" style={{ gridColumn: "1 / -1" }}>
          <strong>Can:</strong> {POWERS[role]}
        </span>
      </div>
      <div className="row" style={{ gap: 8, alignSelf: "flex-end" }}>
        {saved && !dirty ? <span className="small muted">Saved</span> : null}
        <button type="submit" className="btn btn--dark btn--sm" disabled={!label.trim() || !dirty}>Save</button>
      </div>
    </form>
  );
}

function AgeGroups() {
  const { team } = useTeam();
  const { error, act } = useAct();
  const [editing, setEditing] = useState<string | null>(null);
  const groups = [...team.groups].sort((a, b) => a.sort_order - b.sort_order);
  const peopleIn = (id: string) => team.people.filter((p) => p.age_group_id === id).length;

  const move = (i: number, dir: -1 | 1) =>
    act(async () => {
      const a = groups[i]!;
      const b = groups[i + dir]!;
      unwrap(await supabase.from("age_groups").update({ sort_order: b.sort_order }).eq("id", a.id));
      unwrap(await supabase.from("age_groups").update({ sort_order: a.sort_order }).eq("id", b.id));
    });

  const save = (g: AgeGroup | null, label: string) =>
    act(async () => {
      if (g) unwrap(await supabase.from("age_groups").update({ label }).eq("id", g.id));
      else unwrap(await supabase.from("age_groups").insert({ label, sort_order: Math.max(0, ...groups.map((x) => x.sort_order)) + 1 }));
      setEditing(null);
    });

  return (
    <section className="stack" style={{ gap: 12 }}>
      <p className="muted small" style={{ margin: 0, maxWidth: "70ch" }}>
        Each age group has its own Community feed. You can rename them anytime. A group can only be deleted once nobody
        is in it and it has no posts, so no one's posts are lost.
      </p>
      <ErrorNote error={error} />
      <div className="setup-list">
        {groups.map((g, i) =>
          editing === g.id ? (
            <LabelForm key={g.id} label="Age group" initial={g.label} onCancel={() => setEditing(null)} onSave={(l) => save(g, l)} />
          ) : (
            <div key={g.id} className="setup-row">
              <strong className="grow">{g.label}</strong>
              <span className="tiny muted setup-row__count">{peopleIn(g.id)} {peopleIn(g.id) === 1 ? "person" : "people"}</span>
              <button className="icon-btn icon-btn--sm" aria-label={`Move ${g.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}><Icon name="chevron" size={16} /></span>
              </button>
              <button className="icon-btn icon-btn--sm" aria-label={`Move ${g.label} down`} disabled={i === groups.length - 1} onClick={() => move(i, 1)}>
                <span style={{ transform: "rotate(90deg)", display: "inline-flex" }}><Icon name="chevron" size={16} /></span>
              </button>
              <button className="icon-btn icon-btn--sm" aria-label={`Rename ${g.label}`} onClick={() => setEditing(g.id)}>
                <Icon name="edit" size={16} />
              </button>
              <button
                className="icon-btn icon-btn--sm"
                aria-label={`Delete ${g.label}`}
                disabled={peopleIn(g.id) > 0}
                title={peopleIn(g.id) > 0 ? "Move everyone out of this group first" : undefined}
                onClick={() => {
                  if (window.confirm(`Delete the age group ${g.label}?`)) act(async () => unwrap(await supabase.from("age_groups").delete().eq("id", g.id)));
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ),
        )}
      </div>
      {editing === "new" ? (
        <LabelForm label="Age group" initial="" onCancel={() => setEditing(null)} onSave={(l) => save(null, l)} />
      ) : (
        <button className="btn btn--ghost" style={{ alignSelf: "flex-start" }} onClick={() => setEditing("new")}>
          <Icon name="plus" size={16} /> Add an age group
        </button>
      )}
    </section>
  );
}

function LabelForm({ label, initial, onSave, onCancel }: { label: string; initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="setup-row setup-row--form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
      }}
    >
      <div className="field grow">
        <label className="label" htmlFor="lf-value">{label}</label>
        <input id="lf-value" className="input" maxLength={40} placeholder="e.g. 41+" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <div className="row" style={{ gap: 8, alignSelf: "flex-end" }}>
        <button type="submit" className="btn btn--dark btn--sm" disabled={!value.trim()}>Save</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
