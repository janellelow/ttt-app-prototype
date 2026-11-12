# Who can see what

TTT stores personal information: names, Telegram usernames, recordings, voice notes, practice logs, quiz results, and the age groups and tags trainers assign. The rules below are enforced **inside the database** (Postgres row level security and Storage policies in `supabase/migrations/…_security.sql`). The app doesn't need to be bug-free for data to stay private.

## Roles

| Role | Can |
| --- | --- |
| **Trainee** | Use the community feed of their own age group, take lessons and quizzes, log practice, send takes, read feedback on their own takes. |
| **Trainer** | Everything a trainee can, plus: create lessons and quizzes, see and moderate every age group's feed, place unassigned people, tag them and become their trainer, read and reply to their own trainees' takes, practice and quiz results. |
| **Admin** | Everything, including changing roles, reassigning anyone and reading the change log. |

Only admins change roles. Nobody can change their own role, age group, tags or trainer.

## Private data

| Data | Visible to |
| --- | --- |
| Recordings sent for feedback, voice notes, feedback threads | The trainee, their assigned trainer, admins |
| Practice log, quiz attempts, lesson progress, Wrapped | The person, their assigned trainer, admins |
| Telegram id and username, age group, tags, trainer | The person, their assigned trainer, admins (trainers also see people not yet placed, so they can place them) |
| Correct quiz answers | Trainers and admins only. Trainees' answers are marked on the server. |
| Change log (who changed whose role, group, tags or trainer) | Admins |

## Shared data

| Data | Visible to |
| --- | --- |
| Community posts, replies, likes, attached media | People in the same age group, plus trainers and admins |
| Display name, photo and role | People in your age group; trainers and admins are visible to everyone |
| Published courses | Everyone in the course's age group (or everyone, if the course is for all groups) |

## How it's protected

- **Sign-in can't be faked.** Telegram signs the launch data with the bot token. The `telegram-auth` function checks that signature on the server and refuses data older than 24 hours.
- **The public key is safe to ship.** The anon key in the app can only do what the row level security rules allow for the signed-in person. The service role key, bot token and pepper exist only as Supabase secrets.
- **Files are private.** All three storage buckets are private. The app shows files through signed links that expire after an hour. Who can open a file depends on which folder it's in (trainee id, age group or course).
- **No third parties.** The app sends data only to your Supabase project and Telegram. There are no analytics, ad SDKs or trackers. Fonts load from Google Fonts. Self-host them if you want zero third-party requests.
- **Wrapped comparisons are anonymous.** "More than X% of your group" only appears when the group has at least 5 trainees, and only the percentage is returned.
- **Audit trail.** Every role, group, tag or trainer change is recorded with who made it.

## Your responsibilities

- Keep the bot token, service role key and `AUTH_PASSWORD_PEPPER` secret, and never commit them.
- Only make people you trust trainers or admins.
- Add a privacy notice that tells users what you collect and who sees it. Check what the law requires where you operate, for example Singapore's PDPA, especially for people under 18.
- The under-18 safeguards are still being planned. Add them before inviting minors.

## Note for developers

`member_directory` is a view that runs with its owner's rights on purpose. It returns only `id, display_name, photo_url, role`, filtered to your age group plus staff. Supabase's security advisor will flag it as a "security definer view"; that's expected. Don't add columns to it without thinking about who can read them.
