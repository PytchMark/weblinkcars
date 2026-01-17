-- Seed data for Supabase (run after auth users are created).
-- NOTE: Create Auth users in Supabase Auth UI first, then paste their UUIDs below.

-- Dealers
insert into public.dealers (dealer_id, name, status)
values
  ('AUCTIONS-JA', 'Auctions JA', 'active')
on conflict (dealer_id) do nothing;

-- Profiles (replace UUID placeholders with auth.users IDs)
-- Admin profile
-- insert into public.profiles (id, role)
-- values ('ADMIN_AUTH_USER_ID', 'admin')
-- on conflict (id) do nothing;

-- Dealer profile for Auctions JA
-- insert into public.profiles (id, role, dealer_id)
-- values ('DEALER_AUTH_USER_ID', 'dealer', 'AUCTIONS-JA')
-- on conflict (id) do nothing;
