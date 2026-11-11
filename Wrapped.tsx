import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useMe } from "../lib/auth";
import { errorText, timeZone } from "../lib/format";
import { supabase } from "../lib/supabase";
import { haptic, shareText } from "../lib/telegram";
import type { WrappedData } from "../lib/types";

interface Slide {
  lead: string;
  huge: string;
  big: string;
  soft?: string;
}

export function Wrapped() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Trainers and admins can open a trainee's Wrapped with ?member=<id>
  const memberId = params.get("member");
  const year = Number(params.get("year")) || new Date().getFullYear();
  const [data, setData] = useState<WrappedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    supabase
      .rpc("get_wrapped", { p_year: year, p_member: memberId, p_tz: timeZone })
      .then(({ data, error }) => {
        if (error) setError(errorText(new Error(error.message)));
        else setData(data as WrappedData);
      });
  }, [year, memberId]);

  const slides: Slide[] = useMemo(() => {
    if (!data) return [];
    const hours = Math.round(data.total_minutes / 60);
    const s: Slide[] = [
      {
        lead: "You put in",
        huge: String(hours),
        big: hours === 1 ? "hour of practice." : "hours of practice.",
        soft:
          data.percentile_in_group != null
            ? `That's more than ${data.percentile_in_group}% of people in your community group.`
            : `Across ${data.sessions} practice ${data.sessions === 1 ? "session" : "sessions"}.`,
      },
      {
        lead: "Your longest streak",
        huge: String(data.longest_streak),
        big: data.longest_streak === 1 ? "day in a row." : "days in a row.",
        soft: data.busiest_month ? `${data.busiest_month} was your busiest month.` : undefined,
      },
      {
        lead: "You passed",
        huge: String(data.quizzes_passed),
        big: data.quizzes_passed === 1 ? "quiz." : "quizzes.",
        soft: `And finished ${data.lessons_completed} ${data.lessons_completed === 1 ? "lesson" : "lessons"}.`,
      },
      {
        lead: "Your trainers sent",
        huge: String(data.feedback_received),
        big: data.feedback_received === 1 ? "piece of feedback." : "pieces of feedback.",
        soft: "Every note is a step forward.",
      },
    ];
    return s;
  }, [data]);

  const total = slides.length + 1; // last slide = summary
  const onSummary = index >= slides.length;

  function next() {
    haptic();
    setIndex((i) => Math.min(total - 1, i + 1));
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function share() {
    if (!data) return;
    const hours = Math.round(data.total_minutes / 60);
    shareText(
      `My ${data.year} on TTT: ${hours} hours of practice, a ${data.longest_streak}-day streak and ${data.quizzes_passed} quizzes passed.`,
    );
  }

  const close = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="story" role="region" aria-label={`Your ${year} Wrapped`}>
      <div className="story__segments" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={i <= index ? "on" : undefined} />
        ))}
      </div>
      <div className="row row--between">
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sage-tint)" }}>
          {memberId && memberId !== me.id ? "Trainee's" : "Your"} {year} Wrapped
        </span>
        <button className="icon-btn" style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }} onClick={close} aria-label="Close Wrapped">
          <Icon name="close" size={18} />
        </button>
      </div>

      {error ? <p style={{ color: "#fff" }}>{error}</p> : null}
      {!data && !error ? <div className="spinner" style={{ alignSelf: "center", marginTop: 80 }} /> : null}

      {data && data.total_minutes === 0 && data.quizzes_taken === 0 ? (
        <div className="story__tap" style={{ cursor: "default" }}>
          <span className="story__big">Your {year} story starts with your first practice session.</span>
          <span className="story__soft">Log practice from the Community screen and come back here to see your year add up.</span>
        </div>
      ) : data && !onSummary ? (
        <button
          className="story__tap"
          onClick={(e) => {
            const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
            if (x < e.currentTarget.clientWidth * 0.3) prev();
            else next();
          }}
          aria-label="Next"
        >
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--sage-tint)" }}>{slides[index]!.lead}</span>
          <span className="story__huge">{slides[index]!.huge}</span>
          <span className="story__big">{slides[index]!.big}</span>
          {slides[index]!.soft ? <span className="story__soft">{slides[index]!.soft}</span> : null}
          <span className="tiny" style={{ marginTop: 24, color: "var(--sage-tint)" }}>Tap to continue</span>
        </button>
      ) : data ? (
        <>
          <div className="story__tap" style={{ cursor: "default", justifyContent: "flex-end" }}>
            <span className="story__big">That's your {year}.</span>
          </div>
          <div className="grid-2">
            <div className="stat"><span className="stat__label">Practice</span><span className="stat__value">{Math.round(data.total_minutes / 60)}h</span></div>
            <div className="stat"><span className="stat__label">Longest streak</span><span className="stat__value">{data.longest_streak} days</span></div>
            <div className="stat"><span className="stat__label">Quizzes passed</span><span className="stat__value">{data.quizzes_passed}</span></div>
            <div className="stat"><span className="stat__label">Lessons done</span><span className="stat__value">{data.lessons_completed}</span></div>
          </div>
          <div className="row">
            <button className="btn btn--light grow" onClick={() => setIndex(0)}>Replay</button>
            <button className="btn btn--dark grow" onClick={share}>Share</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
