import { formatDay, stepStates, type Journey } from "../lib/journey";
import type { Member, RoadmapStep } from "../lib/types";
import { Icon } from "./Icon";

/**
 * The worship team road: signed-off steps, where someone is now, what's
 * ahead, and a trail that keeps going past the last mapped step.
 */
export function Roadmap({
  journey,
  names,
  self,
  onStep,
  onAddStep,
  beyond,
}: {
  journey: Journey;
  names: Record<string, Member>;
  /** Viewing your own road ("You are here") rather than someone else's. */
  self: boolean;
  /** Leaders: open a step to sign it off. */
  onStep?: (step: RoadmapStep) => void;
  /** Leaders: add a step just for this person. */
  onAddStep?: () => void;
  beyond: string;
}) {
  const states = stepStates(journey);

  return (
    <ol className="road" aria-label="Roadmap">
      {journey.steps.map((s) => {
        const state = states[s.id]!;
        const p = journey.progress[s.id];
        const by = p?.updated_by ? names[p.updated_by]?.display_name : undefined;
        const inner = (
          <>
            <span className="road__dot" aria-hidden="true">
              {state === "done" ? <Icon name="check" size={15} /> : null}
            </span>
            <span className="road__body">
              <span className="road__title">
                {s.title}
                {s.profile_id ? <span className="road__personal">Personal step</span> : null}
              </span>
              {state === "current" ? (
                <span className="road__here">{self ? "You are here" : "In progress"}</span>
              ) : state === "next" ? (
                <span className="road__here road__here--next">Next up</span>
              ) : null}
              {s.description && state !== "done" ? <span className="road__desc">{s.description}</span> : null}
              {state === "done" ? (
                <span className="road__meta">
                  Signed off {formatDay(p?.done_on)}
                  {by ? ` by ${by}` : ""}
                </span>
              ) : null}
              {p?.note ? <span className="road__note">{p.note}</span> : null}
            </span>
            {onStep ? <Icon name="chevron" size={16} /> : null}
          </>
        );
        return (
          <li key={s.id} className={`road__step road__step--${state}`}>
            {onStep ? (
              <button className="road__hit" onClick={() => onStep(s)} aria-label={`${s.title}: update`}>
                {inner}
              </button>
            ) : (
              <div className="road__hit">{inner}</div>
            )}
          </li>
        );
      })}

      {onAddStep ? (
        <li className="road__step road__step--add">
          <button className="road__hit" onClick={onAddStep}>
            <span className="road__dot" aria-hidden="true">
              <Icon name="plus" size={14} />
            </span>
            <span className="road__body">
              <span className="road__title">Add a personal step</span>
            </span>
          </button>
        </li>
      ) : null}

      <li className="road__beyond">
        <span className="road__ghost" aria-hidden="true" />
        <span className="road__ghost" aria-hidden="true" />
        <span className="road__ghost" aria-hidden="true" />
        <p className="road__beyond-text">{beyond}</p>
      </li>
    </ol>
  );
}
