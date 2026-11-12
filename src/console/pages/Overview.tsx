import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/ui";
import { greeting, timeAgo } from "../../lib/format";
import { roleLabel } from "../../lib/labels";
import { firstName } from "../../lib/types";
import { useConsoleAuth, useLeader } from "../auth";
import { useTeam } from "../ConsoleApp";
import { daysAgo, namesOf, positionOf } from "../data";

export function Overview() {
  const me = useLeader();
  const { isAdmin } = useConsoleAuth();
  const { team } = useTeam();
  const names = useMemo(() => namesOf(team), [team]);

  const members = team.people.filter((p) => p.id !== me.id);
  const trainees = members.filter((p) => p.role === "trainee");
  const unplaced = members.filter((p) => !p.age_group_id);
  const noTrainer = trainees.filter((p) => p.age_group_id && !p.trainer_id);
  const signedOff30 = team.progress.filter((p) => p.status === "done" && p.done_on && daysAgo(p.done_on) <= 30);
  const wins30 = team.accomplishments.filter((a) => daysAgo(a.achieved_on) <= 30);

  // Where each trainee is on the general road.
  const general = team.steps.filter((s) => s.profile_id === null);
  const atStep = useMemo(() => {
    const counts: Record<string, string[]> = {};
    trainees.forEach((p) => {
      const pos = positionOf(team, p.id);
      const step = pos ? general.find((s) => s.title === pos.title) : general[0];
      if (step) (counts[step.id] ??= []).push(p.id);
    });
    return counts;
  }, [team, trainees, general]);
  const most = Math.max(1, ...Object.values(atStep).map((l) => l.length));

  const recent = useMemo(() => {
    const stepTitle = (id: string) => team.steps.find((s) => s.id === id)?.title ?? "a step";
    const items = [
      ...team.progress
        .filter((p) => p.status === "done")
        .map((p) => ({ key: `p${p.profile_id}${p.step_id}`, who: p.profile_id, what: `signed off “${stepTitle(p.step_id)}”`, when: p.updated_at })),
      ...team.accomplishments.map((a) => ({ key: `a${a.id}`, who: a.profile_id, what: a.title, when: a.created_at })),
    ];
    return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 7);
  }, [team]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">
            {greeting()}, {firstName(me.display_name)}
          </h1>
          <p className="muted">
            {isAdmin ? "The worship team at a glance." : `Your ${roleLabel("trainee").toLowerCase()}s at a glance, plus newcomers waiting to be placed.`}
          </p>
        </div>
      </header>

      <section className="tiles">
        <div className="tile">
          <span className="tile__label">{isAdmin ? "People on the team" : `Your ${roleLabel("trainee").toLowerCase()}s`}</span>
          <span className="tile__value">{isAdmin ? members.length : trainees.filter((p) => p.trainer_id === me.id).length}</span>
          <span className="tile__sub">{trainees.length} {roleLabel("trainee").toLowerCase()}s</span>
        </div>
        <Link to="/people?show=unplaced" className="tile tile--link">
          <span className="tile__label">Waiting to be placed</span>
          <span className={`tile__value${unplaced.length ? " tile__value--alert" : ""}`}>{unplaced.length}</span>
          <span className="tile__sub">{noTrainer.length} placed without a trainer</span>
        </Link>
        <div className="tile">
          <span className="tile__label">Steps signed off</span>
          <span className="tile__value">{signedOff30.length}</span>
          <span className="tile__sub">last 30 days</span>
        </div>
        <div className="tile">
          <span className="tile__label">Accomplishments</span>
          <span className="tile__value">{wins30.length}</span>
          <span className="tile__sub">last 30 days</span>
        </div>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel__head">
            <h2 className="h3">Where {roleLabel("trainee").toLowerCase()}s are on the road</h2>
            <Link to="/roadmap" className="small">Edit roadmap</Link>
          </div>
          <ol className="dist">
            {general.map((s, i) => {
              const ids = atStep[s.id] ?? [];
              return (
                <li key={s.id} className="dist__row">
                  <span className="dist__label">
                    <span className="dist__num">{i + 1}</span>
                    {s.title}
                  </span>
                  <span className="dist__bar" aria-hidden="true">
                    <span style={{ width: `${(ids.length / most) * 100}%` }} />
                  </span>
                  <span className="dist__faces">
                    {ids.slice(0, 4).map((id) => (
                      <Link key={id} to={`/people/${id}`} title={names[id]?.display_name}>
                        <Avatar name={names[id]?.display_name ?? "?"} photo={names[id]?.photo_url} />
                      </Link>
                    ))}
                    {ids.length > 4 ? <span className="tiny muted">+{ids.length - 4}</span> : null}
                    {ids.length === 0 ? <span className="tiny muted">–</span> : null}
                  </span>
                </li>
              );
            })}
            <li className="dist__row dist__row--beyond">
              <span className="dist__label">
                <span className="dist__num">∞</span>
                The road keeps going
              </span>
            </li>
          </ol>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="h3">Recent milestones</h2>
          </div>
          {recent.length === 0 ? (
            <p className="muted small">Signed-off steps and accomplishments show up here.</p>
          ) : (
            <ul className="feed">
              {recent.map((r) => (
                <li key={r.key}>
                  <Link to={`/people/${r.who}`} className="feed__item">
                    <Avatar name={names[r.who]?.display_name ?? "?"} photo={names[r.who]?.photo_url} />
                    <span className="stack grow" style={{ gap: 2 }}>
                      <span className="small">
                        <strong>{names[r.who]?.display_name ?? "Someone"}</strong> · {r.what}
                      </span>
                      <span className="tiny muted">{timeAgo(r.when)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
