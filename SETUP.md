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

## 4. Deploy the sign-in function

Make a long random secret for the pepper, for example with `openssl rand -hex 32`. **Never change it later**: it's used to derive every account's hidden password, so changing it would lock everyone out.

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="123456:ABC-..." AUTH_PASSWORD_PEPPER="your-long-random-secret"
supabase functions deploy telegram-auth --no-verify-jwt
```

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

Opening http://localhost:5173 in a normal browser shows "Open TTT in Telegram", which is expected. To try it inside Telegram during development, expose your dev server over HTTPS, for example with `npx cloudflared tunnel --url http://localhost:5173` or ngrok, and use that https address in step 6.

## 6. Host it and connect it to the bot

1. Build: `npm run build`. This creates the `dist/` folder.
2. Deploy `dist/` to any static host. On Vercel or Netlify, import the GitHub repo, set the build command to `npm run build` and the output folder to `dist`, and add the same `VITE_…` environment variables.
3. In **@BotFather**:
   - `/mybots` → your bot → **Bot Settings → Menu Button** → set the URL to your hosted address (https only).
   - Optional: `/newapp` to create a Mini App link like `https://t.me/YourBot/app`. Put it in `VITE_TELEGRAM_APP_LINK` so Share buttons use it.

## 7. Make yourself the first admin

1. Open the bot in Telegram and tap the menu button once. This creates your account.
2. Find your Telegram id. It's the `telegram_id` column in **Supabase → Table Editor → profiles**.
3. In **Supabase → SQL Editor**, run:

```sql
update public.profiles set role = 'admin' where telegram_id = 123456789;
```

4. Re-open the app. You'll now see the settings icon on Community (Members) and the "Add content" button in Learn. From Members you can make your friends trainers or admins.

## Day-to-day

| Task | Where |
| --- | --- |
| Place a new person in an age group, tag them, give them a trainer | Community → settings icon → Members → Unassigned |
| Add a course, module, video, photo, link, notes or quiz | Learn → Add content |
| Publish a course or quiz so trainees see it | Add content → pick course → Publish |
| See who changed what | Members → Change log (admins) |
| Add or rename age groups | Supabase → Table Editor → `age_groups` |

## Troubleshooting

- **"Couldn't sign you in: Could not verify Telegram sign-in"**: `TELEGRAM_BOT_TOKEN` is wrong, or the app was opened from a different bot.
- **"Server is not configured"**: one of the function secrets is missing. Run `supabase secrets list`.
- **"Could not create account"**: if this happens only for people who signed in before, the pepper was changed. Set it back to the original value.
- **Uploads fail for big files**: check the storage size limit (step 2.4).
- **Voice notes don't record**: the person needs to allow microphone access for Telegram in their phone settings.
