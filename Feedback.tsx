import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Avatar, Empty, ErrorNote, PrivateBadge, Sheet, Spinner } from "../components/ui";
import { useAuth, useMe } from "../lib/auth";
import { errorText, timeAgo } from "../lib/format";
import { fetchMembers, memberName } from "../lib/members";
import { mediaKindOf, uploadFile } from "../lib/storage";
import { supabase, unwrap } from "../lib/supabase";
import { haptic } from "../lib/telegram";
import type { Member, Submission } from "../lib/types";

export function Feedback() {
  const me = useMe();
  const { isStaff } = useAuth();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Row level security returns: your own takes, your trainees' takes
      // (if you're their trainer), or everything (admins).
      const list = unwrap(await supabase.from("submissions").select("*").order("created_at", { ascending: false }).limit(100)) as Submission[];
      const ids = list.map((s) => s.id);
      const msgs = ids.length
        ? await supabase.from("feedback_messages").select("submission_id, author_id").in("submission_id", ids)
        : { data: [] };
      const c: Record<string, number> = {};
      ((msgs.data ?? []) as { submission_id: string; author_id: string }[]).forEach((m) => {
        c[m.submission_id] = (c[m.submission_id] ?? 0) + 1;
      });
      setMembers(await fetchMembers(list.map((s) => s.trainee_id)));
      setCounts(c);
      setSubs(list);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mine = subs?.filter((s) => s.trainee_id === me.id) ?? [];
  const others = subs?.filter((s) => s.trainee_id !== me.id) ?? [];

  return (
    <main className="screen">
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h1">Feedback</h1>
        <PrivateBadge>Private · only you, your trainer and admins</PrivateBadge>
      </div>

      {!isStaff || mine.length ? (
        <button className="btn btn--primary btn--block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Send a new take
        </button>
      ) : null}

      <ErrorNote error={error} />
      {!subs ? <Spinner /> : null}

      {isStaff && subs ? (
        <section className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Takes from your trainees</span>
          {others.length ? (
            <SubmissionList subs={others} counts={counts} members={members} showName />
          ) : (
            <Empty title="No takes yet">When your trainees send recordings, they'll appear here for you to review.</Empty>
          )}
        </section>
      ) : null}

      {subs && (!isStaff || mine.length) ? (
        <section className="stack" style={{ gap: 8 }}>
          {isStaff ? <span className="eyebrow">Your own takes</span> : null}
          {mine.length ? (
            <SubmissionList subs={mine} counts={counts} members={members} />
          ) : (
            <Empty title="No takes yet">
              Record yourself playing, send it here, and your trainer will reply with notes or a voice message.
            </Empty>
          )}
        </section>
      ) : null}

      {adding ? <NewTake onClose={() => setAdding(false)} /> : null}
    </main>
  );
}

function SubmissionList({
  subs, counts, members, showName,
}: {
  subs: Submission[];
  counts: Record<string, number>;
  members: Record<string, Member>;
  showName?: boolean;
}) {
  return (
    <div className="list">
      {subs.map((s) => (
        <Link key={s.id} to={`/feedback/${s.id}`} className="list-row">
          {showName ? (
            <Avatar name={memberName(members, s.trainee_id)} photo={members[s.trainee_id]?.photo_url} />
          ) : (
            <span className="icon-btn icon-btn--sm" style={{ background: "var(--sage-soft)", color: "var(--sage-dark)", borderRadius: 10 }}>
              <Icon name={s.media_kind === "video" ? "video" : "mic"} size={18} />
            </span>
          )}
          <span className="stack grow" style={{ gap: 2 }}>
            <span className="h3" style={{ fontSize: 15 }}>{s.title}</span>
            <span className="tiny muted">
              {showName ? `${memberName(members, s.trainee_id)} · ` : ""}
              {timeAgo(s.created_at)} · {counts[s.id] ? `${counts[s.id]} ${counts[s.id] === 1 ? "note" : "notes"}` : "waiting for feedback"}
            </span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      ))}
    </div>
  );
}

function NewTake({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      if (!file) throw new Error("Choose a recording first.");
      const kind = mediaKindOf(file);
      if (kind !== "audio" && kind !== "video") throw new Error("Send an audio or video recording.");
      if (file.size > 200 * 1024 * 1024) throw new Error("That file is over 200 MB. Try a shorter clip.");
      const storage_path = await uploadFile("private-media", `${me.id}/submissions`, file);
      const row = unwrap(
        await supabase
          .from("submissions")
          .insert({ title: title.trim(), note: note.trim() || null, storage_path, media_kind: kind })
          .select()
          .single(),
      ) as Submission;
      haptic("success");
      navigate(`/feedback/${row.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Send a new take" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="take-title">What are you playing?</label>
        <input id="take-title" className="input" value={title} maxLength={120} placeholder="Groove in 7/8 · take 3" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="take-file">Recording (audio or video)</label>
        <input id="take-file" type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="take-note">Anything you want your trainer to listen for? (optional)</label>
        <textarea id="take-note" className="textarea" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <PrivateBadge>Only you, your trainer and admins will see this</PrivateBadge>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim() || !file} onClick={send}>
        {busy ? "Uploading…" : "Send to my trainer"}
      </button>
    </Sheet>
  );
}
