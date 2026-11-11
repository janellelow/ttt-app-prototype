import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Empty, ErrorNote, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { errorText } from "../lib/format";
import { supabase, unwrap } from "../lib/supabase";
import type { Course } from "../lib/types";

export function Learn() {
  const { isStaff } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Row level security only returns courses this person may see.
        const list = unwrap(await supabase.from("courses").select("*").order("created_at")) as Course[];
        setCourses(isStaff ? list : list.filter((c) => c.published));
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [isStaff]);

  return (
    <main className="screen">
      <div className="row row--between">
        <h1 className="h1">Learn</h1>
        {isStaff ? (
          <Link to="/manage" className="btn btn--dark btn--sm">
            <Icon name="plus" size={16} /> Add content
          </Link>
        ) : null}
      </div>
      <ErrorNote error={error} />
      {!courses ? (
        <Spinner />
      ) : courses.length === 0 ? (
        <Empty title="No courses yet">Your trainers will add lessons, videos and quizzes here.</Empty>
      ) : (
        <div className="list">
          {courses.map((c) => (
            <Link key={c.id} to={`/learn/${c.id}`} className="list-row">
              <span className="icon-btn icon-btn--sm" style={{ background: "var(--sage-tint)", color: "var(--sage-dark)" }}>
                <Icon name="learn" size={18} />
              </span>
              <span className="stack grow" style={{ gap: 2 }}>
                <span className="h3" style={{ fontSize: 15 }}>
                  {c.title}
                  {!c.published ? <span className="badge badge--dark" style={{ marginLeft: 6, fontSize: 11, padding: "2px 7px" }}>Draft</span> : null}
                </span>
                {c.description ? <span className="small muted">{c.description}</span> : null}
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
