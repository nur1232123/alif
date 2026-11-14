import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeProgress, normalizeProgress, useProgress, type Progress } from './progress';
import { E2E } from './server';
import { supabase } from './supabase';

// Необязательный вход по почте: код из письма, без пароля.
// Прогресс хранится в таблице progress (одна строка на ученика), подписка привязывается к этому же номеру.

export type AccountUser = { id: string; email: string };
export type CodeResult = 'sent' | 'bad-email' | 'too-many' | 'offline';
export type VerifyResult = 'ok' | 'bad-code' | 'expired' | 'offline';

type Backend = {
  current: () => Promise<{ user: AccountUser; token: string } | null>;
  sendCode: (email: string) => Promise<CodeResult>;
  verify: (email: string, code: string) => Promise<VerifyResult>;
  load: (userId: string) => Promise<Progress | null>;
  save: (userId: string, data: Progress) => Promise<boolean>;
  /** Удаляет аккаунт и прогресс в облаке */
  deleteSelf: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function errorKind(error: { status?: number; code?: string; message?: string } | null): 'too-many' | 'expired' | 'bad' | 'offline' {
  if (!error) return 'bad';
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.status === 429 || text.includes('rate limit') || text.includes('over_email_send_rate')) return 'too-many';
  if (text.includes('expired')) return 'expired';
  if (!error.status || text.includes('network') || text.includes('fetch')) return 'offline';
  return 'bad';
}

const supabaseBackend = (): Backend | null => {
  const sb = supabase;
  if (!sb) return null;
  return {
    async current() {
      const { data } = await sb.auth.getSession();
      const s = data.session;
      return s?.user ? { user: { id: s.user.id, email: s.user.email ?? '' }, token: s.access_token } : null;
    },
    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (!error) return 'sent';
      const kind = errorKind(error);
      return kind === 'too-many' ? 'too-many' : kind === 'offline' ? 'offline' : 'bad-email';
    },
    async verify(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (!error) return 'ok';
      const kind = errorKind(error);
      return kind === 'expired' ? 'expired' : kind === 'offline' ? 'offline' : 'bad-code';
    },
    async load(userId) {
      const { data, error } = await sb.from('progress').select('data').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.data ? normalizeProgress(data.data as Partial<Progress>) : null;
    },
    async save(userId, data) {
      const { error } = await sb.from('progress').upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
      return !error;
    },
    async deleteSelf() {
      // Функция в базе удаляет только того, кто вошёл; прогресс удаляется вместе с ним
      const { error } = await sb.rpc('delete_my_account');
      return !error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
};

// В автотестах облако подменяется: код всегда 123456. Облако и вход лежат в отдельных ключах браузера,
// поэтому «переустановка» (удаление ключей alif.*) их не стирает, как и настоящее облако
const fakeBackend = (): Backend => {
  const read = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };
  const idOf = (email: string) => `user-${email.toLowerCase()}`;
  return {
    async current() {
      const user = read<AccountUser | null>('e2e.session', null);
      return user ? { user, token: 'fake-token' } : null;
    },
    async sendCode(email) {
      return EMAIL_RE.test(email) ? 'sent' : 'bad-email';
    },
    async verify(email, code) {
      if (code !== '123456') return 'bad-code';
      write('e2e.session', { id: idOf(email), email });
      return 'ok';
    },
    async load(userId) {
      return read<Record<string, Progress>>('e2e.cloud', {})[userId] ?? null;
    },
    async save(userId, data) {
      write('e2e.cloud', { ...read<Record<string, Progress>>('e2e.cloud', {}), [userId]: data });
      return true;
    },
    async deleteSelf() {
      const user = read<AccountUser | null>('e2e.session', null);
      if (user) {
        const cloud = read<Record<string, Progress>>('e2e.cloud', {});
        delete cloud[user.id];
        write('e2e.cloud', cloud);
      }
      return true;
    },
    async signOut() {
      write('e2e.session', null);
    },
  };
};

const backend: Backend | null = E2E ? fakeBackend() : supabaseBackend();
/** Вход по почте доступен, если подключён Supabase */
export const accountEnabled = backend !== null;

type Ctx = {
  user: AccountUser | null;
  /** Последнее сохранение в облако: время или ошибка */
  synced: 'idle' | 'saving' | 'saved' | 'error';
  sendCode: (email: string) => Promise<CodeResult>;
  verifyCode: (email: string, code: string) => Promise<VerifyResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { ready, progress, replaceProgress } = useProgress();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [synced, setSynced] = useState<Ctx['synced']>('idle');
  // Пока прогресс из облака не объединён с телефонным, ничего не отправляем, чтобы не затереть облако
  const merged = useRef(false);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  /** Забирает прогресс из облака, объединяет с телефонным и сохраняет обратно */
  const pull = useCallback(
    async (u: AccountUser) => {
      if (!backend) return;
      try {
        const cloud = await backend.load(u.id);
        const next = cloud ? mergeProgress(cloud, progressRef.current) : progressRef.current;
        if (cloud) replaceProgress(next);
        merged.current = true;
        setSynced('saving');
        setSynced((await backend.save(u.id, next)) ? 'saved' : 'error');
      } catch {
        setSynced('error');
      }
    },
    [replaceProgress],
  );

  // При запуске: если ученик уже входил, подтягиваем облако
  useEffect(() => {
    if (!backend || !ready) return;
    let alive = true;
    backend.current().then((s) => {
      if (!alive || !s) return;
      setUser(s.user);
      pull(s.user);
    });
    return () => {
      alive = false;
    };
  }, [ready, pull]);

  // Каждое изменение прогресса уходит в облако с небольшой задержкой
  useEffect(() => {
    if (!backend || !user || !merged.current) return;
    const timer = setTimeout(async () => {
      setSynced('saving');
      setSynced((await backend.save(user.id, progressRef.current)) ? 'saved' : 'error');
    }, 2500);
    return () => clearTimeout(timer);
  }, [progress, user]);

  const sendCode = useCallback(async (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!backend) return 'offline' as const;
    if (!EMAIL_RE.test(email)) return 'bad-email' as const;
    return backend.sendCode(email);
  }, []);

  const verifyCode = useCallback(
    async (raw: string, code: string) => {
      if (!backend) return 'offline' as const;
      const email = raw.trim().toLowerCase();
      const result = await backend.verify(email, code.replace(/\D/g, ''));
      if (result !== 'ok') return result;
      const s = await backend.current();
      if (s) {
        setUser(s.user);
        await pull(s.user);
      }
      return result;
    },
    [pull],
  );

  const signOut = useCallback(async () => {
    if (!backend) return;
    await backend.signOut();
    merged.current = false;
    setUser(null);
    setSynced('idle');
  }, []);

  /** Удаляет аккаунт и прогресс в облаке (так требуют Google Play и App Store) */
  const deleteAccount = useCallback(async () => {
    if (!backend) return false;
    try {
      if (!(await backend.deleteSelf())) return false;
    } catch {
      return false;
    }
    await backend.signOut().catch(() => {});
    merged.current = false;
    setUser(null);
    setSynced('idle');
    return true;
  }, []);

  const value = useMemo<Ctx>(() => ({ user, synced, sendCode, verifyCode, signOut, deleteAccount }), [user, synced, sendCode, verifyCode, signOut, deleteAccount]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount вне AccountProvider');
  return ctx;
}
