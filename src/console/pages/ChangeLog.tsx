import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorNote, Spinner } from "../../components/ui";
import { describeAudit, type AuditRow } from "../../lib/audit";
import { errorText } from "../../lib/format";
import { useAutoRefresh } from "../../lib/refresh";
import { supabase, unwrap } from "../../lib/supabase";
import { useTeam } from "../ConsoleApp";
import { namesOf } from "../data";

/** Every placement, role, roadmap, accomplishment and access change. Heads only. */
export function ChangeLog() {
  const { team } = useTeam();
  const names = useMemo(() => namesOf(team), [team]);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await supabase
        .from("audit_log")
        .select("id, actor_id, action, target_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows(unwrap(res) as AuditRow[]);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load);

  const name = (id: string | null) => (id && names[id]?.display_name) || "Someone";

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1 className="h1">Change log</h1>
          <p className="muted">Who changed what, newest first. Only Heads of Department see this.</p>
        </div>
      </header>
      <ErrorNote error={error} />
      {!rows ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 190 }}>When</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="muted">No changes yet.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small muted">
                      {new Date(r.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="small">{describeAudit(r, name)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
