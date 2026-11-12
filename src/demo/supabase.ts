// DEMO MODE ONLY (npm run dev:demo / build:demo). Replaces src/lib/supabase.ts
// with an in-memory stand-in so both apps run on sample data with no backend.
// It copies the important "who can see what" rules from the database, so
// switching between trainee, trainer and Head shows what each really sees.
// Nothing here is used by the real app.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const isConsole = document.documentElement.dataset.app === "console";
export const supabaseConfigured = true;
export const functionsUrl = "https://demo.invalid/functions/v1";
export const anonKeyValue = "demo";

// ---------------------------------------------------------------------------
// Who you are in the demo
// ---------------------------------------------------------------------------

const PERSONAS = [
  { id: "u-sofia", label: "Sofia · Trainee", app: "miniapp" },
  { id: "u-marcus", label: "Marcus · Trainer, Head of Band", app: "both" },
  { id: "u-joel", label: "Joel · Trainer, Head of Production", app: "both" },
  { id: "u-priya", label: "Priya · Admin", app: "both" },
  { id: "u-jamie", label: "Jamie · Head of Dept", app: "both" },
] as const;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

const DB_KEY = "ttt-demo-data-v2";
const personaKey = isConsole ? "ttt-demo-console-as" : "ttt-demo-as";
const allowed = PERSONAS.filter((p) => !isConsole || p.app === "both").map((p) => p.id as string);
let ME: string = stored(personaKey) ?? (isConsole ? "u-jamie" : "u-sofia");
if (!allowed.includes(ME)) ME = allowed[allowed.length - 1]!;
let consoleSignedIn = stored("ttt-demo-console-in") === "1";

// The viewer's frame in a shared preview blocks confirm(); say yes in the demo.
window.confirm = () => true;

function demoBar() {
  const bar = document.createElement("div");
  bar.className = "demo-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Demo");
  const options = PERSONAS.filter((p) => allowed.includes(p.id))
    .map((p) => `<option value="${p.id}"${p.id === ME ? " selected" : ""}>${p.label}</option>`)
    .join("");
  const other = isConsole
    ? `<a href="../index.html">Open the mini app</a>`
    : `<a href="console/index.html">Open the leaders' web console</a>`;
  bar.innerHTML = `<span><strong>Demo</strong> · sample data, saved only in this browser</span>
    <label>Viewing as <select aria-label="Viewing as">${options}</select></label>${other}
    <a href="#" data-reset>Reset sample data</a>`;
  bar.querySelector("[data-reset]")!.addEventListener("click", (e) => {
    e.preventDefault();
    store(DB_KEY, null);
    location.reload();
  });
  bar.querySelector("select")!.addEventListener("change", (e) => {
    store(personaKey, (e.target as HTMLSelectElement).value);
    location.reload();
  });
  const style = document.createElement("style");
  style.textContent = `.demo-bar{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;
    padding:7px 16px;background:#1c1c1a;color:#f7f7f5;font:600 12px/1.3 Manrope,system-ui,sans-serif}
    .demo-bar a{color:#dde6db;text-decoration:underline;text-underline-offset:2px}
    .demo-bar select{margin-left:6px;font:inherit;color:#1c1c1a;background:#f7f7f5;border:none;border-radius:999px;padding:3px 8px}`;
  document.head.appendChild(style);
  document.body.prepend(bar);
  const fit = () => document.documentElement.style.setProperty("--demo-bar-h", `${bar.offsetHeight}px`);
  fit();
  window.addEventListener("resize", fit);
}
if (document.body) demoBar();
else document.addEventListener("DOMContentLoaded", demoBar);

// ---------------------------------------------------------------------------
// Sample worship team
// ---------------------------------------------------------------------------

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
const dayAgo = (days: number) => ago(days).slice(0, 10);
const G = { teens: "g1", youth: "g2", young: "g3", adult: "g4" };

const svg = (bg: string, fg: string, label: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect width="800" height="560" fill="${bg}"/><circle cx="400" cy="250" r="110" fill="${fg}" opacity=".35"/><circle cx="400" cy="250" r="60" fill="${fg}" opacity=".6"/><text x="400" y="470" font-family="sans-serif" font-size="34" fill="${fg}" text-anchor="middle">${label}</text></svg>`,
  );

const person = (
  id: string, name: string, role: string, group: string | null, trainer: string | null, joinedDaysAgo: number,
  vision: string | null = null, growing: string | null = null, username: string | null = null,
) => ({
  id, telegram_id: Math.floor(Math.random() * 1e9), display_name: name, username: username ?? name.split(" ")[0]!.toLowerCase(),
  photo_url: null, role, age_group_id: group, trainer_id: trainer, created_at: ago(joinedDaysAgo),
  vision, growing_in: growing, profile_updated_at: vision ? ago(3) : null,
});

const STEPS: [string, string][] = [
  ["Welcome to the team", "Meet your trainer, join the team chat and get to know how we serve together."],
  ["Heart of worship", "Foundations: why we worship, our team values, and what serving on a Sunday asks of us."],
  ["Shadow a service", "Sit in with your section at a rehearsal and a Sunday service. Watch, listen and ask questions."],
  ["First rehearsal", "Play or sing your part with the full band at a midweek rehearsal."],
  ["First Sunday", "Serve on the roster for your first Sunday service."],
  ["Serving regularly", "On the roster most months. You come prepared, on time and ready to help."],
  ["Growing in your craft", "Go deeper: dynamics, arrangements, in-ear mixes and leading moments in a set."],
  ["Leading and raising others", "Lead your section at rehearsal and walk alongside newer members."],
];

const progress: Row[] = [];
const signOff = (who: string, upTo: number, by: string, startDaysAgo: number, current?: string) => {
  for (let i = 1; i <= upTo; i++) {
    const d = Math.round((startDaysAgo * (upTo + 1 - i)) / (upTo + 1));
    progress.push({ profile_id: who, step_id: `s${i}`, status: "done", note: null, done_on: dayAgo(Math.max(1, d)), updated_by: by, updated_at: ago(Math.max(1, d)) });
  }
  if (current) progress.push({ profile_id: who, step_id: `s${upTo + 1}`, status: "in_progress", note: current, done_on: null, updated_by: by, updated_at: ago(2) });
};
signOff("u-sofia", 3, "u-marcus", 95, "Midweek rehearsal on Thursday. Prepare “Way Maker” and “Goodness of God”, and bring your own sticks.");
progress.find((p) => p.profile_id === "u-sofia" && p.step_id === "s3")!.note = "Great questions after the service. You noticed how the drums drop out for the bridge!";
signOff("u-aiden", 1, "u-marcus", 21, "Join the team values session this Saturday.");
signOff("u-grace", 6, "u-marcus", 330, "Working on arrangements and calling the band through a set.");
signOff("u-ravi", 4, "u-joel", 120);
signOff("u-hannah", 2, "u-joel", 50, "Shadow the keys player at the 9am service.");
signOff("u-marcus", 7, "u-jamie", 900, "Leading the drum section at rehearsals, and mentoring Sofia and Aiden.");
signOff("u-joel", 8, "u-jamie", 1000);
signOff("u-priya", 8, "u-jamie", 1100);

const db: Record<string, Row[]> = {
  age_groups: [
    { id: G.teens, label: "13–15", sort_order: 1 },
    { id: G.youth, label: "16–19", sort_order: 2 },
    { id: G.young, label: "20–24", sort_order: 3 },
    { id: G.adult, label: "25–40", sort_order: 4 },
  ],
  profiles: [
    person("u-jamie", "Jamie Tan", "head", G.adult, null, 1200, "To build a worship team where every young person finds their place and grows into a leader.", "Delegating more, and coaching our trainers well."),
    person("u-priya", "Priya Nair", "admin", G.adult, "u-jamie", 1100, "Help the team run smoothly so the musicians can focus on worship.", "Planning rosters further ahead."),
    person("u-marcus", "Marcus Lee", "trainer", G.young, "u-jamie", 900, "Raise up a new generation of drummers who serve with excellence and humility.", "Teaching beginners with more patience."),
    person("u-joel", "Joel Lim", "trainer", G.young, "u-jamie", 1000, "A production team that makes the room feel effortless.", "Live mixing for bigger events."),
    person("u-sofia", "Sofia Lim", "trainee", G.youth, "u-marcus", 100, "I want to play drums on Sundays and one day lead the band at youth services. I dream of writing songs with the team too.", "Playing steady with a click, and confidence to play at full volume.", "sofia.drums"),
    person("u-aiden", "Aiden Koh", "trainee", G.youth, "u-marcus", 25, "Play guitar on the worship team with my friends.", "Faster chord changes and strumming patterns."),
    person("u-grace", "Grace Wong", "trainee", G.young, "u-marcus", 340, "Lead worship and help younger vocalists find their voice.", "Leading the band through a set and reading the room."),
    person("u-ravi", "Ravi Kumar", "trainee", G.youth, "u-joel", 125, "Run front of house for a whole service on my own.", "Mixing vocals so every word is clear."),
    person("u-hannah", "Hannah Teo", "trainee", G.teens, "u-joel", 55, null, null),
    person("u-mei", "Mei Chen", "trainee", null, null, 0.2, null, null, "meichen"),
    person("u-daniel", "Daniel Ong", "trainee", null, null, 0.03, null, null, "danielong"),
  ],
  // Serving roles (kind "instrument"), levels and private notes.
  tags: [
    ["t1", "Drummer", "instrument", "d-band"], ["t2", "Guitarist", "instrument", "d-band"], ["t3", "Bassist", "instrument", "d-band"],
    ["t4", "Keys", "instrument", "d-band"], ["t5", "Vocalist", "instrument", "d-vocals"], ["t10", "Worship Leader", "instrument", "d-vocals"],
    ["t6", "Sound Engineer", "instrument", "d-prod"], ["t11", "Media & Slides", "instrument", "d-media"],
    ["t7", "Beginner", "level", null], ["t8", "Intermediate", "level", null], ["t9", "Advanced", "level", null],
    ["t12", "Needs a mentor", "general", null],
  ].map(([id, label, kind, department_id]) => ({ id, label, kind, department_id, description: null })),
  departments: [
    { id: "d-band", name: "Band", description: "Drums, guitars, bass and keys", sort_order: 1, created_at: ago(300) },
    { id: "d-vocals", name: "Vocals", description: "Worship leaders and singers", sort_order: 2, created_at: ago(300) },
    { id: "d-prod", name: "Production", description: "Sound, lights and live stream", sort_order: 3, created_at: ago(300) },
    { id: "d-media", name: "Media", description: "Slides, visuals and social", sort_order: 4, created_at: ago(200) },
  ],
  department_members: [
    ["d-band", "u-marcus", true], ["d-band", "u-sofia", false], ["d-band", "u-aiden", false], ["d-band", "u-hannah", false],
    ["d-vocals", "u-priya", true], ["d-vocals", "u-grace", false],
    ["d-prod", "u-joel", true], ["d-prod", "u-ravi", false],
  ].map(([department_id, profile_id, is_head]) => ({ department_id, profile_id, is_head, added_by: "u-jamie", added_at: ago(200) })),
  access_levels: [
    { role: "trainee", label: "Trainee", description: "Everyone on the team: their own journey, community, lessons and feedback." },
    { role: "trainer", label: "Trainer", description: "Looks after their own trainees: journeys, feedback and lessons." },
    { role: "admin", label: "Admin", description: "Places people and looks after everyone's journeys." },
    { role: "head", label: "Head of Dept", description: "Runs the whole team: roles, departments, roadmap, team setup, console access and the change log." },
  ],
  profile_tags: [
    ["u-sofia", "t1"], ["u-sofia", "t8"], ["u-aiden", "t2"], ["u-aiden", "t7"], ["u-grace", "t5"], ["u-grace", "t9"],
    ["u-grace", "t10"], ["u-ravi", "t6"], ["u-ravi", "t8"], ["u-hannah", "t4"], ["u-hannah", "t7"], ["u-marcus", "t1"],
    ["u-joel", "t6"], ["u-jamie", "t10"], ["u-jamie", "t5"], ["u-aiden", "t12"],
  ].map(([profile_id, tag_id]) => ({ profile_id, tag_id })),
  roadmap_steps: [
    ...STEPS.map(([title, description], i) => ({ id: `s${i + 1}`, profile_id: null, title, description, position: i + 1, created_by: "u-jamie", created_at: ago(400) })),
    { id: "p-sofia", profile_id: "u-sofia", title: "Play to a click with in-ears", description: "Get comfortable with the click track and your own in-ear mix before your first Sunday.", position: 4, created_by: "u-marcus", created_at: ago(20) },
    { id: "p-grace", profile_id: "u-grace", title: "Lead worship at a youth service", description: "Plan a four-song set with Marcus and lead the band through it.", position: 8, created_by: "u-marcus", created_at: ago(40) },
  ],
  roadmap_progress: progress,
  accomplishments: [
    { id: "a1", profile_id: "u-sofia", title: "Played drums at youth night", note: "Solid groove all night and locked in with the bass. Well done!", achieved_on: dayAgo(12), created_by: "u-marcus", created_at: ago(12) },
    { id: "a2", profile_id: "u-sofia", title: "Finished the Worship Band Foundations course", note: null, achieved_on: dayAgo(41), created_by: "u-marcus", created_at: ago(41) },
    { id: "a3", profile_id: "u-grace", title: "Mentored two new vocalists", note: "Took Hannah and Mei through warm-ups every week.", achieved_on: dayAgo(8), created_by: "u-marcus", created_at: ago(8) },
    { id: "a4", profile_id: "u-grace", title: "Led worship for the first time", note: "Youth service, four songs. The room was with you.", achieved_on: dayAgo(26), created_by: "u-jamie", created_at: ago(26) },
    { id: "a5", profile_id: "u-grace", title: "Sang harmony at the Easter service", note: null, achieved_on: dayAgo(220), created_by: "u-marcus", created_at: ago(220) },
    { id: "a6", profile_id: "u-ravi", title: "Ran monitors for a Sunday service", note: "Every musician said they could hear themselves. Great job.", achieved_on: dayAgo(10), created_by: "u-joel", created_at: ago(10) },
    { id: "a7", profile_id: "u-aiden", title: "Learned G, C and D chords", note: null, achieved_on: dayAgo(6), created_by: "u-marcus", created_at: ago(6) },
    { id: "a8", profile_id: "u-marcus", title: "Trained three new drummers this year", note: null, achieved_on: dayAgo(30), created_by: "u-jamie", created_at: ago(30) },
  ],
  console_access: [
    { profile_id: "u-jamie", email: "jamie.tan@gmail.com", login_user_id: "l1", granted_by: "u-jamie", granted_at: ago(60) },
    { profile_id: "u-priya", email: "priya.nair@gmail.com", login_user_id: "l2", granted_by: "u-jamie", granted_at: ago(45) },
    { profile_id: "u-marcus", email: "marcuslee.drums@gmail.com", login_user_id: "l3", granted_by: "u-jamie", granted_at: ago(30) },
  ],
  audit_log: [
    { id: 9, actor_id: "u-marcus", action: "roadmap_step_updated", target_id: "u-sofia", details: { step: "First rehearsal", status: "in_progress" }, created_at: ago(2) },
    { id: 8, actor_id: "u-marcus", action: "accomplishment_added", target_id: "u-aiden", details: { title: "Learned G, C and D chords" }, created_at: ago(6) },
    { id: 7, actor_id: "u-marcus", action: "accomplishment_added", target_id: "u-grace", details: { title: "Mentored two new vocalists" }, created_at: ago(8) },
    { id: 6, actor_id: "u-joel", action: "accomplishment_added", target_id: "u-ravi", details: { title: "Ran monitors for a Sunday service" }, created_at: ago(10) },
    { id: 5, actor_id: "u-marcus", action: "accomplishment_added", target_id: "u-sofia", details: { title: "Played drums at youth night" }, created_at: ago(12) },
    { id: 4, actor_id: "u-jamie", action: "assign_member", target_id: "u-aiden", details: {}, created_at: ago(24) },
    { id: 3, actor_id: "u-jamie", action: "console_access_granted", target_id: "u-marcus", details: { email: "marcuslee.drums@gmail.com" }, created_at: ago(30) },
    { id: 2, actor_id: "u-jamie", action: "console_access_granted", target_id: "u-priya", details: { email: "priya.nair@gmail.com" }, created_at: ago(45) },
    { id: 1, actor_id: "u-jamie", action: "assign_member", target_id: "u-hannah", details: {}, created_at: ago(54) },
  ],
  posts: [
    { id: "p1", author_id: "u-jamie", age_group_id: G.youth, channel: "general", body: "This Sunday's set: Way Maker (E), Goodness of God (A), Build My Life (G). Band rehearsal Thursday 7.30pm 🙌", media_path: null, media_kind: null, created_at: ago(0.05) },
    { id: "p2", author_id: "u-marcus", age_group_id: G.youth, channel: "drums", body: "Practice tip of the week: play the groove at 60 bpm for five minutes before you speed up. Slow is smooth, smooth is fast 🥁", media_path: null, media_kind: null, created_at: ago(0.3) },
    { id: "p3", author_id: "u-sofia", age_group_id: G.youth, channel: "drums", body: "Finally nailed the fill into the bridge of Way Maker! Feedback welcome", media_path: "g2/fill.webm", media_kind: "audio", created_at: ago(1) },
    { id: "p4", author_id: "u-ravi", age_group_id: G.youth, channel: "live-sound", body: "Stage set for Sunday. First time running monitors on my own!", media_path: "g2/stage.jpg", media_kind: "image", created_at: ago(3) },
    { id: "p5", author_id: "u-aiden", age_group_id: G.youth, channel: "guitar", body: "Any tips for switching from G to C faster? My fingers keep getting stuck.", media_path: null, media_kind: null, created_at: ago(5) },
  ],
  post_reactions: [
    ["p1", "u-sofia"], ["p1", "u-aiden"], ["p1", "u-ravi"], ["p2", "u-sofia"], ["p2", "u-aiden"], ["p3", "u-marcus"], ["p3", "u-jamie"], ["p4", "u-joel"],
  ].map(([post_id, profile_id]) => ({ post_id, profile_id })),
  post_comments: [
    { id: "c1", post_id: "p3", author_id: "u-marcus", body: "Clean! Watch the left hand on the last beat, it rushes a little.", created_at: ago(0.9) },
    { id: "c2", post_id: "p3", author_id: "u-sofia", body: "Thanks, will slow it down 🙏", created_at: ago(0.8) },
    { id: "c3", post_id: "p5", author_id: "u-marcus", body: "Keep your ring finger planted on the B string. It's the pivot for both chords.", created_at: ago(4) },
  ],
  courses: [
    { id: "co1", title: "Worship Band Foundations", description: "Playing together: listening, dynamics and following the worship leader.", age_group_id: null, published: true, created_by: "u-marcus", created_at: ago(300) },
    { id: "co2", title: "Sound Desk 101", description: "Gain staging, monitors and mixing a Sunday service.", age_group_id: null, published: true, created_by: "u-joel", created_at: ago(200) },
    { id: "co3", title: "Vocals: Harmony Basics", description: "Finding thirds and fifths, and blending with the lead.", age_group_id: null, published: false, created_by: "u-marcus", created_at: ago(10) },
  ],
  modules: [
    { id: "m1", course_id: "co1", title: "Listening as a band", position: 0 },
    { id: "m2", course_id: "co1", title: "Dynamics in a worship set", position: 1 },
    { id: "m3", course_id: "co2", title: "The signal chain", position: 0 },
  ],
  lesson_items: [
    { id: "i1", module_id: "m1", kind: "video", title: "Following the worship leader's cues", url: null, storage_path: "co1/cues.mp4", body: null, position: 0 },
    { id: "i2", module_id: "m1", kind: "text", title: "Before every rehearsal", url: null, storage_path: null, body: "1. Listen to the set list twice.\n2. Note the key and tempo of each song.\n3. Mark the dynamics: where it builds, where it drops.\n4. Arrive 15 minutes early to set up.", position: 1 },
    { id: "i3", module_id: "m2", kind: "photo", title: "Dynamics map of a typical set", url: null, storage_path: "co1/dynamics.jpg", body: null, position: 0 },
    { id: "i4", module_id: "m3", kind: "text", title: "Mic → preamp → EQ → fader", url: null, storage_path: null, body: "Every channel follows the same path. Set gain first, then EQ, then the fader.", position: 0 },
  ],
  lesson_progress: [{ profile_id: "u-sofia", item_id: "i1" }],
  quizzes: [{ id: "q1", module_id: "m2", title: "Dynamics check", pass_mark: 2, published: true, created_at: ago(100) }],
  quiz_questions: [
    { id: "qq1", quiz_id: "q1", prompt: "The worship leader raises a hand during the bridge. What usually comes next?", position: 0 },
    { id: "qq2", quiz_id: "q1", prompt: "Where does a set usually build the most?", position: 1 },
    { id: "qq3", quiz_id: "q1", prompt: "What should drums do in a quiet verse?", position: 2 },
  ],
  quiz_options: [
    ["o1", "qq1", "A build into the final chorus", 0, true], ["o2", "qq1", "The song ends", 1], ["o3", "qq1", "A key change down", 2],
    ["o4", "qq2", "The last chorus or bridge", 0, true], ["o5", "qq2", "The first verse", 1],
    ["o6", "qq3", "Play lighter or stop", 0, true], ["o7", "qq3", "Play the full kit", 1],
  ].map(([id, question_id, label, position, correct]) => ({ id, question_id, label, position, _correct: Boolean(correct) })),
  submissions: [
    { id: "sb1", trainee_id: "u-sofia", title: "Bridge fill for Way Maker", storage_path: "u-sofia/submissions/fill.webm", media_kind: "audio", note: "Not sure about the last bar", created_at: ago(2) },
    { id: "sb2", trainee_id: "u-aiden", title: "G–C–D strumming", storage_path: "u-aiden/submissions/strum.mp4", media_kind: "video", note: null, created_at: ago(4) },
  ],
  feedback_messages: [
    { id: "f1", submission_id: "sb1", author_id: "u-marcus", body: "Great progress! Your right hand is steady. At 0:32 the left hand rushes a bit, so try it with a metronome at 80.", voice_path: null, timestamps: [{ at: 32 }], rubric: { Timing: 3, Dynamics: 4, Feel: 4 }, created_at: ago(1.5) },
  ],
  practice_sessions: [],
  quiz_attempts: [],
};

// The mini app and the web console share this data through the browser's
// storage, the way the real apps share one database: a change made as a Head
// in the console shows up in the mini app (straight away when you switch to
// it, or within 30 seconds if it's already open).
function loadSaved() {
  const raw = stored(DB_KEY);
  if (!raw) return;
  try {
    Object.assign(db, JSON.parse(raw));
  } catch {
    /* unreadable saved data: keep the fresh sample */
  }
}
const saveDb = () => store(DB_KEY, JSON.stringify(db));
loadSaved();
window.addEventListener("storage", (e) => {
  if (e.key !== DB_KEY) return;
  if (e.newValue === null) location.reload();
  else loadSaved();
});

// ---------------------------------------------------------------------------
// The database rules, in miniature (see supabase/migrations)
// ---------------------------------------------------------------------------

const profileOf = (id: string | null | undefined) => db.profiles!.find((p) => p.id === id);
const myRole = () => profileOf(ME)?.role as string | undefined;
const isHead = () => myRole() === "head";
const isAdmin = () => myRole() === "admin" || isHead();
const isStaff = () => myRole() === "trainer" || isAdmin();
const myGroup = () => profileOf(ME)?.age_group_id ?? null;
const deptRows = () => db.department_members ?? [];
const inDept = (dept: string) => deptRows().some((m) => m.department_id === dept && m.profile_id === ME);
const headsDept = (dept: string) => isStaff() && deptRows().some((m) => m.department_id === dept && m.profile_id === ME && m.is_head);
// A department Head looks after the trainees and trainers in their department.
const leadsMember = (member: string) =>
  member !== ME &&
  ["trainee", "trainer"].includes(profileOf(member)?.role) &&
  deptRows().some((m) => m.profile_id === member && headsDept(m.department_id));
const canView = (member: string) => member === ME || isAdmin() || profileOf(member)?.trainer_id === ME || leadsMember(member);
const canManage = (member: string) =>
  isHead() || (member !== ME && (isAdmin() || profileOf(member)?.trainer_id === ME || leadsMember(member)));
const unplacedTrainee = (id: string) => {
  const p = profileOf(id);
  return Boolean(p && !p.age_group_id && p.role === "trainee");
};
const submissionOwner = (id: string) => db.submissions!.find((s) => s.id === id)?.trainee_id;

const readable: Record<string, (r: Row) => boolean> = {
  profiles: (r) => r.id === ME || isAdmin() || r.trainer_id === ME || leadsMember(r.id) || (isStaff() && unplacedTrainee(r.id)),
  department_members: (r) =>
    r.profile_id === ME || isAdmin() || headsDept(r.department_id) || (r.is_head && inDept(r.department_id)) || canView(r.profile_id),
  // Leaders read every tag; people read their own instrument and level tags.
  tags: (r) => isStaff() || (r.kind !== "general" && db.profile_tags!.some((pt) => pt.tag_id === r.id && pt.profile_id === ME)),
  profile_tags: (r) => canView(r.profile_id) || (isStaff() && unplacedTrainee(r.profile_id)),
  posts: (r) => isStaff() || r.age_group_id === myGroup(),
  roadmap_steps: (r) => r.profile_id === null || canView(r.profile_id),
  roadmap_progress: (r) => canView(r.profile_id),
  accomplishments: (r) => canView(r.profile_id),
  lesson_progress: (r) => canView(r.profile_id),
  practice_sessions: (r) => canView(r.profile_id),
  submissions: (r) => canView(r.trainee_id),
  feedback_messages: (r) => canView(submissionOwner(r.submission_id) ?? ""),
  audit_log: () => isHead(),
  console_access: (r) => isHead() || r.profile_id === ME,
  courses: (r) => isStaff() || r.published,
};

const writable: Record<string, (r: Row) => boolean> = {
  roadmap_progress: (r) => canManage(r.profile_id),
  accomplishments: (r) => canManage(r.profile_id),
  roadmap_steps: (r) => (r.profile_id === null ? isHead() : canManage(r.profile_id)),
  profiles: (r) => r.id === ME,
  console_access: () => false,
  audit_log: () => false,
  departments: () => isHead(),
  department_members: (r) => isHead() || (isAdmin() && !r.is_head),
  access_levels: () => isHead(),
  age_groups: () => isAdmin(),
  tags: () => isStaff(),
};

/** The database's checks that run before a write (see the *_team_setup.sql triggers). */
function refuse(table: string, op: string, r: Row): string | null {
  if (table === "department_members" && r.is_head && !["trainer", "admin", "head"].includes(profileOf(r.profile_id)?.role)) {
    return "Make this person a trainer or higher before making them a department Head";
  }
  if (table === "age_groups" && op === "DELETE" && (db.profiles!.some((p) => p.age_group_id === r.id) || db.posts!.some((p) => p.age_group_id === r.id))) {
    return "This age group still has people or posts. Rename it, or move everyone out first.";
  }
  return null;
}

function rowsOf(table: string): Row[] {
  if (table === "member_directory") {
    return db.profiles!
      .filter((p) => p.id === ME || isStaff() || (p.age_group_id && p.age_group_id === myGroup()) || p.role !== "trainee")
      .map(({ id, display_name, photo_url, role }) => ({ id, display_name, photo_url, role }));
  }
  const rows = (db[table] ??= []);
  const rule = readable[table];
  return rule ? rows.filter(rule) : rows;
}

function log(action: string, target: string, details: Row) {
  const id = Math.max(0, ...db.audit_log!.map((r) => r.id)) + 1;
  db.audit_log!.unshift({ id, actor_id: ME, action, target_id: target, details, created_at: new Date().toISOString() });
}

const DENIED = { message: "You don't have permission to do that." };

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: [string, boolean][] = [];
  private max = Infinity;
  private one: "single" | "maybe" | null = null;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private conflict: string[] = ["id"];
  constructor(private table: string) {}
  select() { return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o?: { onConflict?: string }) { this.op = "upsert"; this.payload = p; if (o?.onConflict) this.conflict = o.onConflict.split(","); return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }

  private run(): { data: any; error: any } {
    const t = this.table;
    const all = (db[t] ??= []);
    const visible = rowsOf(t);
    const match = (r: Row) => this.filters.every((f) => f(r));
    const canWrite = writable[t] ?? (() => isStaff() || t.startsWith("post") || t === "lesson_progress" || t === "practice_sessions" || t === "submissions" || t === "feedback_messages");
    let out: Row[];

    if (this.op === "insert" || this.op === "upsert") {
      const items: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ ...p }));
      out = [];
      for (const item of items) {
        const existing = this.op === "upsert" ? all.find((r) => this.conflict.every((k) => r[k] === item[k])) : undefined;
        const row = this.complete(item, existing);
        if (!canWrite(row)) return { data: null, error: DENIED };
        const no = refuse(t, "INSERT", row);
        if (no) return { data: null, error: { message: no } };
        if (existing) Object.assign(existing, row);
        else all.push(row);
        out.push(row);
        this.afterWrite(existing ? "UPDATE" : "INSERT", row);
      }
    } else if (this.op === "update") {
      out = visible.filter(match);
      if (out.some((r) => !canWrite(r) || !canWrite({ ...r, ...this.payload }))) return { data: null, error: DENIED };
      const no = out.map((r) => refuse(t, "UPDATE", { ...r, ...this.payload })).find(Boolean);
      if (no) return { data: null, error: { message: no } };
      out.forEach((r) => {
        if (t === "profiles" && ("vision" in this.payload || "growing_in" in this.payload)) r.profile_updated_at = new Date().toISOString();
        Object.assign(r, this.payload);
        this.afterWrite("UPDATE", r);
      });
    } else if (this.op === "delete") {
      out = visible.filter(match);
      if (out.some((r) => !canWrite(r))) return { data: null, error: DENIED };
      const no = out.map((r) => refuse(t, "DELETE", r)).find(Boolean);
      if (no) return { data: null, error: { message: no } };
      db[t] = all.filter((r) => !out.includes(r));
      if (t === "departments") db.department_members = deptRows().filter((m) => out.every((d) => d.id !== m.department_id));
      if (t === "tags") db.profile_tags = db.profile_tags!.filter((pt) => out.every((x) => x.id !== pt.tag_id));
      out.forEach((r) => this.afterWrite("DELETE", r));
      if (t === "roadmap_steps") db.roadmap_progress = db.roadmap_progress!.filter((p) => out.every((s) => s.id !== p.step_id));
    } else {
      out = visible.filter(match);
      for (const [c, asc] of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      out = out.slice(0, this.max).map((r) => ({ ...r }));
    }

    if (this.op !== "select") saveDb();
    if (this.one) {
      if (out[0]) return { data: out[0], error: null };
      return this.one === "maybe" ? { data: null, error: null } : { data: null, error: { message: "Not found" } };
    }
    return { data: out, error: null };
  }

  /** Column defaults and the before-insert triggers. */
  private complete(item: Row, existing?: Row): Row {
    const stamp = new Date().toISOString();
    const row: Row = { ...(existing ?? {}), ...item };
    row.id ??= crypto.randomUUID();
    row.created_at ??= stamp;
    if (this.table === "roadmap_progress") {
      row.updated_at = stamp;
      row.updated_by = ME;
      row.note ??= null;
      if (row.status === "done") row.done_on ??= stamp.slice(0, 10);
      else row.done_on = null;
    }
    if (["accomplishments", "roadmap_steps", "courses", "tags"].includes(this.table)) row.created_by ??= ME;
    if (["posts", "post_comments", "feedback_messages"].includes(this.table)) row.author_id ??= ME;
    if (["post_reactions", "lesson_progress", "practice_sessions"].includes(this.table)) row.profile_id ??= ME;
    if (this.table === "submissions") row.trainee_id ??= ME;
    if (this.table === "feedback_messages") row.timestamps ??= [];
    return row;
  }

  /** The change-log triggers. */
  private afterWrite(op: "INSERT" | "UPDATE" | "DELETE", r: Row) {
    if (this.table === "roadmap_progress") {
      const step = db.roadmap_steps!.find((s) => s.id === r.step_id)?.title;
      log(op === "DELETE" ? "roadmap_step_cleared" : "roadmap_step_updated", r.profile_id, { step, status: op === "DELETE" ? null : r.status });
    }
    if (this.table === "department_members") {
      const department = db.departments!.find((d) => d.id === r.department_id)?.name;
      const action = op === "INSERT" ? "department_member_added" : op === "DELETE" ? "department_member_removed" : "department_head_changed";
      log(action, r.profile_id, { department, is_head: r.is_head });
    }
    if (["departments", "access_levels", "tags", "age_groups"].includes(this.table)) {
      const area = { departments: "department", access_levels: "access level", age_groups: "age group" }[this.table as "departments"] ??
        ({ instrument: "serving role", level: "level" } as Row)[r.kind] ?? "private note";
      log("setup_changed", null as unknown as string, { area, op: { INSERT: "added", UPDATE: "changed", DELETE: "removed" }[op], name: r.name ?? r.label });
    }
    if (this.table === "accomplishments") {
      log({ INSERT: "accomplishment_added", UPDATE: "accomplishment_edited", DELETE: "accomplishment_removed" }[op], r.profile_id, { title: r.title });
    }
  }

  then<A, B>(ok?: (v: { data: any; error: any }) => A | PromiseLike<A>, bad?: (e: any) => B | PromiseLike<B>) {
    return new Promise<{ data: any; error: any }>((res) => setTimeout(() => res(this.run()), 60)).then(ok, bad);
  }
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const week = Array.from({ length: 7 }, (_, i) => ({ day: dayAgo(6 - i), minutes: [20, 0, 35, 45, 0, 30, 55][i]! }));

const rpcs: Record<string, (a: any) => { data: any; error: any }> = {
  get_practice_summary: () => ({ data: { week_minutes: week.reduce((s, d) => s + d.minutes, 0), days: week, streak: 2 }, error: null }),
  get_wrapped: (a) => ({
    data: {
      year: a.p_year, total_minutes: 6420, sessions: 148, longest_streak: 19, busiest_month: "August", first_session: `${a.p_year}-01-14`,
      quizzes_taken: 9, quizzes_passed: 8, lessons_completed: 34, feedback_received: 12, percentile_in_group: 85,
    },
    error: null,
  }),
  submit_quiz: (a) => {
    const qs = db.quiz_questions!.filter((q) => q.quiz_id === a.p_quiz);
    const results = qs.map((q) => {
      const correct = db.quiz_options!.find((o) => o.question_id === q.id && o._correct)!.id;
      const chosen = a.p_answers?.[q.id] ?? null;
      return { question_id: q.id, chosen_option_id: chosen, correct_option_id: correct, correct: chosen === correct };
    });
    const score = results.filter((r) => r.correct).length;
    const quiz = db.quizzes!.find((q) => q.id === a.p_quiz)!;
    return { data: { score, total: qs.length, passed: score >= quiz.pass_mark, results }, error: null };
  },
  can_manage_member: (a) => ({ data: canManage(a.member), error: null }),
  assign_member: (a) => {
    const target = profileOf(a.p_member);
    if (!target || !isStaff()) return { data: null, error: DENIED };
    const newRole = a.p_role ?? target.role;
    if (newRole !== target.role && !isHead()) return { data: null, error: { message: "Only the Head of Department can change roles" } };
    if (target.role === "head" && !isHead()) return { data: null, error: { message: "Only a Head of Department can change another Head of Department" } };
    if (myRole() === "trainer" && !leadsMember(a.p_member) && !(target.role === "trainee" && (!target.age_group_id || target.trainer_id === ME))) {
      return { data: null, error: { message: "Trainers can only assign unplaced members, their own trainees or their department" } };
    }
    Object.assign(target, { role: newRole, age_group_id: a.p_age_group, trainer_id: a.p_trainer });
    db.profile_tags = db.profile_tags!.filter((t) => t.profile_id !== a.p_member).concat(
      (a.p_tag_ids ?? []).map((tag_id: string) => ({ profile_id: a.p_member, tag_id })),
    );
    log("assign_member", a.p_member, {});
    saveDb();
    return { data: null, error: null };
  },
};

function consoleAccess(body: Row): { status: number; body: Row } {
  if (!isHead()) return { status: 403, body: { error: "Only a Head of Department can manage web console access." } };
  const existing = db.console_access!.find((r) => r.profile_id === body.profile_id);
  if (body.action === "revoke") {
    db.console_access = db.console_access!.filter((r) => r.profile_id !== body.profile_id);
    if (existing) log("console_access_revoked", body.profile_id, { email: existing.email });
    saveDb();
    return { status: 200, body: { ok: true } };
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, body: { error: "Enter a valid Google email address." } };
  if (db.console_access!.some((r) => r.email === email && r.profile_id !== body.profile_id)) {
    return { status: 409, body: { error: "That Google account is already linked to someone else." } };
  }
  db.console_access = db.console_access!.filter((r) => r.profile_id !== body.profile_id);
  db.console_access.push({ profile_id: body.profile_id, email, login_user_id: crypto.randomUUID(), granted_by: ME, granted_at: new Date().toISOString() });
  log("console_access_granted", body.profile_id, { email });
  saveDb();
  return { status: 200, body: { ok: true } };
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith(functionsUrl)) return realFetch(input, init);
  const name = url.slice(functionsUrl.length + 1);
  const reply = (status: number, body: Row) => new Response(JSON.stringify(body), { status });
  if (name === "telegram-auth" || name === "console-auth") return reply(200, { access_token: "demo", refresh_token: "demo" });
  if (name === "console-access") {
    const r = consoleAccess(JSON.parse(String(init?.body ?? "{}")));
    return reply(r.status, r.body);
  }
  return reply(404, { error: "Not found" });
};

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

const session = () => ({ access_token: "demo", refresh_token: "demo", user: { id: ME } });

export const supabase = {
  from: (t: string) => new Query(t),
  rpc: (fn: string, args: any) =>
    new Promise<{ data: any; error: any }>((res) => setTimeout(() => res(rpcs[fn]?.(args ?? {}) ?? { data: null, error: null }), 80)),
  auth: {
    getUser: async () => ({ data: { user: { id: ME } }, error: null }),
    getSession: async () => ({ data: { session: !isConsole || consoleSignedIn ? session() : null }, error: null }),
    setSession: async () => ({ data: { session: session() }, error: null }),
    signInWithOAuth: async () => {
      consoleSignedIn = true;
      store("ttt-demo-console-in", "1");
      location.reload();
      return { data: {}, error: null };
    },
    signOut: async () => {
      consoleSignedIn = false;
      store("ttt-demo-console-in", null);
      return { error: null };
    },
  },
  storage: {
    from: () => ({
      upload: async (path: string) => ({ data: { path }, error: null }),
      remove: async () => ({ data: [], error: null }),
      createSignedUrl: async (path: string) => ({
        data: {
          signedUrl: path.endsWith(".jpg") ? svg(path.includes("stage") ? "#2B2D42" : "#E6ECE3", path.includes("stage") ? "#F2C14E" : "#2E3F30", path.includes("stage") ? "Sunday stage" : "Dynamics map") : "",
        },
        error: null,
      }),
    }),
  },
};

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
