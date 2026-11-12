import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, RoleBadge } from "../../components/ui";
import { formatDay } from "../../lib/journey";
import { useConsoleAuth, useLeader } from "../auth";
import { useTeam } from "../ConsoleApp";
import { namesOf, positionOf } from "../data";

type Show = "everyone" | "trainees" | "leaders" | "unplaced" | "mine";

export function People() {
  const me = useLeader();
  const { isAdmin } = useConsoleAuth();
  const { team } = useTeam();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const show = (params.get("show") as Show) || (isAdmin ? "everyone" : "mine");
  const [query, setQuery] = useState("");
  const names = useMemo(() => namesOf(team), [team]);

  const filters: { id: Show; label: string }[] = [
    ...(isAdmin ? [{ id: "everyone" as Show, label: "Everyone" }] : []),
    { id: "mine", label: "My trainees" },
    { id: "trainees", label: "Trainees" },
    ...(isAdmin ? [{ id: "leaders" as Show, label: "Leaders" }] : []),
    { id: "unplaced", label: "Not placed" },
  ];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.people
      .filter((p) => {
        if (show === "trainees") return p.role === "trainee";
        if (show === "leaders") return p.role !== "trainee";
        if (show === "unplaced") return !p.age_group_id;
        if (show === "mine") return p.trainer_id === me.id;
        return true;
      })
      .filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.username ?? "").toLowerCase().includes(q));
  }, [team, show, query, me.id]);

  const group = (id: string | null) => team.groups.find((g) => g.id === id)?.label;
  const tagLabels = (pid: string) =>
    (team.tagsOf[pid] ?? []).map((id) => team.tags.find((t) => t.id === id)?.label).filter(Boolean) as string[];
  const lastWin = (pid: string) => team.accomplishments.find((a) => a.profile_id === pid);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">People</h1>
          <p className="muted">{isAdmin ? "Everyone on the worship team." : "Your trainees and newcomers waiting to be placed."}</p>
        </div>
        <label className="sr-only" htmlFor="people-search">Search people</label>
        <input
          id="people-search"
          className="input input--pill search"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="chips" role="tablist" aria-label="Show">
        {filters.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={show === f.id}
            className={`chip${show === f.id ? " chip--active" : ""}`}
            onClick={() => setParams(f.id === filters[0]!.id ? {} : { show: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Group</th>
              <th>Trainer</th>
              <th>Serving</th>
              <th>On the road</th>
              <th>Latest accomplishment</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">No one here.</td>
              </tr>
            ) : (
              rows.map((p) => {
                const pos = positionOf(team, p.id);
                const win = lastWin(p.id);
                return (
                  <tr key={p.id} className="table__row" tabIndex={0} onClick={() => navigate(`/people/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/people/${p.id}`)}>
                    <td>
                      <span className="row" style={{ gap: 10 }}>
                        <Avatar name={p.display_name} photo={p.photo_url} />
                        <span className="stack" style={{ gap: 0 }}>
                          <strong>{p.display_name}</strong>
                          {p.username ? <span className="tiny muted">@{p.username}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td>{p.role === "trainee" ? <span className="muted">Trainee</span> : <RoleBadge role={p.role} />}</td>
                    <td>{group(p.age_group_id) ?? <span className="pill pill--warn">Not placed</span>}</td>
                    <td>{p.trainer_id ? names[p.trainer_id]?.display_name ?? "–" : <span className="muted">–</span>}</td>
                    <td>
                      <span className="row row--wrap" style={{ gap: 4 }}>
                        {tagLabels(p.id).map((t) => (
                          <span key={t} className="pill">{t}</span>
                        ))}
                      </span>
                    </td>
                    <td>
                      {pos ? (
                        <span className="stack" style={{ gap: 0 }}>
                          <span className="small"><strong>Step {pos.index + 1}</strong> · {pos.title}</span>
                          <span className="tiny muted">{pos.state === "current" ? "In progress" : pos.state === "next" ? "Next up" : "Signed off"}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>
                      {win ? (
                        <span className="stack" style={{ gap: 0 }}>
                          <span className="small">{win.title}</span>
                          <span className="tiny muted">{formatDay(win.achieved_on)}</span>
                        </span>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
