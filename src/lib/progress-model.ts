// Модель прогресса без зависимостей от React Native: её проверяют тесты в Node
import { LESSONS_PER_DAY } from './plan';

export type Progress = {
  name: string | null;
  /** Пройденные уроки */
  done: Record<string, { score: number; total: number }>;
  /** Этапы со звездой */
  stars: number[];
  /** Сколько новых уроков пройдено за день (день в формате YYYY-MM-DD) */
  today: { day: string; count: number } | null;
  /** День последнего занятия и серия дней подряд */
  lastActive: string | null;
  streak: number;
  /** Сколько раз ученик ошибся в элементе */
  mistakes: Record<string, number>;
  /** Умное повторение: ступень и день следующего повтора для каждого элемента */
  srs: Record<string, { box: number; due: string }>;
  settings: Settings;
  /** Только для веб-версии: все уроки открыты для просмотра */
  unlocked?: boolean;
  /** Мини-курс «Учим цифры»: лучший результат по уровням, доля от 0 до 1 */
  numbers?: Record<string, number>;
};

export type Settings = {
  sounds: boolean;
  reminder: boolean;
  reminderHour: number;
  dailyGoal: number;
  /** Режим проверки (только при TEST_MODE): любой урок можно открыть сразу */
  allOpen: boolean;
};

/** Через сколько дней повторять элемент на каждой ступени */
export const SRS_DAYS = [0, 1, 3, 7, 16, 35];

export const EMPTY: Progress = {
  name: null,
  done: {},
  stars: [],
  today: null,
  lastActive: null,
  streak: 0,
  mistakes: {},
  srs: {},
  settings: { sounds: true, reminder: false, reminderHour: 19, dailyGoal: LESSONS_PER_DAY, allOpen: true },
};

export function dayKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}


/**
 * Объединяет прогресс с двух телефонов или из облака: ничего выученного не теряется.
 * `cloud` — сохранённый в аккаунте, `local` — на этом телефоне. Настройки остаются как на телефоне.
 */
export function mergeProgress(cloud: Progress, local: Progress): Progress {
  const done = { ...cloud.done };
  for (const [id, r] of Object.entries(local.done)) {
    const c = done[id];
    if (!c || r.score / Math.max(r.total, 1) > c.score / Math.max(c.total, 1)) done[id] = r;
  }
  const maxMap = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  };
  const srs = { ...cloud.srs };
  for (const [id, r] of Object.entries(local.srs)) {
    const c = srs[id];
    if (!c || r.box > c.box || (r.box === c.box && r.due > c.due)) srs[id] = r;
  }
  // Серия дней берётся у того, кто занимался позже
  const cl = cloud.lastActive ?? '';
  const ll = local.lastActive ?? '';
  const later = ll > cl ? local : cloud;
  const streak = cl === ll ? Math.max(cloud.streak, local.streak) : later.streak;
  let todayRec = later.today;
  if (cloud.today && local.today && cloud.today.day === local.today.day) {
    todayRec = { day: cloud.today.day, count: Math.max(cloud.today.count, local.today.count) };
  }
  return {
    ...local,
    name: cloud.name ?? local.name,
    done,
    stars: [...new Set([...cloud.stars, ...local.stars])].sort((x, y) => x - y),
    today: todayRec,
    lastActive: later.lastActive,
    streak,
    mistakes: maxMap(cloud.mistakes, local.mistakes),
    srs,
    numbers: maxMap(cloud.numbers, local.numbers),
    settings: local.name ? local.settings : { ...local.settings, ...cloud.settings },
  };
}

/** Приводит прогресс из облака или файла к полному виду: старые записи без новых полей */
export const normalizeProgress = (saved: Partial<Progress>): Progress => ({
  ...EMPTY,
  ...saved,
  settings: { ...EMPTY.settings, ...saved.settings },
});
