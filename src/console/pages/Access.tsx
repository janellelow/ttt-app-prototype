import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, ErrorNote, RoleBadge, Spinner } from "../../components/ui";
import { errorText, timeAgo } from "../../lib/format";
import { useAutoRefresh } from "../../lib/refresh";
import { anonKeyValue, functionsUrl, supabase, unwrap } from "../../lib/supabase";
import type { ConsoleAccess } from "../../lib/types";
import { useTeam } from "../ConsoleApp";
import { namesOf } from "../data";

const LEADER_ROLES = ["trainer", "admin", "head"];

async function callAccess(body: Record<string, string>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${functionsUrl}/console-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKeyValue,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
}

/** Heads of Department decide which Google account each leader signs in with. */
export function Access() {
  const { team } = useTeam();
  const names = useMemo(() => namesOf(team), [team]);
  const [rows, setRows] = useState<ConsoleAccess[] | null>(null);
  const [personId, setPersonId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(unwrap(await supabase.from("console_access").select("*").order("granted_at")) as ConsoleAccess[]);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load);

  const person = (id: string) => team.people.find((p) => p.id === id);
  const withoutAccess = team.people.filter((p) => LEADER_ROLES.includes(p.role) && !rows?.some((r) => r.profile_id === p.id));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">Console access</h1>
          <p className="muted">
            Leaders sign in to this console with Google. Add the Google account each leader uses. Removing it stops
            their console sign-in straight away; they keep using TTT in Telegram as normal.
          </p>
        </div>
      </header>

      <form
        className="panel access-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await callAccess({ action: "grant", profile_id: personId, email });
            setPersonId("");
            setEmail("");
          });
        }}
      >
        <div className="field">
          <label className="label" htmlFor="ac-person">Leader</label>
          <select id="ac-person" className="select" value={personId} onChange={(e) => setPersonId(e.target.value)} required>
            <option value="">Choose a trainer, admin or Head</option>
            {withoutAccess.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="ac-email">Their Google account</label>
          <input id="ac-email" type="email" className="input" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy || !personId || !email.trim()}>
          Give access
        </button>
      </form>
      <ErrorNote error={error} />

      {!rows ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Leader</th>
                <th>Role</th>
                <th>Google account</th>
                <th>Added</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">No one has console access yet.</td>
                </tr>
              ) : (
                rows.map((r) => {
                  const p = person(r.profile_id);
                  const stillLeader = p && LEADER_ROLES.includes(p.role);
                  return (
                    <tr key={r.profile_id}>
                      <td>
                        <span className="row" style={{ gap: 10 }}>
                          <Avatar name={p?.display_name ?? "?"} photo={p?.photo_url} />
                          <strong>{p?.display_name ?? "Unknown"}</strong>
                        </span>
                      </td>
                      <td>
                        {p ? <RoleBadge role={p.role} /> : null}
                        {!stillLeader ? <span className="pill pill--warn">No longer a leader, can't sign in</span> : null}
                      </td>
                      <td className="mono">{r.email}</td>
                      <td>
                        <span className="small">{timeAgo(r.granted_at)}</span>
                        {r.granted_by ? <span className="tiny muted"> by {names[r.granted_by]?.display_name ?? "a Head"}</span> : null}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn btn--danger btn--sm"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Remove console access for ${p?.display_name ?? r.email}?`)) {
                              run(() => callAccess({ action: "revoke", profile_id: r.profile_id }));
                            }
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
