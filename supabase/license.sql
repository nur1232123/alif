-- Ключи покупок Gumroad: один ключ — один аккаунт, чтобы ключом нельзя было делиться.
-- Запустить один раз в Supabase: SQL Editor → New query → вставить → Run.
create table if not exists public.license_bindings (
  license_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists license_bindings_user on public.license_bindings(user_id);
alter table public.license_bindings enable row level security;

-- Привязать ключ к вошедшему ученику; чужой ключ — ошибка 'taken'
create or replace function public.bind_license(p_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k text := upper(trim(coalesce(p_key, '')));
  owner uuid;
begin
  if uid is null then return json_build_object('error', 'auth'); end if;
  if k = '' then return json_build_object('error', 'not-found'); end if;
  select user_id into owner from license_bindings where license_key = k;
  if found and owner <> uid then return json_build_object('error', 'taken'); end if;
  if not found then insert into license_bindings (license_key, user_id) values (k, uid); end if;
  return json_build_object('ok', true, 'user', uid);
end;
$$;

-- Ключи вошедшего ученика: сервер сам продлевает по ним Премиум
create or replace function public.my_licenses()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object('user', auth.uid(), 'keys', coalesce(json_agg(license_key order by created_at desc), '[]'::json))
  from license_bindings where user_id = auth.uid();
$$;

revoke all on function public.bind_license(text) from public, anon;
revoke all on function public.my_licenses() from public, anon;
grant execute on function public.bind_license(text) to authenticated;
grant execute on function public.my_licenses() to authenticated;
