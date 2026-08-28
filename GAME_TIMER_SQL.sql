-- LEVELY NIGHT v2.9 / game elapsed timer
alter table public.rooms
add column if not exists started_at timestamptz;

notify pgrst, 'reload schema';
