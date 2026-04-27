-- supabase/migrations/013_device_tokens.sql
create table if not exists device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  token       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

create index device_tokens_user_id_idx on device_tokens(user_id);

alter table device_tokens enable row level security;

create policy "Users manage own tokens"
  on device_tokens for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access"
  on device_tokens for all
  to service_role
  using (true);
