create table if not exists public.mission_overrides (
 item_key text primary key,
 item_type text not null,
 item_id text not null,
 category text,
 custom_text text not null,
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.mission_overrides enable row level security;
drop policy if exists "mission_overrides_select" on public.mission_overrides;
drop policy if exists "mission_overrides_insert" on public.mission_overrides;
drop policy if exists "mission_overrides_update" on public.mission_overrides;
drop policy if exists "mission_overrides_delete" on public.mission_overrides;
create policy "mission_overrides_select" on public.mission_overrides for select using (true);
create policy "mission_overrides_insert" on public.mission_overrides for insert with check (true);
create policy "mission_overrides_update" on public.mission_overrides for update using (true) with check (true);
create policy "mission_overrides_delete" on public.mission_overrides for delete using (true);
notify pgrst, 'reload schema';
