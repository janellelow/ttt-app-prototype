import { useState } from "react";
import { errorText } from "../lib/format";
import {
  addAccomplishment,
  addPersonalStep,
  saveMyStory,
  saveStep,
  today,
  type Journey,
} from "../lib/journey";
import { haptic } from "../lib/telegram";
import type { Profile, RoadmapStep, StepStatus } from "../lib/types";
import { ErrorNote, Sheet } from "./ui";

// Forms for writing your own story and for leaders recording someone's
// journey. Used by the mini app's Journey screen and the web console.

function useSave(onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      haptic("success");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function StorySheet({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [vision, setVision] = useState(profile.vision ?? "");
  const [growing, setGrowing] = useState(profile.growing_in ?? "");
  const { busy, error, run } = useSave(onSaved);
  return (
    <Sheet title="About you" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="st-vision">Dreams &amp; vision</label>
        <textarea
          id="st-vision"
          className="textarea"
          maxLength={1500}
          placeholder="What do you dream of doing on the worship team? Where do you see yourself in a few years?"
          value={vision}
          onChange={(e) => setVision(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="st-growing">I want to grow in</label>
        <textarea
          id="st-growing"
          className="textarea"
          maxLength={1500}
          placeholder="Skills, character, anything. Your trainer reads this to help you grow."
          value={growing}
          onChange={(e) => setGrowing(e.target.value)}
        />
      </div>
      <p className="tiny muted">Seen by you, your trainer and your Heads of Department.</p>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy} onClick={() => run(() => saveMyStory(profile.id, vision, growing))}>
        {busy ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}

const STATUS_OPTIONS: { value: StepStatus | null; label: string }[] = [
  { value: null, label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Signed off" },
];

export function StepSheet({
  memberId, first, step, current, onClose, onSaved,
}: {
  memberId: string;
  first: string;
  step: RoadmapStep;
  current: Journey["progress"][string] | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<StepStatus | null>(current?.status ?? null);
  const [doneOn, setDoneOn] = useState(current?.done_on ?? today());
  const [note, setNote] = useState(current?.note ?? "");
  const { busy, error, run } = useSave(onSaved);
  return (
    <Sheet title={step.title} onClose={onClose}>
      {step.description ? <p className="body">{step.description}</p> : null}
      <div className="field">
        <span className="label" id="ss-status">Where {first} is</span>
        <div className="row row--wrap" style={{ gap: 6 }} role="radiogroup" aria-labelledby="ss-status">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={status === o.value}
              className={`chip chip--sm${status === o.value ? " chip--sage" : ""}`}
              style={status === o.value ? undefined : { border: "1px solid var(--line-2)" }}
              onClick={() => setStatus(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {status === "done" ? (
        <div className="field">
          <label className="label" htmlFor="ss-date">Signed off on</label>
          <input id="ss-date" type="date" className="input" value={doneOn} max={today()} onChange={(e) => setDoneOn(e.target.value)} />
        </div>
      ) : null}
      {status ? (
        <div className="field">
          <label className="label" htmlFor="ss-note">Note for {first} (optional)</label>
          <textarea id="ss-note" className="textarea" maxLength={600} placeholder="What went well, what to work on next" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : null}
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy} onClick={() => run(() => saveStep(memberId, step.id, status, note, doneOn))}>
        {busy ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}

export function AddStepSheet({
  memberId, first, position, onClose, onSaved,
}: { memberId: string; first: string; position: number; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { busy, error, run } = useSave(onSaved);
  return (
    <Sheet title={`A step for ${first}`} onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="as-title">Step</label>
        <input id="as-title" className="input" maxLength={80} placeholder="e.g. Lead the band through a full set" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="as-desc">What it involves (optional)</label>
        <textarea id="as-desc" className="textarea" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <p className="tiny muted">Only {first} and their leaders see this step.</p>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim()} onClick={() => run(() => addPersonalStep(memberId, title, description, position))}>
        {busy ? "Adding…" : "Add step"}
      </button>
    </Sheet>
  );
}

export function AccomplishmentSheet({
  memberId, first, onClose, onSaved,
}: { memberId: string; first: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(today());
  const [note, setNote] = useState("");
  const { busy, error, run } = useSave(onSaved);
  return (
    <Sheet title={`Record for ${first}`} onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="ac-title">Accomplishment</label>
        <input id="ac-title" className="input" maxLength={120} placeholder="e.g. Played keys for the Easter service" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="ac-day">When</label>
        <input id="ac-day" type="date" className="input" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="ac-note">A few words (optional)</label>
        <textarea id="ac-note" className="textarea" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim()} onClick={() => run(() => addAccomplishment(memberId, title, note, day))}>
        {busy ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}
