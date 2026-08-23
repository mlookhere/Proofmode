-- Make the client Data API permissions deterministic across hosted and local Supabase.

grant select on table public.challenges to anon, authenticated;

grant select on table public.challenge_members to authenticated;

grant select, insert, delete on table public.watched_challenges to authenticated;

grant select on table public.profiles to authenticated;
