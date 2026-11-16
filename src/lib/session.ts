import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Task } from './plan';

/** Незаконченный урок: с какого задания продолжить, если ученик вышел */
export type Session = {
  key: string; // номер урока: «1-3», «numbers-2» или «practice»
  title: string;
  queue: Task[];
  index: number;
  score: number;
  mistakes: number;
  missed: string[];
  skipped: number;
  savedAt: number;
};

const KEY = 'alif.session.v1';
// Через три дня продолжать старое задание уже странно: урок начнётся заново
const MAX_AGE = 3 * 24 * 3600 * 1000;
let cached: Session | null = null;
let loaded = false;

/** Читается один раз при запуске, дальше берётся из памяти */
export async function loadSession() {
  if (loaded) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    cached = s && Date.now() - s.savedAt < MAX_AGE && s.index > 0 && s.index < s.queue.length ? s : null;
  } catch {
    cached = null;
  }
  loaded = true;
  return cached;
}

export const getSession = () => (cached && Date.now() - cached.savedAt < MAX_AGE ? cached : null);

export function saveSession(s: Omit<Session, 'savedAt'>) {
  // Первое задание не сохраняем: продолжать с него нечего
  if (s.index <= 0) return;
  cached = { ...s, savedAt: Date.now() };
  AsyncStorage.setItem(KEY, JSON.stringify(cached)).catch(() => {});
}

export function clearSession(key?: string) {
  if (key && cached && cached.key !== key) return;
  cached = null;
  AsyncStorage.removeItem(KEY).catch(() => {});
}
