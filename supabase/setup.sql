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
