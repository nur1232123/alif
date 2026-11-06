import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALL_WEEKS } from '@/data/course';
import { ALL_LESSONS, getLesson, lessonId, DAYS_PER_WEEK } from './plan';

const KEY = 'alif.progress.v2';

export type Progress = {
  name: string | null;
  /** Пройденные уроки */
  done: Record<string, { score: number; total: number }>;
  /** Этапы со звездой */
  stars: number[];
  /** День, когда пройден последний новый урок (YYYY-MM-DD) */
  lastLessonDay: string | null;
  /** День последнего занятия и серия дней подряд */
  lastActive: string | null;
  streak: number;
  /** Сколько раз ученик ошибся в элементе */
  mistakes: Record<string, number>;
  /** Только для веб-версии: все уроки открыты для просмотра */
  unlocked?: boolean;
};

export const EMPTY: Progress = {
  name: null,
  done: {},
  stars: [],
  lastLessonDay: null,
  lastActive: null,
  streak: 0,
  mistakes: {},
};

export function dayKey(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const today = () => dayKey(new Date());

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

function nextStreak(p: Progress) {
  if (p.lastActive === today()) return p.streak;
  return p.lastActive === yesterday() ? p.streak + 1 : 1;
}

export type LessonState = 'done' | 'open' | 'tomorrow' | 'locked';
export type FinishResult = { stageStar: number | null; courseDone: boolean; firstTime: boolean };

type Ctx = {
  ready: boolean;
  progress: Progress;
  /** true, если имя введено в этом запуске приложения */
  isNewUser: boolean;
  setName: (name: string) => void;
  finishLesson: (id: string, score: number, total: number) => FinishResult;
  finishPractice: () => void;
  recordAnswer: (itemId: string, correct: boolean) => void;
  /** Следующий урок по порядку, null если курс пройден */
  currentLessonId: string | null;
  lessonState: (id: string) => LessonState;
  /** Серия с учётом пропущенных дней: если вчера не занимался, она сброшена */
  liveStreak: number;
  replaceProgress: (next: Progress) => void;
};

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  // Несколько записей подряд должны видеть свежие данные, а не значение с прошлого рендера
  const latest = useRef<Progress>(EMPTY);
  const [ready, setReady] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          latest.current = { ...EMPTY, ...JSON.parse(raw) };
          setProgress(latest.current);
        }
      })
      .catch(() => {
        // Повреждённые данные не должны мешать запуску: начинаем с чистого листа
      })
      .finally(() => setReady(true));
  }, []);

  const save = useCallback((next: Progress) => {
    latest.current = next;
    setProgress(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setName = useCallback(
    (name: string) => {
      setIsNewUser(latest.current.name === null);
      save({ ...latest.current, name });
    },
    [save],
  );

  const finishLesson = useCallback(
    (id: string, score: number, total: number): FinishResult => {
      const current = latest.current;
      const firstTime = !(id in current.done);
      const ref = getLesson(id)!;
      const previous = current.done[id];
      const done = {
        ...current.done,
        [id]: !previous || score / total >= previous.score / previous.total ? { score, total } : previous,
      };
      const stageWeeks = ALL_WEEKS.filter((w) => w.stageId === ref.week.stageId);
      const lastWeek = stageWeeks[stageWeeks.length - 1];
      const stageDone = lessonId(lastWeek.n, DAYS_PER_WEEK) in done;
      const newStar = stageDone && !current.stars.includes(ref.week.stageId);
      save({
        ...current,
        done,
        stars: newStar ? [...current.stars, ref.week.stageId] : current.stars,
        // Повторное прохождение не тратит урок дня
        lastLessonDay: firstTime ? today() : current.lastLessonDay,
        streak: nextStreak(current),
        lastActive: today(),
      });
      return {
        stageStar: newStar ? ref.week.stageId : null,
        courseDone: ALL_LESSONS.every((l) => l.id in done),
        firstTime,
      };
    },
    [save],
  );

  const finishPractice = useCallback(() => {
    const current = latest.current;
    save({ ...current, streak: nextStreak(current), lastActive: today() });
  }, [save]);

  const recordAnswer = useCallback(
    (itemId: string, correct: boolean) => {
      const current = latest.current;
      const count = current.mistakes[itemId] ?? 0;
      const nextCount = correct ? Math.max(0, count - 1) : count + 1;
      if (nextCount === count) return;
      const mistakes = { ...current.mistakes };
      if (nextCount === 0) delete mistakes[itemId];
      else mistakes[itemId] = nextCount;
      save({ ...current, mistakes });
    },
    [save],
  );

  const currentLessonId = useMemo(
    () => ALL_LESSONS.find((l) => !(l.id in progress.done))?.id ?? null,
    [progress.done],
  );

  const lessonState = useCallback(
    (id: string): LessonState => {
      if (id in progress.done) return 'done';
      if (progress.unlocked) return 'open';
      if (id !== currentLessonId) return 'locked';
      return progress.lastLessonDay === today() ? 'tomorrow' : 'open';
    },
    [progress, currentLessonId],
  );

  const liveStreak = progress.lastActive === today() || progress.lastActive === yesterday() ? progress.streak : 0;

  const value = useMemo(
    () => ({
      ready, progress, isNewUser, setName, finishLesson, finishPractice, recordAnswer,
      currentLessonId, lessonState, liveStreak, replaceProgress: save,
    }),
    [ready, progress, isNewUser, setName, finishLesson, finishPractice, recordAnswer, currentLessonId, lessonState, liveStreak, save],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress вне ProgressProvider');
  return ctx;
}
