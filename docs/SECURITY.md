# Who can see what

TTT stores personal information: names, Telegram usernames, recordings, voice notes, practice logs, quiz results, people's own dreams and goals, the accomplishments leaders record, and the age groups and tags trainers assign. The rules below are enforced **inside the database** (Postgres row level security and Storage policies in `supabase/migrations/…_security.sql` and `…_journey.sql`). The app doesn't need to be bug-free for data to stay private.

There are two apps, and **both run under the same rules**:

- the **Telegram mini app** for everyone, and
- the **web console** for trainers, admins and Heads of Department, who sign in with Google.

The web console is not a back door. After the Google sign-in, the `console-auth` function swaps it for the leader's own app account, so a trainer sees exactly what they would see in the mini app.

## Roles

| Role | Can |
| --- | --- |
| **Trainee** | Use the community feed of their own age group, take lessons and quizzes, log practice, send takes, read feedback on their own takes. |
| **Trainer** | Everything a trainee can, plus: create lessons and quizzes, see and moderate every age group's feed, place unassigned people, tag them and become their trainer, read and reply to their own trainees' takes, practice and quiz results. |
| **Admin** | Everything a trainer can, for everyone: place and reassign anyone (except a Head), record accomplishments and sign off roadmap steps for anyone. |
| **Head of Department** | Everything an admin can, plus: change roles, edit the general roadmap, decide who can use the web console, and read the change log. |

Only Heads change roles. Nobody can change their own role, age group, tags or trainer, and nobody signs off their own roadmap steps or records their own accomplishments (except a Head). There is always at least one Head.

## Private data

| Data | Visible to |
| --- | --- |
| Recordings sent for feedback, voice notes, feedback threads | The trainee, their assigned trainer, admins |
| Practice log, quiz attempts, lesson progress, Wrapped | The person, their assigned trainer, admins |
| Dreams & vision, "I want to grow in" | The person (the only one who can edit it), their assigned trainer, admins and Heads |
| Accomplishments, roadmap progress, personal roadmap steps | The person, their assigned trainer, admins and Heads. Only the trainer, admins and Heads can add or change them. |
| Telegram id and username, age group, tags, trainer | The person, their assigned trainer, admins (trainers also see people not yet placed, so they can place them) |
| Correct quiz answers | Trainers and admins only. Trainees' answers are marked on the server. |
| Change log (placements, roles, roadmap sign-offs, accomplishments, console access) | Heads of Department |
| Which Google account each leader uses for the web console | Heads of Department (and each leader sees their own) |

## Shared data

| Data | Visible to |
| --- | --- |
| Community posts, replies, likes, attached media | People in the same age group, plus trainers and admins |
| Display name, photo and role | People in your age group; trainers and admins are visible to everyone |
| Published courses | Everyone in the course's age group (or everyone, if the course is for all groups) |
| The general roadmap | Everyone on the team (only Heads can change it) |

## How it's protected

- **Sign-in can't be faked.** Telegram signs the launch data with the bot token. The `telegram-auth` function checks that signature on the server and refuses data older than 24 hours.
- **Web console sign-in is invite-only.** Public sign-ups stay off. When a Head grants a leader access, `console-access` creates a login account for that exact Google address; Google is linked to it on the first sign-in. `console-auth` then refuses anything that isn't a Google sign-in, isn't on the list, or belongs to someone who is no longer a trainer, admin or Head. Removing access deletes the login account, so the Google sign-in stops working immediately. A console session that is already open lasts until it expires (about an hour); demote the person's role too if you need to cut access to data at once.
- **The public key is safe to ship.** The anon key in the app can only do what the row level security rules allow for the signed-in person. The service role key, bot token and pepper exist only as Supabase secrets.
- **Files are private.** All three storage buckets are private. The app shows files through signed links that expire after an hour. Who can open a file depends on which folder it's in (trainee id, age group or course).
- **No third parties.** The apps send data only to your Supabase project, Telegram, and Google (only for web console sign-in). There are no analytics, ad SDKs or trackers. Fonts load from Google Fonts. Self-host them if you want zero third-party requests.
- **Wrapped comparisons are anonymous.** "More than X% of your group" only appears when the group has at least 5 trainees, and only the percentage is returned.
- **Audit trail.** Every role, group, tag or trainer change, roadmap sign-off, accomplishment and console access change is recorded with who made it.

## Your responsibilities

- Keep the bot token, service role key and `AUTH_PASSWORD_PEPPER` secret, and never commit them.
- Only make people you trust trainers, admins or Heads, and only grant web console access to Google accounts you know belong to them.
- Add a privacy notice that tells users what you collect and who sees it. Check what the law requires where you operate, for example Singapore's PDPA, especially for people under 18.
- The under-18 safeguards are still being planned. Add them before inviting minors.

## Note for developers

`member_directory` is a view that runs with its owner's rights on purpose. It returns only `id, display_name, photo_url, role`, filtered to your age group plus staff, and nothing at all to a signed-in account without a profile. Supabase's security advisor will flag it as a "security definer view"; that's expected. Don't add columns to it without thinking about who can read them.
