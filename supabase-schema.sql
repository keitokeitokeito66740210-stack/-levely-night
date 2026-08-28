create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  phase text not null default 'waiting',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  device_id text,
  mission text,
  status text not null default 'joined',
  score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_real boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.events enable row level security;

-- MVP用: 匿名ユーザーから読み書き可能。
-- 正式運用時は staff 認証 / room token を追加して制限する。
create policy "mvp rooms read" on public.rooms for select using (true);
create policy "mvp rooms insert" on public.rooms for insert with check (true);
create policy "mvp rooms update" on public.rooms for update using (true) with check (true);
create policy "mvp players read" on public.players for select using (true);
create policy "mvp players insert" on public.players for insert with check (true);
create policy "mvp players update" on public.players for update using (true) with check (true);
create policy "mvp events read" on public.events for select using (true);
create policy "mvp events insert" on public.events for insert with check (true);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.events;
