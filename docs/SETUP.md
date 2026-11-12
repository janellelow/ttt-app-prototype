# Setting up TTT

You'll need a free [Supabase](https://supabase.com) account, a Telegram account, [Node.js 20+](https://nodejs.org) and the [Supabase CLI](https://supabase.com/docs/guides/cli).

## 1. Create the Telegram bot

1. In Telegram, open **@BotFather** and send `/newbot`. Pick a name and a username.
2. BotFather replies with a **bot token** like `123456:ABC-…`. Keep it secret: anyone with it can control your bot.

## 2. Create the Supabase project

1. Go to supabase.com → **New project**. Choose the **Southeast Asia (Singapore)** region if most users are near you.
2. Once it's ready, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon / publishable key**
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". (Accounts are created only by the Telegram sign-in function, which still works when this is off.)
4. Go to **Storage → Settings** and check the global upload size limit. The free plan caps uploads at 50 MB. Raise it on a paid plan if trainers need longer lesson videos (the buckets themselves allow up to 200 MB).

## 3. Put the database and rules in place

From the project folder:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF   # the part before .supabase.co
supabase db push                               # runs supabase/migrations in order
```

This creates the tables, the private file buckets, the security rules and the server functions.

## 4. Deploy the sign-in functions

Make a long random secret for the pepper, for example with `openssl rand -hex 32`. **Never change it later**: it's used to derive every account's hidden password, so changing it would lock everyone out.

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="123456:ABC-..." AUTH_PASSWORD_PEPPER="your-long-random-secret"
supabase functions deploy telegram-auth --no-verify-jwt
supabase functions deploy console-auth console-access
```

`telegram-auth` signs people in from Telegram. `console-auth` and `console-access` run the web console's Google sign-in (step 8).

Optional: once the app is hosted, also set `ALLOWED_ORIGIN` to its address (e.g. `https://ttt.vercel.app`) so only your app can call the function from a browser.

## 5. Configure and run the app

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Project URL and anon key from step 2. Then:

```bash
npm run dev
```

Opening http://localhost:5173 in a normal browser shows "Open TTT in Telegram", which is expected. The web console runs at http://localhost:5173/console/.

To click through both apps with sample data and no backend, run `npm run dev:demo` instead. A bar at the top lets you switch between a trainee, a trainer, an admin and a Head of Department. To try it inside Telegram during development, expose your dev server over HTTPS, for example with `npx cloudflared tunnel --url http://localhost:5173` or ngrok, and use that https address in step 6.

## 6. Host it and connect it to the bot

1. Build: `npm run build`. This creates the `dist/` folder with both apps: the mini app at the root and the web console in `console/`.
2. Deploy `dist/` to any static host. On Vercel or Netlify, import the GitHub repo, set the build command to `npm run build` and the output folder to `dist`, and add the same `VITE_…` environment variables.
3. In **@BotFather**:
   - `/mybots` → your bot → **Bot Settings → Menu Button** → set the URL to your hosted address (https only).
   - Optional: `/newapp` to create a Mini App link like `https://t.me/YourBot/app`. Put it in `VITE_TELEGRAM_APP_LINK` so Share buttons use it.

## 7. Make yourself the first Head of Department

1. Open the bot in Telegram and tap the menu button once. This creates your account.
2. Find your Telegram id. It's the `telegram_id` column in **Supabase → Table Editor → profiles**.
3. In **Supabase → SQL Editor**, run:

```sql
update public.profiles set role = 'head' where telegram_id = 123456789;
```

4. Re-open the app. You'll now see the settings icon on Community (Members) and the "Add content" button in Learn. From Members you can make your friends trainers, admins or Heads.

## 8. Turn on the web console (Google sign-in)

Leaders use the web console at `https://your-host/console/`. They sign in with Google, and only Google accounts a Head of Department has added can get in.

1. **Google Cloud Console** → APIs & Services → Credentials → **Create credentials → OAuth client ID** → Web application.
   - Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**. (Google asks you to set up the OAuth consent screen first; "External" with your church's name is fine.)
2. **Supabase → Authentication → Sign In / Providers → Google**: turn it on and paste the Client ID and secret.
3. **Supabase → Authentication → URL Configuration**: set **Site URL** to your hosted address and add `https://your-host/console/` (and `http://localhost:5173/console/` for development) to **Redirect URLs**.
4. Keep **Allow new users to sign up** turned **off**. Google sign-in still works for people you add, because their account is created when you give them access.
5. Give yourself access the first time (after that, use the console's **Console access** page):
   - **Supabase → Authentication → Users → Add user → Create new user**: enter your Google email, tick **Auto Confirm User**, leave the password empty. Copy the new user's **UID**.
   - In **SQL Editor**, run (with your Telegram id, Google email and that UID):

```sql
insert into public.console_access (profile_id, email, login_user_id)
select id, 'you@gmail.com', 'PASTE-UID-HERE' from public.profiles where telegram_id = 123456789;
```

6. Open `https://your-host/console/` and sign in with Google. From **Console access** you can now add your trainers and admins by their Google email.

## Day-to-day

| Task | Where |
| --- | --- |
| Place a new person in an age group, tag them, give them a trainer | Community → settings icon → Members → Unassigned |
| Add a course, module, video, photo, link, notes or quiz | Learn → Add content |
| Publish a course or quiz so trainees see it | Add content → pick course → Publish |
| Sign off a roadmap step or record an accomplishment | Mini app: Members → person → View their journey. Web console: People → person |
| Add a step just for one person | Same place → Add a personal step |
| Change the roadmap everyone walks | Web console → Roadmap (Heads) |
| Create a department, add people, appoint its Head | Web console → Departments (Heads; admins can add and remove members) |
| Rename access levels (e.g. Trainee → Member), edit serving roles, levels, private notes, age groups | Web console → Team setup |
| Change someone's role | Members → person, or web console → People → person → Placement (Heads) |
| Let a leader use the web console | Web console → Console access (Heads) |
| See who changed what | Web console → Change log, or Members → Change log (Heads) |
| Add or rename age groups | Supabase → Table Editor → `age_groups` |

## Troubleshooting

- **"Couldn't sign you in: Could not verify Telegram sign-in"**: `TELEGRAM_BOT_TOKEN` is wrong, or the app was opened from a different bot.
- **"Server is not configured"**: one of the function secrets is missing. Run `supabase secrets list`.
- **"Could not create account"**: if this happens only for people who signed in before, the pepper was changed. Set it back to the original value.
- **Uploads fail for big files**: check the storage size limit (step 2.4).
- **"This Google account does not have access"** in the web console: a Head hasn't added that exact Google email under Console access, or the person is no longer a trainer, admin or Head.
- **"Email logins are disabled"** or every sign-in fails: the Email provider must stay enabled in Supabase (the hidden accounts behind Telegram and console sign-in use it). In `supabase/config.toml`, don't add `[auth.email] enable_signup = false`.
- **Voice notes don't record**: the person needs to allow microphone access for Telegram in their phone settings.
