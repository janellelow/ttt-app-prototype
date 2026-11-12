-- TTT App: add the Head of Department role.
--
-- Kept in its own migration because Postgres cannot use a new enum value in
-- the same transaction that adds it; 20261112000002_journey.sql relies on it.
--
-- Roles, lowest to highest:
--   trainee  – everyone on the worship team
--   trainer  – looks after their assigned trainees
--   admin    – places people, assigns trainers, manages lessons
--   head     – Head of Department: everything an admin can do, plus roles,
--              web console access, the general roadmap and the change log

alter type public.user_role add value if not exists 'head';
