import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Roadmap } from "../../components/Roadmap";
import { ErrorNote } from "../../components/ui";
import { errorText } from "../../lib/format";
import { supabase, unwrap } from "../../lib/supabase";
import type { RoadmapStep } from "../../lib/types";
import { useConsoleAuth } from "../auth";
import { useTeam } from "../ConsoleApp";

/** The general roadmap everyone walks. Heads edit it; others can read it. */
export function RoadmapEditor() {
  const { isHead } = useConsoleAuth();
  const { team, reload } = useTeam();
  const steps = team.steps.filter((s) => s.profile_id === null).sort((a, b) => a.position - b.position);
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

  const move = (i: number, dir: -1 | 1) =>
    act(async () => {
      const a = steps[i]!;
      const b = steps[i + dir]!;
      unwrap(await supabase.from("roadmap_steps").update({ position: b.position }).eq("id", a.id));
      unwrap(await supabase.from("roadmap_steps").update({ position: a.position }).eq("id", b.id));
    });

  const remove = (s: RoadmapStep) => {
    const signed = team.progress.filter((p) => p.step_id === s.id).length;
    const warning = signed ? ` ${signed} ${signed === 1 ? "person has" : "people have"} progress on it, which will be removed too.` : "";
    if (!window.confirm(`Remove “${s.title}” from the roadmap?${warning}`)) return;
    act(async () => unwrap(await supabase.from("roadmap_steps").delete().eq("id", s.id)));
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">General roadmap</h1>
          <p className="muted">
            The steps everyone on the worship team walks. Personal steps for one person are added on their page.
            {isHead ? "" : " Only Heads of Department can change these."}
          </p>
        </div>
      </header>
      <ErrorNote error={error} />

      <div className="split split--roadmap">
        <section className="stack" style={{ gap: 10 }}>
          {steps.map((s, i) =>
            editing === s.id ? (
              <StepForm
                key={s.id}
                initial={s}
                onCancel={() => setEditing(null)}
                onSave={(title, description) =>
                  act(async () => {
                    unwrap(await supabase.from("roadmap_steps").update({ title, description: description || null }).eq("id", s.id));
                    setEditing(null);
                  })
                }
              />
            ) : (
              <article key={s.id} className="step-card">
                <span className="step-card__num">{i + 1}</span>
                <div className="stack grow" style={{ gap: 4 }}>
                  <strong>{s.title}</strong>
                  {s.description ? <span className="small muted">{s.description}</span> : null}
                  <span className="tiny muted">
                    {team.progress.filter((p) => p.step_id === s.id && p.status === "done").length} signed off ·{" "}
                    {team.progress.filter((p) => p.step_id === s.id && p.status === "in_progress").length} in progress
                  </span>
                </div>
                {isHead ? (
                  <div className="step-card__tools">
                    <button className="icon-btn icon-btn--sm" aria-label={`Move ${s.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}><Icon name="chevron" size={16} /></span>
                    </button>
                    <button className="icon-btn icon-btn--sm" aria-label={`Move ${s.title} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                      <span style={{ transform: "rotate(90deg)", display: "inline-flex" }}><Icon name="chevron" size={16} /></span>
                    </button>
                    <button className="icon-btn icon-btn--sm" aria-label={`Edit ${s.title}`} onClick={() => setEditing(s.id)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn icon-btn--sm" aria-label={`Remove ${s.title}`} onClick={() => remove(s)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ) : null}
              </article>
            ),
          )}
          {isHead ? (
            editing === "new" ? (
              <StepForm
                onCancel={() => setEditing(null)}
                onSave={(title, description) =>
                  act(async () => {
                    const position = Math.max(0, ...steps.map((s) => s.position)) + 1;
                    unwrap(await supabase.from("roadmap_steps").insert({ title, description: description || null, position }));
                    setEditing(null);
                  })
                }
              />
            ) : (
              <button className="btn btn--ghost btn--block" onClick={() => setEditing("new")}>
                <Icon name="plus" size={16} /> Add a step
              </button>
            )
          ) : null}
        </section>

        <aside className="panel preview-phone" aria-label="How it looks in the app">
          <span className="eyebrow">How it looks in the app</span>
          <Roadmap
            journey={{ steps, progress: {}, accomplishments: [] }}
            names={{}}
            self
            beyond="The road keeps going. Your Head of Department will map out the next steps with you."
          />
        </aside>
      </div>
    </div>
  );
}

function StepForm({
  initial, onSave, onCancel,
}: { initial?: RoadmapStep; onSave: (title: string, description: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <form
      className="step-card step-card--form"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave(title.trim(), description.trim());
      }}
    >
      <div className="stack grow" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="sf-title">Step</label>
        <input id="sf-title" className="input" maxLength={80} placeholder="Step, e.g. Lead a rehearsal" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <label className="sr-only" htmlFor="sf-desc">What it involves</label>
        <textarea id="sf-desc" className="textarea" maxLength={600} placeholder="What it involves" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn--dark btn--sm" disabled={!title.trim()}>Save step</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}
