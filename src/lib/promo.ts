import { E2E, SERVER_URL, serverHeaders, testWindow } from './server';
import { supabase } from './supabase';

export type PromoResult =
  | { ok: true; endsAt: string | null }
  | { ok: false; reason: 'need-login' | 'not-found' | 'used-up' | 'expired' | 'used' | 'offline' | 'busy' };

/** Промокод: сервер проверяет его по базе и включает Премиум на аккаунт ученика */
export async function redeemPromo(code: string): Promise<PromoResult> {
  if (E2E) {
    const mock = testWindow?.__promo ?? 'not-found';
    if (mock.startsWith('OK')) return { ok: true, endsAt: mock.length > 3 ? mock.slice(3) : null };
    return { ok: false, reason: mock as Exclude<PromoResult, { ok: true }>['reason'] };
  }
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) return { ok: false, reason: 'need-login' };
  try {
    const response = await fetch(`${SERVER_URL}/promo`, {
      method: 'POST',
      headers: { ...(await serverHeaders()), 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: code.trim() }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; endsAt?: string | null; error?: string };
    if (response.ok && data.ok) return { ok: true, endsAt: data.endsAt ?? null };
    if (response.status === 401) return { ok: false, reason: 'need-login' };
    if (data.error === 'used-up' || data.error === 'expired' || data.error === 'used' || data.error === 'not-found') return { ok: false, reason: data.error };
    return { ok: false, reason: 'busy' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export const PROMO_ERRORS: Record<Exclude<PromoResult, { ok: true }>['reason'], string> = {
  'need-login': 'Сначала войдите по почте: подарок привяжется к аккаунту.',
  'not-found': 'Такого промокода нет. Проверьте буквы и цифры.',
  'used-up': 'Этот промокод уже использовали.',
  expired: 'Срок действия промокода закончился.',
  used: 'Вы уже использовали этот промокод, его срок закончился.',
  offline: 'Нет связи. Проверьте интернет.',
  busy: 'Не получилось проверить код. Попробуйте через минуту.',
};
