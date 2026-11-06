import { ALL_WEEKS, getWeek } from '@/data/course';
import type { Item, Line, Week } from '@/data/types';

export const DAYS_PER_WEEK = 7;
/** Сколько новых уроков открывается в день. Курс рассчитан на год при этом темпе. */
export const LESSONS_PER_DAY = 3;
export const LESSONS_PER_WEEK = DAYS_PER_WEEK * LESSONS_PER_DAY;
export const TOTAL_LESSONS = ALL_WEEKS.length * LESSONS_PER_WEEK;
const LESSON_SIZE = 9;

export type ChoiceKind = 'see-hear' | 'hear-see' | 'meaning' | 'reverse' | 'form' | 'text' | 'reply';
export type Option = { id: string; ar?: string; say?: string; ru?: string };

export type ChoiceTask = {
  type: 'choice';
  key: string;
  kind: ChoiceKind;
  itemId?: string;
  ar?: string;
  say?: string;
  ru?: string;
  options: Option[];
  answerId: string;
  explainAr?: string;
  explainRu?: string;
};
export type IntroTask = { type: 'intro'; key: string; item: Item };
export type TipTask = { type: 'tip'; key: string; title: string; text: string };
export type ReadTask = { type: 'read'; key: string; title: string; lines: Line[] };
export type MatchTask = { type: 'match'; key: string; pairs: Item[] };
export type BuildTask = {
  type: 'build';
  key: string;
  itemId?: string;
  ru: string;
  say: string;
  answer: string[];
  bank: string[];
  /** Буквы складываются в слово, слова разделяются пробелами */
  joined: boolean;
};
/** Голосовое задание: ученик произносит вслух, сервис оценивает */
export type SpeakTask = { type: 'speak'; key: string; itemId: string; ar: string; ru: string; expected: string; isLetter: boolean };
export type Task = ChoiceTask | IntroTask | TipTask | ReadTask | MatchTask | BuildTask | SpeakTask;

export const isGraded = (task: Task) => task.type === 'choice' || task.type === 'build' || task.type === 'speak';

/** n: номер урока в неделе (1–21), day: день недели (1–7), slot: урок дня (1–3) */
export type LessonRef = { id: string; week: Week; n: number; day: number; slot: number; isExam: boolean; title: string };

export function lessonId(week: number, n: number) {
  return `${week}-${n}`;
}

/** Первый урок дня: на нём появляется новый материал */
const firstOfDay = (day: number) => (day - 1) * LESSONS_PER_DAY + 1;

const DAY_TITLES: Record<Week['kind'], string[]> = {
  letters: ['Новые буквы', 'Ещё буквы', 'Слушаем', 'Узнаём', 'Формы букв', 'Повторение'],
  syllables: ['Новые слоги', 'Ещё слоги', 'Слушаем', 'Читаем', 'Сравниваем', 'Повторение'],
  words: ['Новые слова', 'Ещё слова', 'Слушаем', 'Значения', 'Собираем слова', 'Повторение'],
  text: ['Новые слова', 'Читаем текст', 'Вопросы к тексту', 'Слушаем текст', 'Собираем предложения', 'Повторение'],
  dialogue: ['Новые слова', 'Читаем диалог', 'Выбираем ответ', 'Слушаем диалог', 'Собираем реплики', 'Повторение'],
};
const REVIEW_TITLES = ['Формы и звуки', 'Похожие буквы', 'Слушаем', 'Узнаём', 'Смешанный урок', 'Повторение'];

export function examTitle(week: Week) {
  return week.bigExam ? 'Большой экзамен' : 'Экзамен недели';
}

function makeRef(week: Week, n: number): LessonRef {
  const day = Math.ceil(n / LESSONS_PER_DAY);
  const slot = ((n - 1) % LESSONS_PER_DAY) + 1;
  const isExam = n === LESSONS_PER_WEEK;
  const titles = week.review ? REVIEW_TITLES : DAY_TITLES[week.kind];
  let title = slot === 2 ? 'Закрепление' : 'Повторение';
  if (slot === 1) title = day === DAYS_PER_WEEK ? 'Подготовка к экзамену' : titles[day - 1];
  if (day === DAYS_PER_WEEK && slot === 2) title = 'Последнее повторение';
  if (isExam) title = examTitle(week);
  return { id: lessonId(week.n, n), week, n, day, slot, isExam, title };
}

export const ALL_LESSONS: LessonRef[] = ALL_WEEKS.flatMap((week) =>
  Array.from({ length: LESSONS_PER_WEEK }, (_, i) => makeRef(week, i + 1)),
);

export function getLesson(id: string) {
  const [w, n] = id.split('-').map(Number);
  const week = getWeek(w);
  return week && n >= 1 && n <= LESSONS_PER_WEEK ? makeRef(week, n) : undefined;
}

export function passMark(total: number) {
  return total <= 5 ? total - 1 : Math.ceil(total * 0.8);
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const uniqueBy = <T,>(list: T[], key: (x: T) => string) => {
  const seen = new Set<string>();
  return list.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
};

const group = (w: Week) => (w.kind === 'letters' || w.kind === 'syllables' ? w.kind : 'words');

/** Всё, что ученик уже видел этого же типа: неправильные варианты берём только отсюда */
export function poolFor(week: Week): Item[] {
  const earlier = ALL_WEEKS.filter((w) => w.n <= week.n && group(w) === group(week));
  return uniqueBy(earlier.flatMap((w) => w.items).reverse(), (x) => x.ar);
}

/** Прошлые недели для повторения: не дальше шести недель назад */
function recentItems(week: Week): Item[] {
  const past = ALL_WEEKS.filter((w) => w.n < week.n && w.n >= week.n - 6 && group(w) === group(week));
  return uniqueBy(past.flatMap((w) => w.items), (x) => x.ar);
}

const OPTION_KEY: Record<'see-hear' | 'hear-see' | 'meaning' | 'reverse' | 'form', (x: Item) => string> = {
  'see-hear': (x) => x.say,
  'hear-see': (x) => x.ar,
  meaning: (x) => x.ru,
  reverse: (x) => x.ar,
  form: (x) => x.ar,
};

export type ItemKind = keyof typeof OPTION_KEY;

export function choice(item: Item, kind: ItemKind, pool: Item[], index: number, random: () => number): ChoiceTask {
  const key = OPTION_KEY[kind];
  const others = uniqueBy(
    pool.filter((x) => key(x) !== key(item) && x.ar !== item.ar && x.ru !== item.ru && x.say !== item.say),
    key,
  );
  const near = shuffled(others.filter((x) => item.family && x.family === item.family), random);
  const far = shuffled(others.filter((x) => !item.family || x.family !== item.family), random);
  const picks = shuffled([item, ...[...near, ...far].slice(0, 2)], random);
  const options: Option[] = picks.map((x) => {
    if (kind === 'see-hear') return { id: x.id, say: x.say };
    if (kind === 'meaning') return { id: x.id, ru: x.ru };
    return { id: x.id, ar: x.ar };
  });
  const form = item.forms?.filter((f) => f.ar !== item.ar);
  const shownForm = form && form.length ? form[Math.floor(random() * form.length)].ar : item.ar;
  return {
    type: 'choice',
    key: `${index}-${item.id}-${kind}`,
    kind,
    itemId: item.id,
    ar: kind === 'see-hear' || kind === 'meaning' ? item.ar : kind === 'form' ? shownForm : undefined,
    say: kind === 'hear-see' || kind === 'meaning' ? item.say : undefined,
    ru: kind === 'reverse' ? item.ru : undefined,
    options,
    answerId: item.id,
    explainAr: item.ar,
    explainRu: item.ru,
  };
}

const LETTER_RE = /[ء-ي][ً-ْ]*/g;

const isSingleWord = (ar: string) => /^[ء-ْ]+$/.test(ar);

/** Сборка: одиночное слово собираем из букв, фразу из слов */
export function canBuild(ar: string) {
  if (isSingleWord(ar)) return (ar.match(LETTER_RE) ?? []).length >= 3;
  return ar.trim().split(/\s+/).length >= 2;
}

export function build(ar: string, ru: string, pool: string[], index: number, random: () => number, itemId?: string): BuildTask {
  const joined = isSingleWord(ar);
  const answer = joined ? (ar.match(LETTER_RE) as string[]) : ar.trim().split(/\s+/);
  const source = joined
    ? pool.flatMap((x) => x.match(LETTER_RE) ?? [])
    : pool.flatMap((x) => x.trim().split(/\s+/));
  const extras = shuffled(uniqueBy(source.filter((x) => !answer.includes(x)), (x) => x), random).slice(0, 2);
  return {
    type: 'build',
    key: `${index}-b-${ar}`,
    itemId,
    ru,
    say: ar,
    answer,
    bank: shuffled([...answer, ...extras], random),
    joined,
  };
}

function itemTasks(items: Item[], pool: Item[], kinds: ItemKind[], size: number, random: () => number, start = 0): ChoiceTask[] {
  const order = shuffled(items, random);
  return Array.from({ length: size }, (_, i) =>
    choice(order[i % order.length], kinds[(i + start) % kinds.length], pool, start + i, random),
  );
}

const hasForms = (x: Item) => (x.forms?.length ?? 0) > 1;

function kindsFor(week: Week): ItemKind[] {
  return group(week) === 'words' ? ['meaning', 'hear-see', 'reverse', 'see-hear'] : ['see-hear', 'hear-see'];
}

function introThenPractice(items: Item[], pool: Item[], week: Week, random: () => number): Task[] {
  const tasks: Task[] = [];
  const kinds: ItemKind[] = group(week) === 'words' ? ['meaning', 'hear-see'] : ['see-hear', 'hear-see'];
  items.forEach((item, i) => {
    tasks.push({ type: 'intro', key: `intro-${item.id}`, item });
    tasks.push(choice(item, kinds[i % kinds.length], pool, i, random));
  });
  // Короткий урок дополняем заданиями на те же элементы, чтобы их закрепить
  const extra = Math.max(0, 6 - items.length);
  tasks.push(...itemTasks(items, pool, kinds, extra, random, items.length));
  return tasks;
}

function matchTask(items: Item[], random: () => number, key: string): MatchTask {
  const distinct = uniqueBy(uniqueBy(items, (x) => x.ru), (x) => x.ar);
  return { type: 'match', key, pairs: shuffled(distinct, random).slice(0, 4) };
}

function textTasks(week: Week, random: () => number): ChoiceTask[] {
  return shuffled(week.textQuestions ?? [], random).map((t, i) => ({
    type: 'choice' as const,
    key: `t${i}`,
    kind: 'text' as const,
    ru: t.q,
    options: shuffled([{ id: 'right', ru: t.right }, { id: 'w1', ru: t.wrong[0] }, { id: 'w2', ru: t.wrong[1] }], random),
    answerId: 'right',
    explainRu: t.right,
  }));
}

function replyTasks(week: Week, random: () => number): ChoiceTask[] {
  return shuffled(week.replyQuestions ?? [], random).map((t, i) => ({
    type: 'choice' as const,
    key: `r${i}`,
    kind: 'reply' as const,
    ar: t.line,
    say: t.line,
    options: shuffled(
      [{ id: 'right', ar: t.right, say: t.right }, { id: 'w1', ar: t.wrong[0], say: t.wrong[0] }, { id: 'w2', ar: t.wrong[1], say: t.wrong[1] }],
      random,
    ),
    answerId: 'right',
    explainAr: t.right,
  }));
}

function lineItems(week: Week): Item[] {
  return (week.lines ?? []).map((l, i) => ({ id: `w${week.n}-line${i}`, ar: l.ar, say: l.ar, ru: l.ru }));
}

function buildsFromLines(week: Week, random: () => number): BuildTask[] {
  const lines = week.lines ?? [];
  const pool = lines.map((l) => l.ar);
  return shuffled(lines.filter((l) => canBuild(l.ar)), random).map((l, i) => build(l.ar, l.ru, pool, i, random));
}

function readTask(week: Week): ReadTask {
  return { type: 'read', key: 'read', title: week.title.replace('Текст: м', 'М').replace('Текст: з', 'З').replace('Текст: в', 'В'), lines: week.lines ?? [] };
}

function speakTask(item: Item, index: number, week: Week): SpeakTask {
  return { type: 'speak', key: `${index}-speak-${item.id}`, itemId: item.id, ar: item.ar, ru: item.ru, expected: item.say, isLetter: week.kind === 'letters' };
}

function examTasks(week: Week, random: () => number, voice: boolean): Task[] {
  if (week.kind === 'text') return [...textTasks(week, random), ...buildsFromLines(week, random).slice(0, 3)];
  if (week.kind === 'dialogue') return [...replyTasks(week, random), ...buildsFromLines(week, random).slice(0, 3)];
  const size = week.bigExam ? 16 : 10;
  // Большой экзамен проверяет не только эту неделю, а всю часть курса
  const items = week.bigExam ? poolFor(week).slice(0, 28) : week.items;
  const tasks: Task[] = itemTasks(items, poolFor(week), kindsFor(week), size, random);
  if (!voice) return tasks;
  // Каждое третье задание заменяем голосовым: буква на экране, ученик произносит её название
  return tasks.map((task, i) => {
    if (i % 3 !== 2 || task.type !== 'choice') return task;
    const item = items.find((x) => x.id === task.itemId);
    return item ? speakTask(item, i, week) : task;
  });
}

function cardDay(ref: LessonRef, random: () => number): Task[] {
  const { week, day } = ref;
  const pool = poolFor(week);
  const half = Math.ceil(week.items.length / 2);
  const first = week.items.slice(0, half);
  const second = week.items.slice(half);
  const kinds = kindsFor(week);

  if (week.review) {
    const sample = shuffled(week.items, random).slice(0, LESSON_SIZE);
    const forms = sample.filter(hasForms);
    if (day === 1 && forms.length) return itemTasks(forms, pool, ['form'], LESSON_SIZE, random);
    if (day === 2) return [matchTask(sample, random, 'm1'), ...itemTasks(sample, pool, kinds, LESSON_SIZE - 2, random), matchTask(sample, random, 'm2')];
    if (day === 3) return itemTasks(sample, pool, ['hear-see'], LESSON_SIZE, random);
    if (day === 4) return itemTasks(sample, pool, group(week) === 'words' ? ['meaning', 'reverse'] : ['see-hear'], LESSON_SIZE, random);
    return [matchTask(sample, random, 'm1'), ...itemTasks(sample, pool, kinds, LESSON_SIZE - 1, random)];
  }

  switch (day) {
    case 1:
      return introThenPractice(first, pool, week, random);
    case 2:
      return [...introThenPractice(second, pool, week, random), matchTask(week.items, random, 'm1')];
    case 3:
      return itemTasks(week.items, pool, ['hear-see', 'see-hear'], LESSON_SIZE, random);
    case 4:
      return [
        matchTask(week.items, random, 'm1'),
        ...itemTasks(week.items, pool, group(week) === 'words' ? ['meaning', 'reverse'] : ['see-hear', 'hear-see'], LESSON_SIZE - 1, random),
      ];
    case 5: {
      if (week.kind === 'letters') return itemTasks(week.items.filter(hasForms).concat(week.items), pool, ['form'], LESSON_SIZE, random);
      const texts = pool.map((x) => x.ar);
      const builds = shuffled(week.items.filter((x) => canBuild(x.ar)), random).map((x, i) => build(x.ar, x.ru, texts, i, random, x.id));
      return [...builds, ...itemTasks(week.items, pool, kinds, Math.max(3, LESSON_SIZE - builds.length), random, builds.length)];
    }
    default: {
      const recent = shuffled(recentItems(week), random).slice(0, 5);
      const mix = recent.length ? [...week.items, ...recent] : week.items;
      return [matchTask(mix, random, 'm1'), ...itemTasks(mix, pool, kinds, LESSON_SIZE - 1, random)];
    }
  }
}

function readingDay(ref: LessonRef, random: () => number): Task[] {
  const { week, day } = ref;
  const pool = poolFor(week);
  const lines = lineItems(week);
  const linePool = [...lines, ...pool];
  const kinds = kindsFor(week);
  const talks = week.kind === 'dialogue';

  switch (day) {
    case 1:
      return [...introThenPractice(week.items, pool, week, random), matchTask(pool.slice(0, 8), random, 'm1')];
    case 2:
      return [readTask(week), ...itemTasks(lines, linePool, ['meaning'], Math.min(5, lines.length), random)];
    case 3:
      return [
        readTask(week),
        ...(talks ? replyTasks(week, random) : textTasks(week, random)),
        ...itemTasks(lines, linePool, ['meaning'], 2, random, 10),
      ];
    case 4:
      return itemTasks(lines, linePool, ['hear-see', 'see-hear'], LESSON_SIZE - 2, random);
    case 5: {
      const builds = buildsFromLines(week, random);
      return [...builds, ...itemTasks(lines, linePool, ['hear-see'], Math.max(0, 5 - builds.length), random, 20)];
    }
    default:
      return [
        matchTask(pool.slice(0, 8), random, 'm1'),
        ...(talks ? replyTasks(week, random) : textTasks(week, random)),
        ...itemTasks(week.items, pool, kinds, 3, random),
      ];
  }
}

/** Дополнительные уроки дня: без нового материала, только то, что ученик уже видел */
function seenItems(ref: LessonRef): Item[] {
  const { week, day } = ref;
  if (week.review) return week.items;
  return day === 1 ? week.items.slice(0, Math.ceil(week.items.length / 2)) : week.items;
}

function practiceDay(ref: LessonRef, random: () => number): Task[] {
  const { week, day, slot } = ref;
  const pool = poolFor(week);
  const seen = seenItems(ref);
  const sample = shuffled(seen, random).slice(0, 10);
  const kinds = kindsFor(week);
  const recent = shuffled(recentItems(week), random).slice(0, 6);
  const matchFrom = (items: Item[]) => (items.length >= 4 ? items : [...items, ...pool]);
  const hasLines = (week.kind === 'text' || week.kind === 'dialogue') && day >= 2;

  // Закрепление: то, что было сегодня
  if (slot === 2 && day < DAYS_PER_WEEK) {
    const tasks: Task[] = [matchTask(matchFrom(sample), random, 'm1')];
    if (hasLines) {
      tasks.push(...shuffled(buildsFromLines(week, random), random).slice(0, 3));
    } else if (group(week) === 'words') {
      const texts = pool.map((x) => x.ar);
      const builds = shuffled(seen.filter((x) => canBuild(x.ar)), random).slice(0, 2);
      tasks.push(...builds.map((x, i) => build(x.ar, x.ru, texts, i, random, x.id)));
    }
    tasks.push(...itemTasks(sample, pool, kinds, 9 - tasks.length, random, tasks.length));
    return tasks;
  }

  // Повторение: сегодняшнее вместе со старым материалом
  const mix = [...sample, ...recent];
  const review: Task[] = [matchTask(matchFrom(mix), random, 'm1')];
  if (day === DAYS_PER_WEEK && slot === 2) {
    if (week.textQuestions) review.push(...textTasks(week, random));
    if (week.replyQuestions) review.push(...replyTasks(week, random));
  }
  review.push(...itemTasks(mix, pool, kinds, Math.max(4, 9 - review.length), random, 40));
  if (hasLines) review.push(...itemTasks(lineItems(week), [...lineItems(week), ...pool], ['hear-see'], 2, random, 60));
  return review;
}

export function buildLesson(ref: LessonRef, random = Math.random, voice = false): Task[] {
  if (ref.isExam) return examTasks(ref.week, random, voice);
  if (ref.slot > 1 || ref.day === DAYS_PER_WEEK) return practiceDay(ref, random);
  const body = ref.week.kind === 'text' || ref.week.kind === 'dialogue' ? readingDay(ref, random) : cardDay(ref, random);
  if (ref.day === 1 && ref.week.tip) {
    return [{ type: 'tip', key: 'tip', title: ref.week.title, text: ref.week.tip }, ...body];
  }
  return body;
}

/** Что ученик уже видел: первая половина недели после урока 1, вся неделя после урока 2 */
export function knownItems(done: Record<string, unknown>): Item[] {
  const known: Item[] = [];
  for (const week of ALL_WEEKS) {
    const half = Math.ceil(week.items.length / 2);
    if (lessonId(week.n, firstOfDay(2)) in done) known.push(...week.items);
    else if (lessonId(week.n, firstOfDay(1)) in done) known.push(...week.items.slice(0, week.review ? week.items.length : half));
  }
  return uniqueBy(known, (x) => x.ar);
}

export function buildPractice(done: Record<string, unknown>, mistakes: Record<string, number>, size = 10, random = Math.random): Task[] {
  const items = knownItems(done);
  const weak = shuffled(items.filter((x) => (mistakes[x.id] ?? 0) > 0), random).sort(
    (a, b) => (mistakes[b.id] ?? 0) - (mistakes[a.id] ?? 0),
  );
  const rest = shuffled(items.filter((x) => !mistakes[x.id]), random);
  const picked = [...weak, ...rest].slice(0, size);
  const sameType = (item: Item) => {
    const week = ALL_WEEKS.find((w) => w.items.some((x) => x.id === item.id));
    return week ?? ALL_WEEKS[0];
  };
  return picked.map((item, i) => {
    const week = sameType(item);
    const kinds = kindsFor(week);
    return choice(item, kinds[i % kinds.length], [...poolFor(week), ...items], i, random);
  });
}
