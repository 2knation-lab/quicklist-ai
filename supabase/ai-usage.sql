-- Run after setup.sql. Re-running this migration preserves existing usage.
begin;

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  requests integer not null check (requests between 1 and 20),
  primary key (user_id, usage_date)
);
alter table public.ai_daily_usage enable row level security;
revoke all on public.ai_daily_usage from public, anon, authenticated;

-- No caller-selected user or limit. The JWT determines the owner. The atomic
-- upsert serializes concurrent requests, including across application instances.
create or replace function public.reserve_ai_analysis()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  reserved integer;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.ai_daily_usage as usage (user_id, usage_date, requests)
  values (caller, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_date) do update
    set requests = usage.requests + 1
    where usage.requests < 20
  returning requests into reserved;

  return reserved is not null;
end;
$$;
revoke all on function public.reserve_ai_analysis() from public, anon;
grant execute on function public.reserve_ai_analysis() to authenticated;

commit;
