-- ============================================================
-- Pansuriya Impex — Supabase backend schema (OFFICIAL)
-- Run once: Supabase Dashboard -> SQL Editor -> New query
--           -> paste this whole file -> Run.
-- Safe to re-run (idempotent).
-- ============================================================

-- ---------- profiles (one row per user, holds KYC + role + status) ----------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text unique,
  email              text,
  company            text,
  first_name         text,
  middle_name        text,
  last_name          text,
  country_code       text,
  phone              text,
  address            text,
  country            text,
  state              text,
  city               text,
  pincode            text,
  fax                text,
  jurisdiction       text,
  tax_label1         text,
  tax_id1            text,
  tax_label2         text,
  tax_id2            text,
  emergency_name     text,
  emergency_phone    text,
  emergency_address  text,
  location           text,
  role               text not null default 'customer'
                       check (role in ('admin','stock_manager','salesperson','customer')),
  status             text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  created_at         timestamptz not null default now()
);

-- ---------- KYC documents (metadata; files live in Storage) ----------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  doc_type     text,
  file_name    text,
  storage_path text,
  size         bigint,
  created_at   timestamptz not null default now()
);

-- ---------- role -> pages permissions (admin-editable from the app) ----------
create table if not exists public.role_permissions (
  role  text primary key,
  pages text[] not null default '{}'
);
insert into public.role_permissions (role, pages) values
  ('admin',         array['dashboard','inventory','users']),
  ('stock_manager', array['dashboard','inventory']),
  ('salesperson',   array['dashboard','inventory']),
  ('customer',      array['inventory'])
on conflict (role) do nothing;

-- ---------- helper functions (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ---------- look up an email by username (lets people sign in with
--            their username instead of their email; callable before login) ----------
create or replace function public.email_for_username(uname text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.profiles where lower(username) = lower(uname) limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------- auto-create a profile from sign-up metadata ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    id, email, username, company, first_name, middle_name, last_name,
    country_code, phone, address, country, state, city, pincode, fax,
    jurisdiction, tax_label1, tax_id1, tax_label2, tax_id2,
    emergency_name, emergency_phone, emergency_address, location
  ) values (
    new.id, new.email,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'company',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'middle_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'country_code',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'state',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'pincode',
    new.raw_user_meta_data->>'fax',
    new.raw_user_meta_data->>'jurisdiction',
    new.raw_user_meta_data->>'tax_label1',
    new.raw_user_meta_data->>'tax_id1',
    new.raw_user_meta_data->>'tax_label2',
    new.raw_user_meta_data->>'tax_id2',
    new.raw_user_meta_data->>'emergency_name',
    new.raw_user_meta_data->>'emergency_phone',
    new.raw_user_meta_data->>'emergency_address',
    new.raw_user_meta_data->>'location'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- stop users escalating their own role/status ----------
-- Only admins may change role or status; a normal user updating their own
-- profile keeps whatever role/status they already had.
create or replace function public.protect_privileged_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_privileged_fields();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.documents        enable row level security;
alter table public.role_permissions enable row level security;

-- profiles: you can read your own row; admins read everyone
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- profiles: you can update your own row; admins update anyone
-- (the protect_privileged_fields trigger blocks self role/status changes)
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- documents: owner or admin can read; you can attach your own
drop policy if exists "documents_read" on public.documents;
create policy "documents_read" on public.documents
  for select using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (profile_id = auth.uid());

-- role_permissions: any signed-in user can read; only admins can change
drop policy if exists "perms_read" on public.role_permissions;
create policy "perms_read" on public.role_permissions
  for select using (auth.role() = 'authenticated');
drop policy if exists "perms_write" on public.role_permissions;
create policy "perms_write" on public.role_permissions
  for update using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Storage bucket for KYC documents (private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- files are stored under  <user-id>/<filename>  so each user owns a folder
drop policy if exists "kyc_upload_own" on storage.objects;
create policy "kyc_upload_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc_read_own_or_admin" on storage.objects;
create policy "kyc_read_own_or_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'kyc-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- AFTER you sign up once on the new system, make yourself admin:
--   update public.profiles
--   set role = 'admin', status = 'approved'
--   where email = 'maitikpatoliya@gmail.com';
-- ============================================================

-- ============================================================
-- orders (proformas customers issue from the cart; staff confirm)
-- ============================================================
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','salesperson','stock_manager')
                   from public.profiles where id = auth.uid()), false);
$$;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  doc_type         text not null default 'proforma'
                     check (doc_type in ('proforma','hold','memo','invoice')),
  order_ref        text,
  stock_id         text,
  description      text,
  certificate      text,
  lab              text,
  amount           numeric,
  ppc              numeric,
  discount         numeric,
  bank_rate        text,
  customer_id      uuid references public.profiles(id) on delete set null,
  customer_name    text,
  customer_company text,
  status           text not null default 'pending_confirmation'
                     check (status in ('pending_confirmation','confirmed','issue_raised','cancelled')),
  issue_note       text,
  handled_by       uuid references public.profiles(id),
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_idx on public.orders (customer_id);

alter table public.orders enable row level security;
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (customer_id = auth.uid());
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (customer_id = auth.uid() or public.is_staff());
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (public.is_staff()) with check (public.is_staff());
