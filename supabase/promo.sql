-- Промокоды «Алиф»: Премиум в подарок без оплаты.
-- Запустить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Сами коды сюда не пишите (репозиторий публичный): добавляйте их в SQL Editor, примеры внизу.

create table if not exists public.promo_codes (
  code text primary key,
  days integer check (days is null or days > 0),        -- null = навсегда
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,                                -- до какого числа код можно ввести
  note text,                                             -- для кого код
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  code text not null references public.promo_codes(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- Политик нет: читать и менять таблицы могут только функция ниже и панель Supabase
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- Ученик вводит код. Возвращает, до какого момента дать Премиум (ends_at, null = навсегда).
-- Повторный ввод того же кода тем же учеником отдаёт тот же срок — продлить подарок так нельзя.
create or replace function public.redeem_promo(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.promo_codes;
  r public.promo_redemptions;
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if uid is null then return json_build_object('error', 'auth'); end if;
  select * into c from promo_codes where code = normalized for update;
  if not found then return json_build_object('error', 'not-found'); end if;

  select * into r from promo_redemptions where code = normalized and user_id = uid;
  if found then
    if c.days is not null and r.redeemed_at + make_interval(days => c.days) < now() then
      return json_build_object('error', 'used');
    end if;
    return json_build_object('ok', true, 'user', uid,
      'ends_at', case when c.days is null then null else r.redeemed_at + make_interval(days => c.days) end);
  end if;

  if c.expires_at is not null and c.expires_at < now() then return json_build_object('error', 'expired'); end if;
  if c.uses >= c.max_uses then return json_build_object('error', 'used-up'); end if;

  update promo_codes set uses = uses + 1 where code = normalized;
  insert into promo_redemptions (code, user_id) values (normalized, uid);
  return json_build_object('ok', true, 'user', uid,
    'ends_at', case when c.days is null then null else now() + make_interval(days => c.days) end);
end;
$$;

revoke all on function public.redeem_promo(text) from public, anon;
grant execute on function public.redeem_promo(text) to authenticated;

-- Примеры (запускайте отдельно, со своими кодами):
-- insert into promo_codes (code, days, max_uses, note) values ('ALIF-NUR-XXXX', null, 1, 'для меня, навсегда');
-- insert into promo_codes (code, days, max_uses, note) values ('ALIF-TEST-XXXX', 30, 12, 'тестерам на месяц');
-- select code, days, uses, max_uses, note from promo_codes;
