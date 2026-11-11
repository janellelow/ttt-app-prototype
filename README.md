# TTT

A Telegram mini app where people learning an instrument or live sound connect with their trainers.

- **Community**: a feed for each age group, with topics (drums, guitar, live sound…), likes, replies and audio/photo/video posts. Also shows a weekly practice card with a practice timer.
- **Learn**: courses made of modules. Trainers add videos, photos, links and notes, plus quizzes that are marked on the server.
- **Feedback**: trainees send a recording. Their trainer replies privately with text, voice notes, "at 0:32" moments you can tap to jump to, and a 1–5 rubric.
- **Wrapped**: a year-in-review story with practice hours, longest streak, busiest month, quizzes passed, lessons finished and feedback received.
- **Members** (trainers and admins): place new people in an age group, add tags (instrument, level, anything else) and assign a trainer. Every change is logged.

Privacy is enforced inside the database with row level security, so a bug in the app can't show private data to the wrong person. See [docs/SECURITY.md](docs/SECURITY.md).

## Tech

| Part | What it uses |
| --- | --- |
| App | React 18 + TypeScript + Vite, running inside Telegram |
| Sign-in | Telegram's signed launch data, checked by a Supabase Edge Function |
| Data, files, rules | Supabase (Postgres, Storage, row level security) |
| Hosting | Any static host (Vercel, Netlify, Cloudflare Pages…) |

## Folder map

```
src/
  App.tsx              routes and sign-in states
  lib/                 supabase client, Telegram bridge, auth, storage, types
  components/          icons, tab bar, players, voice recorder, sheets
  pages/               Community, Learn, Course, Quiz, Feedback, FeedbackThread,
                       Wrapped, Admin (members), Manage (lessons & quizzes)
  styles/app.css       design tokens and styles (the "row J" look)
supabase/
  migrations/          tables → security rules → server functions
  functions/telegram-auth/  verifies Telegram sign-in, returns a session
docs/
  SETUP.md             step-by-step: bot, Supabase, hosting, first admin
  SECURITY.md          who can see what, and how it's enforced
```

## Quick start

Follow **[docs/SETUP.md](docs/SETUP.md)** the first time. It takes about 20 minutes. After that:

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm run dev                  # http://localhost:5173
```

The app signs people in with Telegram, so to use it for real you open it from your bot inside Telegram. SETUP.md explains how to point the bot at your dev server or a deployed build.

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
