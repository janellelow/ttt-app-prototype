import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AccomplishmentSheet, AddStepSheet, StepSheet, StorySheet } from "../components/JourneySheets";
import { Roadmap } from "../components/Roadmap";
import { Avatar, ErrorNote, RoleBadge, Spinner } from "../components/ui";
import { useAuth, useMe } from "../lib/auth";
import { errorText } from "../lib/format";
import {
  fetchJourney,
  focusStep,
  formatDay,
  removeAccomplishment,
  stepStates,
  type Journey as JourneyT,
} from "../lib/journey";
import { fetchMembers } from "../lib/members";
import { useAutoRefresh } from "../lib/refresh";
import { supabase, unwrap } from "../lib/supabase";
import { confirmAction } from "../lib/telegram";
import { firstName, type Member, type Profile, type RoadmapStep, type Tag } from "../lib/types";

/** /journey is your own road; /journey/:memberId is a trainee's road, for their leaders. */
export function Journey() {
  const me = useMe();
  const { isAdmin, isHead, refreshProfile } = useAuth();
  const { memberId } = useParams();
  const targetId = memberId ?? me.id;
  const self = targetId === me.id;

  const [other, setOther] = useState<Profile | null>(null);
  const [journey, setJourney] = useState<JourneyT | null>(null);
  const [names, setNames] = useState<Record<string, Member>>({});
  const [serving, setServing] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    { kind: "story" } | { kind: "step"; step: RoadmapStep } | { kind: "add-step" } | { kind: "win" } | null
  >(null);

  const person = self ? me : other;

  const load = useCallback(async () => {
    try {
      const p = self ? me : (unwrap(await supabase.from("profiles").select("*").eq("id", targetId).single()) as Profile);
      const [j, pt] = await Promise.all([
        fetchJourney(targetId),
        supabase.from("profile_tags").select("tag_id").eq("profile_id", targetId),
      ]);
      // Instrument and level tags a leader gave this person. (General tags are
      // leader-only notes; the database doesn't return them to trainees.)
      const tagIds = ((pt.data ?? []) as { tag_id: string }[]).map((r) => r.tag_id);
      const tags = tagIds.length
        ? ((unwrap(await supabase.from("tags").select("*").in("id", tagIds)) as Tag[]) ?? [])
        : [];
      const ids = [
        ...Object.values(j.progress).map((x) => x.updated_by),
        ...j.accomplishments.map((a) => a.created_by),
        p.trainer_id,
      ].filter((x): x is string => Boolean(x));
      setNames(await fetchMembers(ids));
      if (!self) setOther(p);
      setServing(
        tags
          .filter((t) => t.kind !== "general")
          .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "instrument" ? -1 : 1)),
      );
      setJourney(j);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [self, me, targetId]);

  useEffect(() => {
    load();
  }, [load]);
  // Leaders may sign off steps or edit the roadmap from the web console while this is open.
  useAutoRefresh(load);

  // Mirrors can_manage_member() in the database, which has the final say.
  const canManage = Boolean(person) && (isHead || (!self && (isAdmin || person!.trainer_id === me.id)));
  const focus = useMemo(() => (journey ? focusStep(journey) : null), [journey]);
  const doneCount = useMemo(
    () => (journey ? Object.values(stepStates(journey)).filter((s) => s === "done").length : 0),
    [journey],
  );

  if (error && !journey) return <main className="screen"><ErrorNote error={error} /></main>;
  if (!person || !journey) return <main className="screen"><Spinner /></main>;

  const first = firstName(person.display_name);
  const trainerName = person.trainer_id ? names[person.trainer_id]?.display_name : null;

  return (
    <main className="screen">
      <header className="row" style={{ gap: 12 }}>
        <Avatar name={person.display_name} photo={person.photo_url} large />
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="small muted">{self ? "Your journey" : "Journey"}</span>
          <span className="h3">
            {person.display_name}
            <RoleBadge role={person.role} />
          </span>
        </div>
      </header>

      {serving.length ? (
        <div className="row row--wrap" style={{ gap: 6 }} aria-label="Serving areas">
          {serving.map((t) => (
            <span key={t.id} className="badge">{t.label}</span>
          ))}
        </div>
      ) : null}

      <section className="hero" aria-label="Where you are now">
        <span className="hero__label">{self ? "Where you are on the road" : `Where ${first} is on the road`}</span>
        {focus ? (
          <>
            <span className="hero__big">Step {focus.index + 1}</span>
            <span className="journey-hero__step">{focus.step.title}</span>
          </>
        ) : (
          <span className="journey-hero__step">Your road is being mapped out</span>
        )}
        <span className="hero__label">
          {doneCount === 0 ? "No steps signed off yet" : `${doneCount} ${doneCount === 1 ? "step" : "steps"} signed off`}
          {trainerName ? ` · Trainer: ${trainerName}` : ""}
        </span>
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <div className="row row--between">
          <span className="eyebrow">Roadmap</span>
          {canManage ? <span className="tiny muted">Tap a step to sign it off</span> : null}
        </div>
        <Roadmap
          journey={journey}
          names={names}
          self={self}
          onStep={canManage ? (step) => setSheet({ kind: "step", step }) : undefined}
          onAddStep={canManage ? () => setSheet({ kind: "add-step" }) : undefined}
          beyond={
            self
              ? "The road keeps going. Your Head of Department will map out the next steps with you."
              : `The road keeps going. Add personal steps as ${first} grows.`
          }
        />
      </section>

      <section className="card journey-story">
        <div className="row row--between">
          <span className="eyebrow">Dreams &amp; vision</span>
          {self ? (
            <button className="btn btn--ghost btn--sm" onClick={() => setSheet({ kind: "story" })}>
              <Icon name="edit" size={14} /> Edit
            </button>
          ) : null}
        </div>
        <p className={`body${person.vision ? "" : " muted"}`}>
          {person.vision ?? (self ? "What do you dream of doing on the worship team? Tap Edit to write it down." : `${first} hasn't written this yet.`)}
        </p>
        <span className="eyebrow">I want to grow in</span>
        <p className={`body${person.growing_in ? "" : " muted"}`}>
          {person.growing_in ?? (self ? "Skills, character, anything you want to work on." : `${first} hasn't written this yet.`)}
        </p>
        {!self ? <span className="tiny muted">Written by {first}. Only they can change it.</span> : null}
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <div className="row row--between">
          <span className="eyebrow">Accomplishments</span>
          {canManage ? (
            <button className="btn btn--ghost btn--sm" onClick={() => setSheet({ kind: "win" })}>
              <Icon name="plus" size={14} /> Add
            </button>
          ) : null}
        </div>
        {journey.accomplishments.length === 0 ? (
          <div className="card">
            <p className="body muted">
              {self
                ? "Your leaders record what you accomplish here, like your first Sunday or leading a set."
                : `Nothing recorded for ${first} yet.`}
            </p>
          </div>
        ) : (
          <div className="list">
            {journey.accomplishments.map((a) => (
              <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <span className="win-icon" aria-hidden="true">
                  <Icon name="flag" size={16} />
                </span>
                <span className="stack grow" style={{ gap: 3 }}>
                  <span className="h3" style={{ fontSize: 15 }}>{a.title}</span>
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
                      if (!(await confirmAction(`Remove "${a.title}"?`))) return;
                      try {
                        await removeAccomplishment(a.id);
                        await load();
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <ErrorNote error={error} />

      {self ? (
        <Link to="/wrapped" className="btn btn--ghost btn--block">
          <Icon name="wrapped" size={16} /> Look back on your year
        </Link>
      ) : (
        <Link to={`/wrapped?member=${person.id}`} className="btn btn--ghost btn--block">
          <Icon name="wrapped" size={16} /> {first}'s Wrapped
        </Link>
      )}

      {sheet?.kind === "story" ? (
        <StorySheet
          profile={me}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            setSheet(null);
            await refreshProfile();
          }}
        />
      ) : null}
      {sheet?.kind === "step" ? (
        <StepSheet
          memberId={person.id}
          first={first}
          step={sheet.step}
          current={journey.progress[sheet.step.id]}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            setSheet(null);
            await load();
          }}
        />
      ) : null}
      {sheet?.kind === "add-step" ? (
        <AddStepSheet
          memberId={person.id}
          first={first}
          position={Math.max(0, ...journey.steps.map((s) => s.position)) + 1}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            setSheet(null);
            await load();
          }}
        />
      ) : null}
      {sheet?.kind === "win" ? (
        <AccomplishmentSheet
          memberId={person.id}
          first={first}
          onClose={() => setSheet(null)}
          onSaved={async () => {
            setSheet(null);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}
