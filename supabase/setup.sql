-- Настройка базы «Алиф» в Supabase: SQL Editor → вставить всё → Run.
-- Прогресс ученика: одна строка на аккаунт. Видеть и менять её может только сам ученик.
create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

drop policy if exists "own progress select" on public.progress;
drop policy if exists "own progress insert" on public.progress;
drop policy if exists "own progress update" on public.progress;
create policy "own progress select" on public.progress for select to authenticated using (auth.uid() = user_id);
create policy "own progress insert" on public.progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own progress update" on public.progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Удаление аккаунта из приложения: ученик может удалить только себя, прогресс удалится вместе с ним
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===== Отзывы с сайта alif.best: любой может оставить, показываются только проверенные (approved) =====
-- Одобрить: update public.reviews set approved = true where id = …;
create table if not exists public.reviews (
  id bigserial primary key,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 3 and 600),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reviews_approved on public.reviews (approved, created_at desc);
alter table public.reviews enable row level security;
drop policy if exists "reviews: show approved" on public.reviews;
create policy "reviews: show approved" on public.reviews for select to anon, authenticated using (approved);
drop policy if exists "reviews: leave new" on public.reviews;
create policy "reviews: leave new" on public.reviews for insert to anon, authenticated with check (approved = false);
revoke all on public.reviews from anon, authenticated;
grant select (id, name, rating, body, created_at) on public.reviews to anon, authenticated;
grant insert (name, rating, body) on public.reviews to anon, authenticated;
grant usage on sequence public.reviews_id_seq to anon, authenticated;
create or replace function public.reviews_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reviews where not approved and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many reviews';
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_limit on public.reviews;
create trigger reviews_limit before insert on public.reviews for each row execute function public.reviews_limit();

-- Анонимный счётчик сайта (миграция site_visits): посещения и нажатия «Скачать»,
-- без IP, имён и постоянного номера; tz_country переводит часовой пояс в страну.
-- Полный текст применён через Supabase: таблицы site_visits, tz_country, триггер site_visits_limit.

-- Событие «onboarding» (миграция events_onboarding): ответы фенька при первом входе
-- lesson_id = «цель|уровень|уроков в день», value = сколько этапов пропущено по тесту.
