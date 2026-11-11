// Trainers and admins add courses, modules, lesson material and quizzes here.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Empty, ErrorNote, Sheet, Spinner } from "../components/ui";
import { errorText } from "../lib/format";
import { fetchAgeGroups } from "../lib/members";
import { uploadFile } from "../lib/storage";
import { supabase, unwrap } from "../lib/supabase";
import { confirmAction, haptic } from "../lib/telegram";
import type { AgeGroup, Course, ItemKind, LessonItem, Module, Quiz } from "../lib/types";

export function Manage() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [groups, setGroups] = useState<AgeGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCourses(unwrap(await supabase.from("courses").select("*").order("created_at")) as Course[]);
      setGroups(await fetchAgeGroups());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const course = courses?.find((c) => c.id === selected) ?? null;

  return (
    <main className="screen">
      <div className="row row--between">
        <h1 className="h1">Lessons and quizzes</h1>
      </div>
      <ErrorNote error={error} />
      {!courses ? (
        <Spinner />
      ) : (
        <>
          <div className="chips">
            {courses.map((c) => (
              <button key={c.id} className={`chip${c.id === selected ? " chip--active" : ""}`} onClick={() => setSelected(c.id)}>
                {c.title}
                {!c.published ? " · draft" : ""}
              </button>
            ))}
            <button className="chip chip--tint" onClick={() => setCreating(true)}>
              + New course
            </button>
          </div>
          {course ? (
            <CourseEditor key={course.id} course={course} groups={groups} onChanged={load} onDeleted={() => { setSelected(null); load(); }} />
          ) : (
            <Empty title={courses.length ? "Pick a course to edit" : "Create your first course"}>
              A course holds modules. Each module can have videos, photos, links, notes and quizzes.
            </Empty>
          )}
        </>
      )}
      {creating ? (
        <CourseForm
          groups={groups}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            setSelected(c.id);
            load();
          }}
        />
      ) : null}
    </main>
  );
}

function CourseForm({ groups, onClose, onSaved }: { groups: AgeGroup[]; onClose: () => void; onSaved: (c: Course) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const c = unwrap(
        await supabase
          .from("courses")
          .insert({ title: title.trim(), description: description.trim() || null, age_group_id: groupId || null, created_by: u.user!.id })
          .select()
          .single(),
      ) as Course;
      onSaved(c);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="New course" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="c-title">Title</label>
        <input id="c-title" className="input" value={title} maxLength={120} placeholder="Live Sound 101" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="c-desc">Description</label>
        <textarea id="c-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="c-group">Who can see it</label>
        <select id="c-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Every age group</option>
          {groups.map((g) => <option key={g.id} value={g.id}>Ages {g.label} only</option>)}
        </select>
      </div>
      <p className="small muted">New courses start as drafts. Trainees can't see them until you publish.</p>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim()} onClick={save}>Create course</button>
    </Sheet>
  );
}

function CourseEditor({
  course, groups, onChanged, onDeleted,
}: {
  course: Course;
  groups: AgeGroup[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [modules, setModules] = useState<Module[]>([]);
  const [items, setItems] = useState<LessonItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [newModule, setNewModule] = useState("");
  const [addingItem, setAddingItem] = useState<Module | null>(null);
  const [addingQuiz, setAddingQuiz] = useState<Module | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const mods = ((await supabase.from("modules").select("*").eq("course_id", course.id).order("position")).data as Module[]) ?? [];
    const ids = mods.map((m) => m.id);
    const [its, qs] = ids.length
      ? await Promise.all([
          supabase.from("lesson_items").select("*").in("module_id", ids).order("position"),
          supabase.from("quizzes").select("*").in("module_id", ids).order("created_at"),
        ])
      : [{ data: [] }, { data: [] }];
    setModules(mods);
    setItems((its.data as LessonItem[]) ?? []);
    setQuizzes((qs.data as Quiz[]) ?? []);
  }, [course.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await fn();
    if (error) setError(error.message);
    else load();
  }

  async function addModule() {
    if (!newModule.trim()) return;
    await run(() => supabase.from("modules").insert({ course_id: course.id, title: newModule.trim(), position: modules.length }));
    setNewModule("");
  }

  async function togglePublish() {
    await run(() => supabase.from("courses").update({ published: !course.published }).eq("id", course.id));
    onChanged();
  }

  async function deleteCourse() {
    if (!(await confirmAction(`Delete "${course.title}" and everything in it?`))) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) setError(error.message);
    else onDeleted();
  }

  async function deleteItem(item: LessonItem) {
    if (!(await confirmAction(`Remove "${item.title}"?`))) return;
    if (item.storage_path) await supabase.storage.from("lesson-media").remove([item.storage_path]);
    await run(() => supabase.from("lesson_items").delete().eq("id", item.id));
  }

  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="card">
        <div className="row row--between">
          <span className="h3">{course.title}</span>
          <span className="badge">{course.published ? "Published" : "Draft"}</span>
        </div>
        <span className="small muted">
          {course.age_group_id ? `Ages ${groups.find((g) => g.id === course.age_group_id)?.label} only` : "Every age group"}
        </span>
        <div className="row">
          <button className="btn btn--primary btn--sm grow" onClick={togglePublish}>
            {course.published ? "Unpublish" : "Publish to trainees"}
          </button>
          <button className="btn btn--danger btn--sm" onClick={deleteCourse}>Delete</button>
        </div>
      </div>

      {modules.map((m, i) => (
        <div key={m.id} className="card">
          <span className="eyebrow">Module {i + 1}</span>
          <span className="h3">{m.title}</span>
          {items.filter((it) => it.module_id === m.id).map((it) => (
            <div key={it.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="grow small"><strong>{it.title}</strong> <span className="muted">· {it.kind}</span></span>
              <button className="icon-btn icon-btn--sm" style={{ background: "transparent" }} onClick={() => deleteItem(it)} aria-label={`Remove ${it.title}`}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {quizzes.filter((q) => q.module_id === m.id).map((q) => (
            <div key={q.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="grow small"><strong>{q.title}</strong> <span className="muted">· quiz{q.published ? "" : " (draft)"}</span></span>
              <button
                className="chip chip--sm"
                onClick={() => run(() => supabase.from("quizzes").update({ published: !q.published }).eq("id", q.id))}
              >
                {q.published ? "Unpublish" : "Publish"}
              </button>
            </div>
          ))}
          <div className="row">
            <button className="btn btn--ghost btn--sm grow" onClick={() => setAddingItem(m)}>+ Video, photo, link or notes</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setAddingQuiz(m)}>+ Quiz</button>
          </div>
        </div>
      ))}

      <div className="row">
        <label className="sr-only" htmlFor="new-module">New module title</label>
        <input id="new-module" className="input grow" placeholder="New module, e.g. Gain staging" value={newModule} maxLength={120} onChange={(e) => setNewModule(e.target.value)} />
        <button className="btn btn--dark btn--sm" disabled={!newModule.trim()} onClick={addModule}>Add module</button>
      </div>
      <ErrorNote error={error} />

      {addingItem ? (
        <ItemForm courseId={course.id} module={addingItem} position={items.filter((i) => i.module_id === addingItem.id).length} onClose={() => setAddingItem(null)} onSaved={() => { setAddingItem(null); load(); }} />
      ) : null}
      {addingQuiz ? (
        <QuizForm module={addingQuiz} onClose={() => setAddingQuiz(null)} onSaved={() => { setAddingQuiz(null); load(); }} />
      ) : null}
    </section>
  );
}

function ItemForm({
  courseId, module, position, onClose, onSaved,
}: {
  courseId: string;
  module: Module;
  position: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ItemKind>("video");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let storage_path: string | null = null;
      if ((kind === "video" || kind === "photo") && file) {
        storage_path = await uploadFile("lesson-media", courseId, file);
      }
      const cleanUrl = url.trim();
      if (cleanUrl && !/^https:\/\//i.test(cleanUrl)) throw new Error("Links must start with https://");
      if (kind === "link" && !cleanUrl) throw new Error("Add the link.");
      if (kind === "photo" && !storage_path) throw new Error("Choose a photo.");
      if (kind === "video" && !storage_path && !cleanUrl) throw new Error("Upload a video or paste a video link.");
      if (kind === "text" && !body.trim()) throw new Error("Write the notes.");
      unwrap(
        await supabase.from("lesson_items").insert({
          module_id: module.id,
          kind,
          title: title.trim(),
          url: cleanUrl || null,
          storage_path,
          body: body.trim() || null,
          position,
        }),
      );
      haptic("success");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Add to ${module.title}`} onClose={onClose}>
      <div className="chips">
        {(["video", "photo", "link", "text"] as ItemKind[]).map((k) => (
          <button key={k} className={`chip${k === kind ? " chip--active" : ""}`} onClick={() => setKind(k)} aria-pressed={k === kind}>
            {k === "text" ? "Notes" : k[0]!.toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="label" htmlFor="i-title">Title</label>
        <input id="i-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {kind === "video" || kind === "photo" ? (
        <div className="field">
          <label className="label" htmlFor="i-file">{kind === "video" ? "Upload a video (up to 200 MB)" : "Upload a photo"}</label>
          <input id="i-file" type="file" accept={kind === "video" ? "video/*" : "image/*"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : null}
      {kind === "video" || kind === "link" ? (
        <div className="field">
          <label className="label" htmlFor="i-url">{kind === "video" ? "…or paste a video link (YouTube etc.)" : "Link"}</label>
          <input id="i-url" className="input" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      ) : null}
      <div className="field">
        <label className="label" htmlFor="i-body">{kind === "text" ? "Notes" : "Short description (optional)"}</label>
        <textarea id="i-body" className="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim()} onClick={save}>
        {busy ? "Saving…" : "Add"}
      </button>
    </Sheet>
  );
}

interface DraftQuestion {
  prompt: string;
  options: string[];
  correct: number;
}

function QuizForm({ module, onClose, onSaved }: { module: Module; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(`${module.title} check`);
  const [passMark, setPassMark] = useState(60);
  const [publish, setPublish] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ prompt: "", options: ["", "", ""], correct: 0 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, q: Partial<DraftQuestion>) =>
    setQuestions(questions.map((x, j) => (j === i ? { ...x, ...q } : x)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const clean = questions
        .map((q) => ({ ...q, prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()) }))
        .filter((q) => q.prompt);
      if (!clean.length) throw new Error("Add at least one question.");
      for (const q of clean) {
        if (q.options.filter(Boolean).length < 2) throw new Error(`"${q.prompt}" needs at least two answers.`);
        if (!q.options[q.correct]) throw new Error(`Pick the correct answer for "${q.prompt}".`);
      }
      const quiz = unwrap(
        await supabase.from("quizzes").insert({ module_id: module.id, title: title.trim(), pass_mark: passMark, published: false }).select().single(),
      ) as Quiz;
      for (const [qi, q] of clean.entries()) {
        const qRow = unwrap(
          await supabase.from("quiz_questions").insert({ quiz_id: quiz.id, prompt: q.prompt, position: qi }).select().single(),
        ) as { id: string };
        const opts = q.options
          .map((label, position) => ({ label, position, isCorrect: position === q.correct }))
          .filter((o) => o.label);
        const inserted = unwrap(
          await supabase
            .from("quiz_options")
            .insert(opts.map((o) => ({ question_id: qRow.id, label: o.label, position: o.position })))
            .select(),
        ) as { id: string; position: number }[];
        const correct = inserted.find((o) => o.position === q.correct)!;
        unwrap(await supabase.from("quiz_answer_keys").insert({ question_id: qRow.id, correct_option_id: correct.id }));
      }
      if (publish) unwrap(await supabase.from("quizzes").update({ published: true }).eq("id", quiz.id));
      haptic("success");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="New quiz" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="q-title">Quiz title</label>
        <input id="q-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="q-pass">Pass mark: {passMark}%</label>
        <input id="q-pass" type="range" min={0} max={100} step={5} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))} style={{ accentColor: "var(--sage)" }} />
      </div>

      {questions.map((q, i) => (
        <fieldset key={i} className="card" style={{ margin: 0 }}>
          <legend className="eyebrow" style={{ padding: 0 }}>Question {i + 1}</legend>
          <label className="sr-only" htmlFor={`qp-${i}`}>Question {i + 1}</label>
          <input id={`qp-${i}`} className="input" placeholder="What does a vocal high-pass filter cut?" value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
          {q.options.map((o, oi) => (
            <div key={oi} className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name={`correct-${i}`}
                checked={q.correct === oi}
                onChange={() => update(i, { correct: oi })}
                aria-label={`Answer ${oi + 1} is correct`}
                style={{ width: 20, height: 20, accentColor: "var(--sage)" }}
              />
              <label className="sr-only" htmlFor={`qo-${i}-${oi}`}>Answer {oi + 1}</label>
              <input
                id={`qo-${i}-${oi}`}
                className="input grow"
                placeholder={`Answer ${oi + 1}`}
                value={o}
                onChange={(e) => update(i, { options: q.options.map((x, j) => (j === oi ? e.target.value : x)) })}
              />
            </div>
          ))}
          <div className="row">
            {q.options.length < 6 ? (
              <button className="chip chip--sm" onClick={() => update(i, { options: [...q.options, ""] })}>+ Answer</button>
            ) : null}
            {questions.length > 1 ? (
              <button className="chip chip--sm" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove question</button>
            ) : null}
          </div>
          <span className="tiny muted">Tick the circle next to the correct answer.</span>
        </fieldset>
      ))}
      <button className="btn btn--ghost btn--block" onClick={() => setQuestions([...questions, { prompt: "", options: ["", "", ""], correct: 0 }])}>
        + Add question
      </button>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--sage)" }} />
        Publish straight away
      </label>
      <ErrorNote error={error} />
      <button className="btn btn--primary btn--block" disabled={busy || !title.trim()} onClick={save}>
        {busy ? "Saving…" : "Save quiz"}
      </button>
    </Sheet>
  );
}
