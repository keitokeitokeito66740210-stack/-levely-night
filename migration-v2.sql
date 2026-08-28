-- LEVELY NIGHT v2 migration
-- Run once in Supabase SQL Editor.

alter table public.players add column if not exists mission_id text;
alter table public.players add column if not exists mission_keyword text;

alter table public.events add column if not exists scenario_id text;
alter table public.events add column if not exists keyword text;

notify pgrst, 'reload schema';
