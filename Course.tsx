import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { PrivateImage, PrivatePlayer } from "../components/Media";
import { ErrorNote, Sheet, Spinner } from "../components/ui";
import { useMe } from "../lib/auth";
import { errorText } from "../lib/format";
import { supabase, unwrap } from "../lib/supabase";
import { haptic, openLink } from "../lib/telegram";
import type { Course as CourseT, LessonItem, Module, Quiz } from "../lib/types";

const KIND: Record<LessonItem["kind"], { icon: IconName; label: string }> = {
  video: { icon: "video", label: "Video" },
  photo: { icon: "photo", label: "Photo" },
  link: { icon: "link", label: "Link" },
  text: { icon: "text", label: "Notes" },
};

export function Course() {
  const { courseId } = useParams();
  const me = useMe();
  const [course, setCourse] = useState<CourseT | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [items, setItems] = useState<LessonItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<LessonItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = unwrap(await supabase.from("courses").select("*").eq("id", courseId!).single()) as CourseT;
      const mods = unwrap(await supabase.from("modules").select("*").eq("course_id", c.id).order("position")) as Module[];
      const modIds = mods.map((m) => m.id);
      const [its, qs] = modIds.length
        ? await Promise.all([
            supabase.from("lesson_items").select("*").in("module_id", modIds).order("position"),
            supabase.from("quizzes").select("*").in("module_id", modIds).order("created_at"),
          ])
        : [{ data: [] }, { data: [] }];
      const itemList = (its.data as LessonItem[]) ?? [];
      const prog = itemList.length
        ? await supabase.from("lesson_progress").select("item_id").eq("profile_id", me.id).in("item_id", itemList.map((i) => i.id))
        : { data: [] };
      setCourse(c);
      setModules(mods);
      setItems(itemList);
      setQuizzes((qs.data as Quiz[]) ?? []);
      setDone(new Set(((prog.data ?? []) as { item_id: string }[]).map((p) => p.item_id)));
    } catch (e) {
      setError(errorText(e));
    }
  }, [courseId, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  const progress = items.length ? Math.round((done.size / items.length) * 100) : 0;
  // The module to continue with: the first one that still has unfinished items.
  const currentIndex = useMemo(() => {
    const i = modules.findIndex((m) => items.some((it) => it.module_id === m.id && !done.has(it.id)));
    return i === -1 ? Math.max(0, modules.length - 1) : i;
  }, [modules, items, done]);

  async function markDone(item: LessonItem) {
    haptic("success");
    setDone(new Set([...done, item.id]));
    await supabase.from("lesson_progress").upsert({ item_id: item.id }, { onConflict: "profile_id,item_id", ignoreDuplicates: true });
  }

  if (error) return <main className="screen"><ErrorNote error={error} /></main>;
  if (!course) return <main className="screen"><Spinner /></main>;

  const current = modules[currentIndex];

  return (
    <main className="screen">
      <div className="stack" style={{ gap: 4 }}>
        <span className="small muted">
          {course.title}
          {modules.length ? ` · Module ${currentIndex + 1} of ${modules.length}` : ""}
        </span>
        <h1 className="h1">{current?.title ?? course.title}</h1>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      {course.description ? <p className="body">{course.description}</p> : null}

      {modules.map((m, idx) => {
        const mItems = items.filter((i) => i.module_id === m.id);
        const mQuizzes = quizzes.filter((q) => q.module_id === m.id);
        return (
          <section key={m.id} className="stack" style={{ gap: 8 }} aria-label={m.title}>
            {idx !== currentIndex || modules.length > 1 ? (
              <span className="eyebrow">Module {idx + 1} · {m.title}</span>
            ) : null}
            {mItems.map((it) => (
              <button key={it.id} className="card row" style={{ border: "none", textAlign: "left", padding: "12px 14px", flexDirection: "row" }} onClick={() => setOpen(it)}>
                <span className="icon-btn icon-btn--sm" style={{ background: "var(--sage-tint)", color: "var(--sage-dark)", borderRadius: 10 }}>
                  <Icon name={KIND[it.kind].icon} size={18} />
                </span>
                <span className="stack grow" style={{ gap: 0 }}>
                  <span className="h3" style={{ fontSize: 15 }}>{it.title}</span>
                  <span className="tiny muted">{KIND[it.kind].label}</span>
                </span>
                {done.has(it.id) ? <span style={{ color: "var(--sage)" }}><Icon name="check" size={20} label="Done" /></span> : null}
              </button>
            ))}
            {mQuizzes.map((q) => (
              <Link key={q.id} to={`/quiz/${q.id}`} className="card card--outline row" style={{ textDecoration: "none", color: "inherit", flexDirection: "row" }}>
                <span className="icon-btn icon-btn--sm icon-btn--sage" style={{ borderRadius: 10 }}>
                  <Icon name="quiz" size={18} />
                </span>
                <span className="stack grow" style={{ gap: 0 }}>
                  <span className="eyebrow" style={{ color: "var(--sage)" }}>Module quiz{!q.published ? " · draft" : ""}</span>
                  <span className="h3" style={{ fontSize: 15 }}>{q.title}</span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
            {!mItems.length && !mQuizzes.length ? <span className="small muted">Nothing in this module yet.</span> : null}
          </section>
        );
      })}

      {open ? (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <ItemContent item={open} />
          {done.has(open.id) ? (
            <span className="badge"><Icon name="check" size={14} /> Done</span>
          ) : (
            <button className="btn btn--primary btn--block" onClick={() => markDone(open)}>
              Mark as done
            </button>
          )}
        </Sheet>
      ) : null}
    </main>
  );
}

function ItemContent({ item }: { item: LessonItem }) {
  if (item.kind === "video" && item.storage_path) {
    return <PrivatePlayer bucket="lesson-media" path={item.storage_path} kind="video" label={item.title} />;
  }
  if (item.kind === "photo" && item.storage_path) {
    return <PrivateImage bucket="lesson-media" path={item.storage_path} alt={item.title} />;
  }
  if (item.url) {
    return (
      <div className="stack">
        {item.body ? <p className="body">{item.body}</p> : null}
        <button className="btn btn--dark btn--block" onClick={() => openLink(item.url!)}>
          <Icon name="link" size={18} /> Open {item.kind === "video" ? "video" : "link"}
        </button>
      </div>
    );
  }
  return <p className="body">{item.body}</p>;
}
