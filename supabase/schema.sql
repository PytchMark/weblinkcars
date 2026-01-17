-- Supabase schema for Carsales Platform
create extension if not exists "pgcrypto";

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  dealer_id text unique not null,
  name text,
  status text default 'active',
  whatsapp text,
  logo_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  vehicle_id text unique not null,
  title text,
  make text,
  model text,
  year int,
  price numeric,
  mileage numeric,
  status text default 'available',
  archived boolean default false,
  availability boolean default true,
  description text,
  image_urls text[] default '{}',
  video_url text,
  transmission text,
  fuel_type text,
  body_type text,
  color text,
  vin text,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table if not exists public.viewing_requests (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  vehicle_id text,
  request_type text,
  customer_name text not null,
  phone text not null,
  email text,
  preferred_date text,
  preferred_time text,
  notes text,
  source text default 'Storefront',
  status text default 'New',
  created_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  role text not null,
  dealer_id text,
  created_at timestamp with time zone default now()
);

-- Row level security
alter table public.dealers enable row level security;
alter table public.vehicles enable row level security;
alter table public.viewing_requests enable row level security;
alter table public.profiles enable row level security;

create policy "Admins manage dealers" on public.dealers
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Dealers read own profile" on public.profiles
  for select
  using (auth.uid() = id);

create policy "Dealers update own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins manage profiles" on public.profiles
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Dealers manage own vehicles" on public.vehicles
  for all
  using (dealer_id = (select dealer_id from public.profiles where id = auth.uid()))
  with check (dealer_id = (select dealer_id from public.profiles where id = auth.uid()));

create policy "Admins manage vehicles" on public.vehicles
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Dealers manage own requests" on public.viewing_requests
  for all
  using (dealer_id = (select dealer_id from public.profiles where id = auth.uid()))
  with check (dealer_id = (select dealer_id from public.profiles where id = auth.uid()));

create policy "Admins manage requests" on public.viewing_requests
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('vehicle-media', 'vehicle-media', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Public read vehicle media" on storage.objects
  for select
  using (bucket_id = 'vehicle-media');

create policy "Authenticated upload vehicle media" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'vehicle-media');
