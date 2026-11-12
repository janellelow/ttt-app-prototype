import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Avatar, Empty, ErrorNote, PrivateBadge, RoleBadge, Sheet, Spinner } from "../components/ui";
import { useAuth, useMe } from "../lib/auth";
import { errorText, timeAgo } from "../lib/format";
import { describeAudit, type AuditRow } from "../lib/audit";
import { fetchAgeGroups } from "../lib/members";
import { useAutoRefresh } from "../lib/refresh";
import { supabase, unwrap } from "../lib/supabase";
import { haptic } from "../lib/telegram";
import { ROLE_LABEL, type AgeGroup, type Member, type Profile, type Role, type Tag } from "../lib/types";

type Tab = "unassigned" | "mine" | "all" | "log";

export function Admin() {
  const me = useMe();
  const { isAdmin, isHead, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>("unassigned");
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [profileTags, setProfileTags] = useState<Record<string, string[]>>({});
  const [groups, setGroups] = useState<AgeGroup[]>([]);
  const [staff, setStaff] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Admins see everyone; trainers see their trainees and people nobody has placed yet.
      const ps = unwrap(await supabase.from("profiles").select("*").order("created_at", { ascending: false })) as Profile[];
      const [t, pt, g, s] = await Promise.all([
        supabase.from("tags").select("*").order("kind").order("label"),
        ps.length ? supabase.from("profile_tags").select("profile_id, tag_id").in("profile_id", ps.map((p) => p.id)) : Promise.resolve({ data: [] }),
        fetchAgeGroups(),
        supabase.from("member_directory").select("*").in("role", ["trainer", "admin", "head"]).order("display_name"),
      ]);
      const map: Record<string, string[]> = {};
      ((pt.data ?? []) as { profile_id: string; tag_id: string }[]).forEach((r) => {
        (map[r.profile_id] ??= []).push(r.tag_id);
      });
      setTags((t.data as Tag[]) ?? []);
      setProfileTags(map);
      setGroups(g);
      setStaff((s.data as Member[]) ?? []);
      setPeople(ps);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load);

  const shown = useMemo(() => {
    if (!people) return [];
    const others = people.filter((p) => p.id !== me.id);
    if (tab === "unassigned") return others.filter((p) => !p.age_group_id);
    if (tab === "mine") return others.filter((p) => p.trainer_id === me.id);
    return others;
  }, [people, tab, me.id]);

  const groupLabel = (id: string | null) => groups.find((g) => g.id === id)?.label;
  const tagLabels = (pid: string) =>
    (profileTags[pid] ?? []).map((id) => tags.find((t) => t.id === id)?.label).filter(Boolean).join(", ");
  const unassignedCount = people?.filter((p) => p.id !== me.id && !p.age_group_id).length ?? 0;

  return (
    <main className="screen">
      <div className="row row--between">
        <h1 className="h1">Members</h1>
        <span className="badge badge--dark">{ROLE_LABEL[me.role]}</span>
      </div>
      <PrivateBadge>Seen only by leaders. Every change is logged.</PrivateBadge>

      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tab === "unassigned"} className={`chip${tab === "unassigned" ? " chip--active" : ""}`} onClick={() => setTab("unassigned")}>
          Unassigned · {unassignedCount}
        </button>
        <button role="tab" aria-selected={tab === "mine"} className={`chip${tab === "mine" ? " chip--active" : ""}`} onClick={() => setTab("mine")}>
          My trainees
        </button>
        {isAdmin ? (
          <>
            <button role="tab" aria-selected={tab === "all"} className={`chip${tab === "all" ? " chip--active" : ""}`} onClick={() => setTab("all")}>
              Everyone
            </button>
            {isHead ? (
              <button role="tab" aria-selected={tab === "log"} className={`chip${tab === "log" ? " chip--active" : ""}`} onClick={() => setTab("log")}>
                Change log
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <ErrorNote error={error} />

      {tab === "log" ? (
        <AuditLog people={people ?? []} />
      ) : !people ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Empty title={tab === "unassigned" ? "Everyone has a group" : "No one here yet"}>
          {tab === "unassigned" ? "New people appear here after they open the app for the first time." : null}
        </Empty>
      ) : (
        <div className="list">
          {shown.map((p) => (
            <button key={p.id} className="list-row" onClick={() => setEditing(p)}>
              <Avatar name={p.display_name} photo={p.photo_url} />
              <span className="stack grow" style={{ gap: 2 }}>
                <span className="h3" style={{ fontSize: 15 }}>
                  {p.display_name}
                  <RoleBadge role={p.role} />
                </span>
                <span className="tiny muted">
                  {p.username ? `@${p.username} · ` : ""}
                  {groupLabel(p.age_group_id) ? `Ages ${groupLabel(p.age_group_id)}` : `Joined ${timeAgo(p.created_at)} · no group yet`}
                  {tagLabels(p.id) ? ` · ${tagLabels(p.id)}` : ""}
                </span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <AssignSheet
          person={editing}
          groups={groups}
          tags={tags}
          staff={staff}
          currentTags={profileTags[editing.id] ?? []}
          onTagCreated={(t) => setTags([...tags, t])}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await refreshProfile();
          }}
        />
      ) : null}
    </main>
  );
}

function AssignSheet({
  person, groups, tags, staff, currentTags, onTagCreated, onClose, onSaved,
}: {
  person: Profile;
  groups: AgeGroup[];
  tags: Tag[];
  staff: Member[];
  currentTags: string[];
  onTagCreated: (t: Tag) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useMe();
  const { isAdmin, isHead } = useAuth();
  const [role, setRole] = useState<Role>(person.role);
  const [groupId, setGroupId] = useState<string>(person.age_group_id ?? "");
  // Trainers can only make themselves the trainer.
  const [trainerId, setTrainerId] = useState<string>(isAdmin ? person.trainer_id ?? "" : me.id);
  const [selected, setSelected] = useState<string[]>(currentTags);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function createTag() {
    const label = newTag.trim();
    if (!label) return;
    try {
      const t = unwrap(await supabase.from("tags").insert({ label, created_by: me.id }).select().single()) as Tag;
      onTagCreated(t);
      setSelected([...selected, t.id]);
      setNewTag("");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("assign_member", {
        p_member: person.id,
        p_age_group: groupId || null,
        p_trainer: trainerId || null,
        p_tag_ids: selected,
        p_role: isHead ? role : null,
      });
      if (error) throw new Error(error.message);
      haptic("success");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Assign ${person.display_name}`} onClose={onClose}>
      {isHead ? (
        <div className="field">
          <label className="label" htmlFor="as-role">Role</label>
          <select id="as-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="trainee">Trainee</option>
            <option value="trainer">Trainer</option>
            <option value="admin">Admin</option>
            <option value="head">Head of Department</option>
          </select>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="as-age">Age group</label>
        <select id="as-age" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Not placed yet</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="label" id="as-tags">Groups and tags</span>
        <div className="row row--wrap" style={{ gap: 6 }} role="group" aria-labelledby="as-tags">
          {tags.map((t) => (
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
        <div className="row" style={{ gap: 8 }}>
          <label className="sr-only" htmlFor="as-newtag">New tag</label>
          <input id="as-newtag" className="input grow" placeholder="New tag, e.g. School band" maxLength={40} value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn btn--ghost btn--sm" onClick={createTag} disabled={!newTag.trim()}>Add tag</button>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="as-trainer">Assigned trainer</label>
        {isAdmin ? (
          <select id="as-trainer" className="select" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="">No trainer</option>
            {staff.filter((s) => s.id !== person.id).map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}{s.role !== "trainer" ? ` (${ROLE_LABEL[s.role]})` : ""}</option>
            ))}
          </select>
        ) : (
          <span id="as-trainer" className="body">You</span>
        )}
      </div>

      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save assignment"}
      </button>
      {person.trainer_id === me.id || isAdmin ? (
        <Link to={`/journey/${person.id}`} className="btn btn--dark btn--block">View their journey</Link>
      ) : null}
      {person.trainer_id === me.id || isAdmin ? (
        <Link to={`/wrapped?member=${person.id}`} className="btn btn--ghost btn--block">View their Wrapped</Link>
      ) : null}
    </Sheet>
  );
}

function AuditLog({ people }: { people: Profile[] }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    supabase
      .from("audit_log")
      .select("id, actor_id, action, target_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setRows((data as AuditRow[]) ?? []));
  }, []);
  const name = (id: string | null) => people.find((p) => p.id === id)?.display_name ?? "Someone";
  if (!rows) return <Spinner />;
  if (!rows.length) return <Empty title="No changes yet" />;
  return (
    <div className="list">
      {rows.map((r) => (
        <div key={r.id} className="list-row">
          <span className="stack grow" style={{ gap: 2 }}>
            <span className="small">{describeAudit(r, name)}</span>
            <span className="tiny muted">{timeAgo(r.created_at)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
