import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AudioPill, PrivateImage, PrivatePlayer } from "../components/Media";
import { Avatar, Empty, ErrorNote, RoleBadge, Sheet, Spinner } from "../components/ui";
import { useAuth, useMe } from "../lib/auth";
import { errorText, formatClock, formatMinutes, greeting, timeAgo, timeZone } from "../lib/format";
import { fetchAgeGroups, fetchMembers, memberName } from "../lib/members";
import { mediaKindOf, uploadFile } from "../lib/storage";
import { supabase, unwrap } from "../lib/supabase";
import { confirmAction, haptic } from "../lib/telegram";
import type { AgeGroup, Channel, Member, Post, PostComment, PracticeSummary } from "../lib/types";

const CHANNELS: { id: Channel | null; label: string }[] = [
  { id: null, label: "For you" },
  { id: "drums", label: "Drums" },
  { id: "guitar", label: "Guitar" },
  { id: "bass", label: "Bass" },
  { id: "keys", label: "Keys" },
  { id: "vocals", label: "Vocals" },
  { id: "live-sound", label: "Live sound" },
];

export function Community() {
  const me = useMe();
  const { isStaff } = useAuth();
  const [groups, setGroups] = useState<AgeGroup[]>([]);
  // Staff can look at (and post into) any age group; everyone else sees their own.
  const [groupId, setGroupId] = useState<string | null>(me.age_group_id);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [composing, setComposing] = useState(false);
  const [feedKey, setFeedKey] = useState(0);

  useEffect(() => {
    fetchAgeGroups().then((g) => {
      setGroups(g);
      if (!groupId && isStaff && g[0]) setGroupId(g[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a leader moves you to another age group, show that group's feed.
  useEffect(() => {
    if (!isStaff) setGroupId(me.age_group_id);
  }, [isStaff, me.age_group_id]);

  const groupLabel = groups.find((g) => g.id === groupId)?.label;

  return (
    <main className="screen">
      <header className="row row--between">
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={me.display_name} photo={me.photo_url} large />
          <div className="stack" style={{ gap: 2 }}>
            <span className="small muted">{greeting()}</span>
            <span className="h3">{me.display_name}</span>
          </div>
        </div>
        {isStaff ? (
          <div className="row" style={{ gap: 8 }}>
            <Link to="/manage" className="icon-btn" aria-label="Manage lessons and quizzes">
              <Icon name="learn" size={20} />
            </Link>
            <Link to="/admin" className="icon-btn" aria-label="Members and groups">
              <Icon name="settings" size={20} />
            </Link>
          </div>
        ) : null}
      </header>

      <PracticeCard />

      <div className="row row--between">
        <h2 className="h2">Community</h2>
        {groupLabel ? <span className="badge">Ages {groupLabel} space</span> : null}
      </div>

      {!groupId ? (
        <Empty title="You're almost in">
          A trainer or admin will place you in your community group soon. Until then you can still use Learn,
          Feedback and the practice timer.
        </Empty>
      ) : (
        <>
          {isStaff && groups.length > 1 ? (
            <div className="chips" aria-label="Age group">
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={`chip chip--sm${g.id === groupId ? " chip--sage" : " chip--tint"}`}
                  onClick={() => setGroupId(g.id)}
                  aria-pressed={g.id === groupId}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="chips" aria-label="Topic">
            {CHANNELS.map((c) => (
              <button
                key={c.label}
                className={`chip${c.id === channel ? " chip--active" : ""}`}
                onClick={() => setChannel(c.id)}
                aria-pressed={c.id === channel}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button className="btn btn--ghost btn--block" onClick={() => setComposing(true)}>
            <Icon name="plus" size={18} /> Share something with your group
          </button>
          <Feed key={`${groupId}-${channel}-${feedKey}`} groupId={groupId} channel={channel} />
          {composing ? (
            <Composer
              groupId={groupId}
              defaultChannel={channel ?? "general"}
              onClose={() => setComposing(false)}
              onPosted={() => {
                setComposing(false);
                setFeedKey((k) => k + 1);
              }}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Practice card + timer
// ---------------------------------------------------------------------------

const TIMER_KEY = "ttt-practice-started-at";

function PracticeCard() {
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [timerOpen, setTimerOpen] = useState(() => Boolean(localStorage.getItem(TIMER_KEY)));

  const load = useCallback(() => {
    supabase.rpc("get_practice_summary", { p_tz: timeZone }).then(({ data }) => {
      if (data) setSummary(data as PracticeSummary);
    });
  }, []);
  useEffect(load, [load]);

  const max = Math.max(30, ...(summary?.days.map((d) => d.minutes) ?? [0]));
  const today = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd

  return (
    <section className="hero" aria-label="Practice this week">
      <div className="row row--between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="hero__label">This week</span>
          <span className="hero__big">{summary ? formatMinutes(summary.week_minutes) : "—"}</span>
        </div>
        <span className="badge" style={{ background: "#fff" }}>
          {summary?.streak ?? 0}-day streak
        </span>
      </div>
      <div className="bars" role="img" aria-label="Minutes practised each day this week">
        {(summary?.days ?? Array.from({ length: 7 }, (_, i) => ({ day: String(i), minutes: 0 }))).map((d) => (
          <div
            key={d.day}
            className={d.day === today ? "bars__today" : undefined}
            style={{ height: `${Math.max(8, (d.minutes / max) * 100)}%` }}
          />
        ))}
      </div>
      <button className="btn btn--light" onClick={() => setTimerOpen(true)}>
        {localStorage.getItem(TIMER_KEY) ? "Timer running · open" : "Start practice timer"}
      </button>
      {timerOpen ? (
        <PracticeTimer
          onClose={() => setTimerOpen(false)}
          onSaved={() => {
            setTimerOpen(false);
            load();
          }}
        />
      ) : null}
    </section>
  );
}

function PracticeTimer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // The start time is kept on the phone so the timer survives closing the app.
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    const v = localStorage.getItem(TIMER_KEY);
    return v ? Number(v) : null;
  });
  const [now, setNow] = useState(Date.now());
  const [manual, setManual] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;

  function start() {
    const t = Date.now();
    localStorage.setItem(TIMER_KEY, String(t));
    setStartedAt(t);
    haptic();
  }

  async function save(minutes: number, started: Date) {
    setSaving(true);
    setError(null);
    try {
      unwrap(
        await supabase.from("practice_sessions").insert({
          minutes,
          started_at: started.toISOString(),
          note: note.trim() || null,
        }),
      );
      localStorage.removeItem(TIMER_KEY);
      haptic("success");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Practice timer" onClose={onClose}>
      <div className="card" style={{ alignItems: "center" }}>
        <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em" }}>{formatClock(elapsed)}</span>
        {startedAt ? (
          <div className="row" style={{ width: "100%" }}>
            <button
              className="btn btn--ghost grow"
              onClick={() => {
                localStorage.removeItem(TIMER_KEY);
                setStartedAt(null);
              }}
            >
              Discard
            </button>
            <button
              className="btn btn--primary grow"
              disabled={saving || elapsed < 30}
              onClick={() => save(Math.min(600, Math.max(1, Math.round(elapsed / 60))), new Date(startedAt))}
            >
              Finish and save
            </button>
          </div>
        ) : (
          <button className="btn btn--primary btn--block" onClick={start}>
            Start
          </button>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="practice-note">What did you work on? (optional)</label>
        <input id="practice-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>

      {!startedAt ? (
        <div className="card">
          <span className="h3">Forgot to start the timer?</span>
          <div className="row">
            <label className="sr-only" htmlFor="manual-minutes">Minutes practised</label>
            <input
              id="manual-minutes"
              className="input grow"
              inputMode="numeric"
              placeholder="Minutes"
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
            />
            <button
              className="btn btn--dark"
              disabled={saving || !manual || Number(manual) < 1 || Number(manual) > 600}
              onClick={() => save(Number(manual), new Date(Date.now() - Number(manual) * 60000))}
            >
              Log time
            </button>
          </div>
        </div>
      ) : null}
      <ErrorNote error={error} />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

function Feed({ groupId, channel }: { groupId: string; channel: Channel | null }) {
  const me = useMe();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [likes, setLikes] = useState<Record<string, { count: number; mine: boolean }>>({});
  const [replies, setReplies] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      let q = supabase.from("posts").select("*").eq("age_group_id", groupId).order("created_at", { ascending: false }).limit(50);
      if (channel) q = q.eq("channel", channel);
      const list = unwrap(await q) as Post[];
      const ids = list.map((p) => p.id);
      const [reactions, comments, people] = await Promise.all([
        ids.length ? supabase.from("post_reactions").select("post_id, profile_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("post_comments").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] }),
        fetchMembers(list.map((p) => p.author_id)),
      ]);
      const l: Record<string, { count: number; mine: boolean }> = {};
      ((reactions.data ?? []) as { post_id: string; profile_id: string }[]).forEach((r) => {
        l[r.post_id] ??= { count: 0, mine: false };
        l[r.post_id]!.count++;
        if (r.profile_id === me.id) l[r.post_id]!.mine = true;
      });
      const c: Record<string, number> = {};
      ((comments.data ?? []) as { post_id: string }[]).forEach((r) => (c[r.post_id] = (c[r.post_id] ?? 0) + 1));
      setLikes(l);
      setReplies(c);
      setMembers(people);
      setPosts(list);
    } catch (e) {
      setError(errorText(e));
    }
  }, [groupId, channel, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleLike(postId: string) {
    const cur = likes[postId] ?? { count: 0, mine: false };
    haptic();
    setLikes({ ...likes, [postId]: { count: cur.count + (cur.mine ? -1 : 1), mine: !cur.mine } });
    if (cur.mine) await supabase.from("post_reactions").delete().eq("post_id", postId).eq("profile_id", me.id);
    else await supabase.from("post_reactions").insert({ post_id: postId });
  }

  async function remove(post: Post) {
    if (!(await confirmAction("Delete this post?"))) return;
    await supabase.from("posts").delete().eq("id", post.id);
    if (post.media_path) await supabase.storage.from("community-media").remove([post.media_path]);
    setPosts((ps) => ps?.filter((p) => p.id !== post.id) ?? null);
  }

  if (error) return <ErrorNote error={error} />;
  if (!posts) return <Spinner />;
  if (!posts.length) return <Empty title="Nothing here yet">Be the first to share a practice win or a question.</Empty>;

  return (
    <div className="stack" style={{ gap: 12 }}>
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          author={members[p.author_id]}
          likes={likes[p.id] ?? { count: 0, mine: false }}
          replies={replies[p.id] ?? 0}
          onLike={() => toggleLike(p.id)}
          onDelete={() => remove(p)}
        />
      ))}
    </div>
  );
}

function PostCard({
  post, author, likes, replies, onLike, onDelete,
}: {
  post: Post;
  author?: Member;
  likes: { count: number; mine: boolean };
  replies: number;
  onLike: () => void;
  onDelete: () => void;
}) {
  const me = useMe();
  const { isStaff } = useAuth();
  const [open, setOpen] = useState(false);
  const name = author?.display_name ?? "Member";

  return (
    <article className="card">
      <div className="row">
        <Avatar name={name} photo={author?.photo_url} />
        <div className="stack grow" style={{ gap: 0 }}>
          <span className="h3" style={{ fontSize: 15 }}>
            {name}
            {author ? <RoleBadge role={author.role} /> : null}
          </span>
          <span className="tiny muted">
            {post.channel !== "general" ? `${post.channel.replace("-", " ")} · ` : ""}
            {timeAgo(post.created_at)}
          </span>
        </div>
        {post.author_id === me.id || isStaff ? (
          <button className="icon-btn icon-btn--sm" style={{ background: "transparent" }} onClick={onDelete} aria-label="Delete post">
            <Icon name="trash" size={16} />
          </button>
        ) : null}
      </div>
      <p className="body">{post.body}</p>
      {post.media_path && post.media_kind === "audio" ? (
        <AudioPill bucket="community-media" path={post.media_path} label={`${name}'s clip`} />
      ) : null}
      {post.media_path && post.media_kind === "image" ? (
        <PrivateImage bucket="community-media" path={post.media_path} alt={`Photo shared by ${name}`} />
      ) : null}
      {post.media_path && post.media_kind === "video" ? (
        <PrivatePlayer bucket="community-media" path={post.media_path} kind="video" label={`Video shared by ${name}`} />
      ) : null}
      <div className="row" style={{ gap: 18 }}>
        <button
          className="row small"
          style={{ border: "none", background: "none", padding: 0, gap: 6, color: likes.mine ? "var(--sage)" : "var(--muted)", fontWeight: 700, minHeight: 32 }}
          onClick={onLike}
          aria-pressed={likes.mine}
        >
          <Icon name="heart" size={18} /> {likes.count} {likes.count === 1 ? "like" : "likes"}
        </button>
        <button
          className="row small muted"
          style={{ border: "none", background: "none", padding: 0, gap: 6, fontWeight: 700, minHeight: 32 }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Icon name="reply" size={18} /> {replies} {replies === 1 ? "reply" : "replies"}
        </button>
      </div>
      {open ? <Comments postId={post.id} /> : null}
    </article>
  );
}

function Comments({ postId }: { postId: string }) {
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at");
    const list = (data as PostComment[]) ?? [];
    setMembers(await fetchMembers(list.map((c) => c.author_id)));
    setComments(list);
  }, [postId]);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("post_comments").insert({ post_id: postId, body: text.trim() });
    setSending(false);
    if (!error) {
      setText("");
      load();
    }
  }

  if (!comments) return <Spinner />;
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      {comments.map((c) => (
        <div key={c.id} className="small">
          <strong>{memberName(members, c.author_id)}</strong> <span style={{ color: "var(--ink-2)" }}>{c.body}</span>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor={`reply-${postId}`}>Write a reply</label>
        <input
          id={`reply-${postId}`}
          className="input input--pill grow"
          placeholder="Write a reply…"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="icon-btn icon-btn--sage" onClick={send} disabled={sending || !text.trim()} aria-label="Send reply">
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New post
// ---------------------------------------------------------------------------

function Composer({
  groupId, defaultChannel, onClose, onPosted,
}: {
  groupId: string;
  defaultChannel: Channel;
  onClose: () => void;
  onPosted: () => void;
}) {
  const me = useMe();
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileKind = useMemo(() => (file ? mediaKindOf(file) : null), [file]);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      let media_path: string | null = null;
      if (file) {
        if (!fileKind) throw new Error("Attach an audio clip, photo or video.");
        if (file.size > 50 * 1024 * 1024) throw new Error("That file is over 50 MB.");
        media_path = await uploadFile("community-media", `${groupId}/${me.id}`, file);
      }
      unwrap(
        await supabase.from("posts").insert({
          age_group_id: groupId,
          channel,
          body: body.trim(),
          media_path,
          media_kind: media_path ? fileKind : null,
        }),
      );
      haptic("success");
      onPosted();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="New post" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="post-body">Message</label>
        <textarea id="post-body" className="textarea" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder="A practice win, a question, a tip…" />
      </div>
      <div className="field">
        <label className="label" htmlFor="post-channel">Topic</label>
        <select id="post-channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
          <option value="general">General</option>
          {CHANNELS.filter((c) => c.id).map((c) => (
            <option key={c.id} value={c.id!}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="post-file">Attach audio, photo or video (optional)</label>
        <input id="post-file" type="file" accept="audio/*,image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !body.trim()} onClick={post}>
        {busy ? "Posting…" : "Post to your group"}
      </button>
    </Sheet>
  );
}
