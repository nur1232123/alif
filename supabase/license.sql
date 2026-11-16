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

-- ===== Автоматическое включение Премиума после покупки (уведомления Gumroad) =====
-- Секрет уведомлений задаётся отдельно, не в репозитории:
--   insert into server_secrets (name, value) values ('gumroad_ping', '<тот же GUMROAD_PING_SECRET, что на сервере>');

create table if not exists public.server_secrets (
  name text primary key,
  value text not null
);
alter table public.server_secrets enable row level security;

-- Покупки, у которых пока нет аккаунта с такой почтой: привяжутся, когда ученик войдёт
create table if not exists public.pending_licenses (
  license_key text primary key,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists pending_licenses_email on public.pending_licenses (lower(email));
alter table public.pending_licenses enable row level security;

create or replace function public.gumroad_attach(p_secret text, p_email text, p_key text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
  uid uuid;
  k text := upper(trim(coalesce(p_key, '')));
  e text := lower(trim(coalesce(p_email, '')));
begin
  select value into expected from server_secrets where name = 'gumroad_ping';
  if expected is null or p_secret is distinct from expected then return json_build_object('error', 'secret'); end if;
  if k = '' or e = '' then return json_build_object('error', 'bad'); end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is null then
    insert into pending_licenses (license_key, email) values (k, e)
      on conflict (license_key) do update set email = excluded.email;
    return json_build_object('pending', true);
  end if;
  insert into license_bindings (license_key, user_id) values (k, uid) on conflict (license_key) do nothing;
  return json_build_object('ok', true, 'user', (select user_id from license_bindings where license_key = k));
end;
$$;
revoke all on function public.gumroad_attach(text, text, text) from public;
grant execute on function public.gumroad_attach(text, text, text) to anon, authenticated;

-- my_licenses заодно забирает покупки, сделанные на почту ученика до входа
create or replace function public.my_licenses()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e text := lower(coalesce(auth.email(), ''));
begin
  if uid is null then return json_build_object('error', 'auth'); end if;
  if e <> '' then
    insert into license_bindings (license_key, user_id)
      select license_key, uid from pending_licenses where lower(email) = e
      on conflict (license_key) do nothing;
    delete from pending_licenses where lower(email) = e;
  end if;
  return (
    select json_build_object('user', uid, 'keys', coalesce(json_agg(license_key order by created_at desc), '[]'::json))
    from license_bindings where user_id = uid
  );
end;
$$;
revoke all on function public.my_licenses() from public, anon;
grant execute on function public.my_licenses() to authenticated;

-- ===== Подписка без ключа покупки: Gumroad присылает номер подписки, срок продлевается каждым списанием =====
alter table public.license_bindings add column if not exists ends_at timestamptz;
alter table public.pending_licenses add column if not exists ends_at timestamptz;
drop function if exists public.gumroad_attach(text, text, text);

create or replace function public.gumroad_attach(p_secret text, p_email text, p_key text, p_ends_at timestamptz default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
  uid uuid;
  k text := upper(trim(coalesce(p_key, '')));
  e text := lower(trim(coalesce(p_email, '')));
begin
  select value into expected from server_secrets where name = 'gumroad_ping';
  if expected is null or p_secret is distinct from expected then return json_build_object('error', 'secret'); end if;
  if k = '' or e = '' then return json_build_object('error', 'bad'); end if;
  select id into uid from auth.users where lower(email) = e limit 1;
  if uid is null then
    insert into pending_licenses (license_key, email, ends_at) values (k, e, p_ends_at)
      on conflict (license_key) do update set email = excluded.email,
        ends_at = greatest(pending_licenses.ends_at, excluded.ends_at);
    return json_build_object('pending', true);
  end if;
  insert into license_bindings (license_key, user_id, ends_at) values (k, uid, p_ends_at)
    on conflict (license_key) do update set ends_at = greatest(license_bindings.ends_at, excluded.ends_at);
  return json_build_object('ok', true, 'user', (select user_id from license_bindings where license_key = k),
    'ends_at', (select ends_at from license_bindings where license_key = k));
end;
$$;
revoke all on function public.gumroad_attach(text, text, text, timestamptz) from public;
grant execute on function public.gumroad_attach(text, text, text, timestamptz) to anon, authenticated;

create or replace function public.my_licenses()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e text := lower(coalesce(auth.email(), ''));
begin
  if uid is null then return json_build_object('error', 'auth'); end if;
  if e <> '' then
    insert into license_bindings (license_key, user_id, ends_at)
      select license_key, uid, ends_at from pending_licenses where lower(email) = e
      on conflict (license_key) do update set ends_at = greatest(license_bindings.ends_at, excluded.ends_at);
    delete from pending_licenses where lower(email) = e;
  end if;
  return (
    select json_build_object('user', uid,
      'keys', coalesce(json_agg(license_key order by created_at desc), '[]'::json),
      'items', coalesce(json_agg(json_build_object('key', license_key, 'ends_at', ends_at) order by created_at desc), '[]'::json))
    from license_bindings where user_id = uid
  );
end;
$$;
revoke all on function public.my_licenses() from public, anon;
grant execute on function public.my_licenses() to authenticated;
