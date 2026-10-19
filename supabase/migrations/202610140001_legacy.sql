-- ==============================================================================
-- Vizor Supabase Schema: Emergency SOS Contacts
-- Run this in your Supabase Project's SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create table for Emergency SOS Contacts
create table if not exists public.sos_contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row-Level Security (RLS)
alter table public.sos_contacts enable row level security;

-- 3. RLS Policies (Users can only view, insert, update, delete their own contacts)
drop policy if exists "Users can view own contacts" on public.sos_contacts;
create policy "Users can view own contacts"
  on public.sos_contacts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own contacts" on public.sos_contacts;
create policy "Users can insert own contacts"
  on public.sos_contacts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own contacts" on public.sos_contacts;
create policy "Users can update own contacts"
  on public.sos_contacts
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own contacts" on public.sos_contacts;
create policy "Users can delete own contacts"
  on public.sos_contacts
  for delete
  using (auth.uid() = user_id);

-- 4. Index for fast user_id lookups
create index if not exists idx_sos_contacts_user_id on public.sos_contacts (user_id);

-- ==============================================================================
-- Vizor Supabase Schema: Hazard & Crash Event Logging
-- Populated by the companion app relaying the helmet's Hazard & SOS BLE
-- characteristic (see mobile-app/README.md's BLE Protocol Specification and
-- mobile-app/src/hazardProtocol.ts, which firmware/src/main.cpp's
-- sendHazardEvent() sends: POTHOLE_BUMP, CRASH_DETECTED, SOS_CANCELLED).
-- ==============================================================================

-- 5. Crowdsourced pothole-bump hazard log (append-only; no update policy)
create table if not exists public.hazard_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  g_force real not null,
  lat double precision,
  lon double precision,
  has_gps_fix boolean not null default false,
  recorded_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.hazard_logs enable row level security;

drop policy if exists "Users can view own hazard logs" on public.hazard_logs;
create policy "Users can view own hazard logs"
  on public.hazard_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own hazard logs" on public.hazard_logs;
create policy "Users can insert own hazard logs"
  on public.hazard_logs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own hazard logs" on public.hazard_logs;
create policy "Users can delete own hazard logs"
  on public.hazard_logs
  for delete
  using (auth.uid() = user_id);

create index if not exists idx_hazard_logs_user_id on public.hazard_logs (user_id);
create index if not exists idx_hazard_logs_recorded_at on public.hazard_logs (recorded_at);

-- 6. Crash/SOS events: one row per CRASH_DETECTED, updated to 'cancelled' on a
-- matching SOS_CANCELLED (PTT press within the countdown) or 'dispatched' once
-- the app's own 10s countdown (see mobile-app/README.md) elapses uncancelled.
create table if not exists public.crash_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  g_force real not null,
  lat double precision,
  lon double precision,
  has_gps_fix boolean not null default false,
  status text not null default 'detected' check (status in ('detected', 'cancelled', 'dispatched')),
  detected_at timestamp with time zone default timezone('utc'::text, now()) not null,
  resolved_at timestamp with time zone
);

alter table public.crash_events enable row level security;

drop policy if exists "Users can view own crash events" on public.crash_events;
create policy "Users can view own crash events"
  on public.crash_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own crash events" on public.crash_events;
create policy "Users can insert own crash events"
  on public.crash_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own crash events" on public.crash_events;
create policy "Users can update own crash events"
  on public.crash_events
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own crash events" on public.crash_events;
create policy "Users can delete own crash events"
  on public.crash_events
  for delete
  using (auth.uid() = user_id);

create index if not exists idx_crash_events_user_id on public.crash_events (user_id);
create index if not exists idx_crash_events_detected_at on public.crash_events (detected_at);
