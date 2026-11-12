# TTT

An app for the worship team: everyone learning an instrument, vocals or live sound, their trainers, and the Heads of Department who look after the whole team.

There are two apps on one database:

- the **Telegram mini app**, for everyone (trainees, trainers, admins and Heads), and
- the **web console** at `/console/`, for trainers, admins and Heads of Department, who sign in with Google.

In the mini app:

- **Journey**: your road on the worship team. A roadmap that keeps going, with the steps your leaders have signed off and where you are now; your own dreams & vision and what you want to grow in (only you can edit these); and the accomplishments your leaders record for you.
- **Community**: a feed for each age group, with topics (drums, guitar, live sound…), likes, replies and audio/photo/video posts. Also shows a weekly practice card with a practice timer.
- **Learn**: courses made of modules. Trainers add videos, photos, links and notes, plus quizzes that are marked on the server.
- **Feedback**: trainees send a recording. Their trainer replies privately with text, voice notes, "at 0:32" moments you can tap to jump to, and a 1–5 rubric.
- **Wrapped**: a year-in-review story of your personal moments on the team: practice hours, longest streak, busiest month, quizzes passed, lessons finished and feedback received.
- **Members** (leaders): place new people in an age group, add tags (instrument, level, anything else), assign a trainer, and open someone's journey to sign off steps and record accomplishments. Every change is logged.

In the web console (leaders):

- **Overview**: where trainees are on the road, newcomers waiting to be placed, recent milestones.
- **People**: everyone you look after in one table, and each person's story, placement, roadmap and accomplishments.
- **Roadmap**: the general roadmap everyone walks (Heads edit it; leaders add personal steps per person).
- **Console access** and **Change log**: for Heads of Department only.

| Role | In short |
| --- | --- |
| Trainee | Their own journey, community, lessons, feedback |
| Trainer | Plus their own trainees' journeys, lessons and feedback |
| Admin | Plus everyone's journeys and placements |
| Head of Department | Plus roles, the general roadmap, web console access and the change log |

Privacy is enforced inside the database with row level security, so a bug in the app can't show private data to the wrong person. See [docs/SECURITY.md](docs/SECURITY.md).

## Tech

| Part | What it uses |
| --- | --- |
| Apps | React 18 + TypeScript + Vite: the mini app runs inside Telegram, the web console in any browser |
| Sign-in | Mini app: Telegram's signed launch data, checked by a Supabase Edge Function. Web console: Google, limited to accounts a Head of Department added |
| Data, files, rules | Supabase (Postgres, Storage, row level security) |
| Hosting | Any static host (Vercel, Netlify, Cloudflare Pages…) |

## Folder map

```
index.html             the Telegram mini app
console/index.html     the web console
src/
  App.tsx              mini app routes and sign-in states
  lib/                 supabase client, Telegram bridge, auth, journey, storage, types
  components/          icons, tab bar, roadmap, journey forms, players, sheets
  pages/               Community, Journey, Learn, Course, Quiz, Feedback,
                       FeedbackThread, Wrapped, Admin (members), Manage (lessons & quizzes)
  console/             web console: Google sign-in, overview, people, roadmap,
                       console access, change log
  demo/                sample data for `npm run dev:demo` (not used by the real apps)
  styles/              app.css (design tokens, the "row J" look), console.css
supabase/
  migrations/          tables → security rules → server functions → Heads & journey
  functions/
    telegram-auth/     verifies Telegram sign-in, returns a session
    console-auth/      swaps a Google sign-in for the leader's own session
    console-access/    lets a Head grant or remove web console access
docs/
  SETUP.md             step-by-step: bot, Supabase, Google, hosting, first Head
  SECURITY.md          who can see what, and how it's enforced
```

## Quick start

Follow **[docs/SETUP.md](docs/SETUP.md)** the first time. It takes about 20 minutes. After that:

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm run dev                  # mini app: http://localhost:5173, console: /console/
```

To show the team without a backend, run `npm run dev:demo`: both apps run on sample data, with a switch to view as a trainee, trainer, admin or Head. `npm run build:demo` builds the same thing into `dist-demo/`.

The mini app signs people in with Telegram, so to use it for real you open it from your bot inside Telegram. SETUP.md explains how to point the bot at your dev server or a deployed build.

## Working on it together

1. Create a branch for each change: `git checkout -b feature/practice-goals`.
2. Run `npm run typecheck` before pushing.
3. Open a pull request so a friend can review it.
4. Database changes go in a **new** file in `supabase/migrations/`, named with a later timestamp. Never edit a migration that has already been applied.
5. Never commit `.env.local`, the Supabase service role key, the bot token or the auth pepper.

## Not built yet

- Under-18 safeguards (still being planned): for example trainer-only messaging for minors, moderation queues, parental consent.
- Push notifications through the bot (e.g. "Aaron left you feedback").
- Editing existing lessons and quizzes (you can add, publish, unpublish and delete).
- Reporting a post.
- Each person's full roadmap structure: the general roadmap is a starting point for Heads of Department to replace and extend.
