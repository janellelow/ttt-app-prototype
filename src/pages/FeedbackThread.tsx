import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AudioPill, PrivatePlayer } from "../components/Media";
import { Avatar, ErrorNote, PrivateBadge, RoleBadge, Spinner } from "../components/ui";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { useAuth, useMe } from "../lib/auth";
import { errorText, formatClock, timeAgo } from "../lib/format";
import { fetchMembers, memberName } from "../lib/members";
import { uploadFile } from "../lib/storage";
import { supabase, unwrap } from "../lib/supabase";
import { haptic } from "../lib/telegram";
import type { FeedbackMessage, Member, Submission } from "../lib/types";

const RUBRIC = ["Timing", "Dynamics", "Feel"];

export function FeedbackThread() {
  const { submissionId } = useParams();
  const me = useMe();
  const { isStaff } = useAuth();
  const [sub, setSub] = useState<Submission | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [error, setError] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  // composer
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Blob | null>(null);
  const [moments, setMoments] = useState<number[]>([]);
  const [rubricOn, setRubricOn] = useState(false);
  const [rubric, setRubric] = useState<Record<string, number>>({ Timing: 3, Dynamics: 3, Feel: 3 });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = unwrap(await supabase.from("submissions").select("*").eq("id", submissionId!).single()) as Submission;
      const msgs = unwrap(
        await supabase.from("feedback_messages").select("*").eq("submission_id", s.id).order("created_at"),
      ) as FeedbackMessage[];
      setMembers(await fetchMembers([s.trainee_id, ...msgs.map((m) => m.author_id)]));
      setSub(s);
      setMessages(msgs);
    } catch (e) {
      setError(errorText(e));
    }
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  function seek(seconds: number) {
    const p = player.current;
    if (!p) return;
    p.currentTime = seconds;
    p.play().catch(() => undefined);
    p.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function addMoment() {
    const t = Math.floor(player.current?.currentTime ?? 0);
    if (!moments.includes(t)) setMoments([...moments, t].sort((a, b) => a - b));
    haptic();
  }

  async function send() {
    if (!sub) return;
    setSending(true);
    setError(null);
    try {
      let voice_path: string | null = null;
      if (voice) voice_path = await uploadFile("private-media", `${sub.trainee_id}/voice`, voice);
      unwrap(
        await supabase.from("feedback_messages").insert({
          submission_id: sub.id,
          body: text.trim() || null,
          voice_path,
          timestamps: moments.map((at) => ({ at })),
          rubric: isStaff && rubricOn ? rubric : null,
        }),
      );
      setText("");
      setVoice(null);
      setMoments([]);
      setRubricOn(false);
      haptic("success");
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  if (error && !sub) return <main className="screen"><ErrorNote error={error} /></main>;
  if (!sub) return <main className="screen"><Spinner /></main>;

  const traineeName = memberName(members, sub.trainee_id);
  const canSend = (text.trim() || voice) && !sending;

  return (
    <main className="screen" style={{ paddingBottom: "calc(var(--tab-h) + var(--safe-bottom) + 150px)" }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h1">{sub.title}</h1>
        <PrivateBadge>Private · {sub.trainee_id === me.id ? "you" : traineeName}, their trainer and admins</PrivateBadge>
      </div>

      <PrivatePlayer ref={player} bucket="private-media" path={sub.storage_path} kind={sub.media_kind} label={`${traineeName}'s take`} />
      <span className="small muted">
        Sent by {sub.trainee_id === me.id ? "you" : traineeName} · {timeAgo(sub.created_at)}
      </span>
      {sub.note ? <p className="body">{sub.note}</p> : null}

      <div className="stack" style={{ gap: 12 }}>
        {messages.map((m) => {
          const mine = m.author_id === me.id;
          const author = members[m.author_id];
          return (
            <div key={m.id} className="row" style={{ alignItems: "flex-end", flexDirection: mine ? "row-reverse" : "row" }}>
              <Avatar name={author?.display_name ?? "Member"} photo={author?.photo_url} />
              <div className={`bubble grow${mine ? " bubble--mine" : ""}`}>
                <span className="tiny muted">
                  {mine ? "You" : author?.display_name ?? "Member"}
                  {author && !mine ? <RoleBadge role={author.role} /> : null} · {timeAgo(m.created_at)}
                </span>
                {m.voice_path ? <AudioPill bucket="private-media" path={m.voice_path} label="voice note" /> : null}
                {m.body ? <p className="body">{m.body}</p> : null}
                {m.timestamps?.length ? (
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    {m.timestamps.map((t) => (
                      <button key={t.at} className="chip chip--sm chip--tint" onClick={() => seek(t.at)}>
                        at {formatClock(t.at)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.rubric ? (
                  <div className="stack" style={{ gap: 8, paddingTop: 4 }}>
                    <span className="eyebrow">Trainer rubric</span>
                    {Object.entries(m.rubric as Record<string, number>).map(([k, v]) => (
                      <div key={k} className="rubric-row">
                        <span>{k}</span>
                        <div className="progress"><div style={{ width: `${(v / 5) * 100}%` }} /></div>
                        <span className="small muted">{v}/5</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {!messages.length ? (
          <p className="small muted">
            {sub.trainee_id === me.id ? "Your trainer hasn't replied yet." : "No notes yet. Add the first one below."}
          </p>
        ) : null}
      </div>

      {/* Composer, pinned above the tab bar */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: "calc(var(--tab-h) + var(--safe-bottom))", zIndex: 15,
          background: "var(--bg)", borderTop: "1px solid var(--line)", padding: "10px 16px",
        }}
      >
        <div className="stack" style={{ gap: 8, maxWidth: 560, margin: "0 auto" }}>
          {voice || moments.length || rubricOn ? (
            <div className="row row--wrap" style={{ gap: 6 }}>
              {voice ? (
                <button className="chip chip--sm chip--sage" onClick={() => setVoice(null)} aria-label="Remove voice note">
                  Voice note ready ✕
                </button>
              ) : null}
              {moments.map((t) => (
                <button key={t} className="chip chip--sm chip--tint" onClick={() => setMoments(moments.filter((x) => x !== t))} aria-label={`Remove moment ${formatClock(t)}`}>
                  at {formatClock(t)} ✕
                </button>
              ))}
            </div>
          ) : null}
          {isStaff && rubricOn ? (
            <div className="card" style={{ padding: 12, gap: 8 }}>
              {RUBRIC.map((k) => (
                <label key={k} className="rubric-row">
                  <span>{k}</span>
                  <input
                    type="range" min={1} max={5} step={1} value={rubric[k]} className="grow"
                    onChange={(e) => setRubric({ ...rubric, [k]: Number(e.target.value) })}
                    style={{ accentColor: "var(--sage)" }}
                  />
                  <span className="small muted">{rubric[k]}/5</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="row" style={{ gap: 8 }}>
            <label className="sr-only" htmlFor="thread-reply">Write a reply</label>
            <input
              id="thread-reply"
              className="input input--pill grow"
              placeholder={sub.trainee_id === me.id ? "Reply to your trainer…" : `Note for ${traineeName}…`}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
            <VoiceRecorder onRecorded={setVoice} disabled={sending} />
            <button className="icon-btn icon-btn--sage" onClick={send} disabled={!canSend} aria-label="Send">
              <Icon name="send" size={18} />
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="chip chip--sm" onClick={addMoment}>+ Mark this moment</button>
            {isStaff ? (
              <button className={`chip chip--sm${rubricOn ? " chip--sage" : ""}`} onClick={() => setRubricOn(!rubricOn)} aria-pressed={rubricOn}>
                Rubric
              </button>
            ) : null}
          </div>
          <ErrorNote error={error} />
        </div>
      </div>
    </main>
  );
}
