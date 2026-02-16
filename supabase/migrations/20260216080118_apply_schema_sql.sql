create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id integer not null,
  company_symbol text not null,
  company_name text not null,
  target_price numeric(18,4) not null check (target_price > 0),
  direction text not null check (direction in ('above', 'below')),
  comment text null,
  expires_at timestamptz null,
  active boolean not null default true,
  triggered_at timestamptz null,
  last_checked_price numeric(18,4) null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_price_alerts_user_active
  on public.price_alerts (user_id, active, company_id);

create index if not exists idx_price_alerts_company_symbol
  on public.price_alerts (company_symbol);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id);

drop trigger if exists trg_price_alerts_set_updated_at on public.price_alerts;
create trigger trg_price_alerts_set_updated_at
before update on public.price_alerts
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute procedure public.set_updated_at();

alter table public.price_alerts enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own alerts" on public.price_alerts;
create policy "Users can read own alerts"
  on public.price_alerts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own alerts" on public.price_alerts;
create policy "Users can insert own alerts"
  on public.price_alerts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own alerts" on public.price_alerts;
create policy "Users can update own alerts"
  on public.price_alerts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own alerts" on public.price_alerts;
create policy "Users can delete own alerts"
  on public.price_alerts
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions
  for delete
  using (auth.uid() = user_id);
