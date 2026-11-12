import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ErrorNote, Spinner } from "../components/ui";
import { errorText } from "../lib/format";
import { supabase, unwrap } from "../lib/supabase";
import { haptic } from "../lib/telegram";
import type { Quiz, QuizOption, QuizQuestion, QuizResult } from "../lib/types";

export function QuizPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [options, setOptions] = useState<QuizOption[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const q = unwrap(await supabase.from("quizzes").select("*").eq("id", quizId!).single()) as Quiz;
        const qs = unwrap(await supabase.from("quiz_questions").select("*").eq("quiz_id", q.id).order("position")) as QuizQuestion[];
        const os = qs.length
          ? (unwrap(await supabase.from("quiz_options").select("*").in("question_id", qs.map((x) => x.id)).order("position")) as QuizOption[])
          : [];
        setQuiz(q);
        setQuestions(qs);
        setOptions(os);
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [quizId]);

  const question = questions[index];
  const qOptions = useMemo(() => options.filter((o) => o.question_id === question?.id), [options, question]);
  const isLast = index === questions.length - 1;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Marked on the server: the correct answers never reach the phone first.
      const { data, error } = await supabase.rpc("submit_quiz", { p_quiz: quizId, p_answers: answers });
      if (error) throw new Error(error.message);
      const r = data as QuizResult;
      haptic(r.passed ? "success" : "error");
      setResult(r);
      setIndex(0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !quiz) return <main className="screen screen--full"><ErrorNote error={error} /></main>;
  if (!quiz) return <main className="screen screen--full"><Spinner /></main>;

  if (result) {
    return (
      <main className="screen screen--full">
        <div className="hero" style={{ alignItems: "flex-start" }}>
          <span className="hero__label">{quiz.title}</span>
          <span className="hero__big">{result.score} / {result.total}</span>
          <span style={{ fontWeight: 700 }}>{result.passed ? "Passed. Nice work!" : `Not quite: you need ${quiz.pass_mark}% to pass.`}</span>
        </div>
        {questions.map((q, i) => {
          const r = result.results.find((x) => x.question_id === q.id);
          return (
            <div key={q.id} className="card">
              <span className="eyebrow">Question {i + 1}</span>
              <span className="h3">{q.prompt}</span>
              {options.filter((o) => o.question_id === q.id).map((o) => {
                const cls =
                  o.id === r?.correct_option_id ? " option--right" : o.id === r?.chosen_option_id ? " option--wrong" : "";
                return (
                  <div key={o.id} className={`option${cls}`}>
                    {o.label}
                    {o.id === r?.correct_option_id ? " ✓" : ""}
                  </div>
                );
              })}
            </div>
          );
        })}
        <button className="btn btn--dark btn--block" onClick={() => navigate(-1)}>Back to lesson</button>
      </main>
    );
  }

  if (!questions.length) {
    return (
      <main className="screen screen--full">
        <h1 className="h1">{quiz.title}</h1>
        <p className="body">This quiz doesn't have any questions yet.</p>
        <button className="btn btn--dark" onClick={() => navigate(-1)}>Go back</button>
      </main>
    );
  }

  return (
    <main className="screen screen--full">
      <div className="row row--between">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Leave quiz">
          <Icon name="close" size={18} />
        </button>
        <span className="eyebrow" style={{ color: "var(--sage)" }}>Q{index + 1} of {questions.length}</span>
      </div>
      <div className="progress"><div style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      <span className="small muted">{quiz.title}</span>
      <fieldset className="card card--outline" style={{ margin: 0 }}>
        <legend className="sr-only">{question!.prompt}</legend>
        <span className="h3" style={{ fontSize: 18 }} aria-hidden="true">{question!.prompt}</span>
        {qOptions.map((o) => {
          const chosen = answers[question!.id] === o.id;
          return (
            <button
              key={o.id}
              className={`option${chosen ? " option--chosen" : ""}`}
              aria-pressed={chosen}
              onClick={() => {
                haptic();
                setAnswers({ ...answers, [question!.id]: o.id });
              }}
            >
              {o.label}
            </button>
          );
        })}
      </fieldset>
      <ErrorNote error={error} />
      <div className="row">
        {index > 0 ? (
          <button className="btn btn--ghost grow" onClick={() => setIndex(index - 1)}>Back</button>
        ) : null}
        {isLast ? (
          <button className="btn btn--primary grow" disabled={busy || Object.keys(answers).length < questions.length} onClick={submit}>
            {busy ? "Marking…" : "Submit answers"}
          </button>
        ) : (
          <button className="btn btn--primary grow" disabled={!answers[question!.id]} onClick={() => setIndex(index + 1)}>
            Next question
          </button>
        )}
      </div>
    </main>
  );
}
