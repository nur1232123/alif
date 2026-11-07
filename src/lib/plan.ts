import { ALL_WEEKS, getWeek } from '@/data/course';
import type { Item, Line, Week } from '@/data/types';

export const DAYS_PER_WEEK = 7;
/** Цель по умолчанию: столько уроков в день. При этом темпе курс рассчитан на год. */
export const LESSONS_PER_DAY = 3;
export const LESSONS_PER_WEEK = DAYS_PER_WEEK * LESSONS_PER_DAY;
export const TOTAL_LESSONS = ALL_WEEKS.length * LESSONS_PER_WEEK;
const LESSON_SIZE = 9;
/** Сколько нового в одном уроке */
const NEW_PER_LESSON = 3;

export type ChoiceKind = 'see-hear' | 'hear-see' | 'meaning' | 'reverse' | 'form' | 'first-letter' | 'text' | 'reply';
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

type Mode = 'forms' | 'first-letter' | 'listen' | 'meanings' | 'build' | 'mixed' | 'prep';

/** Что происходит в уроке */
export type Spec =
  | { kind: 'intro'; chunk: number }
  | { kind: 'checkpoint'; from: number; to: number }
  | { kind: 'practice'; mode: Mode }
  | { kind: 'reading'; day: number; slot: number }
  | { kind: 'exam' };

/** n: номер урока в неделе (1–21), day: день недели (1–7), slot: урок дня (1–3) */
export type LessonRef = { id: string; week: Week; n: number; day: number; slot: number; isExam: boolean; title: string; spec: Spec };

export function lessonId(week: number, n: number) {
  return `${week}-${n}`;
}

const isReadingWeek = (w: Week) => !!w.review || w.kind === 'text' || w.kind === 'dialogue';
const group = (w: Week) => (w.kind === 'letters' || w.kind === 'syllables' ? w.kind : 'words');

/** Новый материал недели делится на маленькие части: по одной части в уроке */
export function introChunks(week: Week): Item[][] {
  if (week.review) return [];
  if (week.kind === 'text' || week.kind === 'dialogue') return [week.items];
  const n = week.items.length;
  const count = Math.ceil(n / NEW_PER_LESSON);
  return Array.from({ length: count }, (_, i) => week.items.slice(Math.round((i * n) / count), Math.round(((i + 1) * n) / count)));
}

const PRACTICE_MODES: Record<'letters' | 'syllables' | 'words', Mode[]> = {
  letters: ['first-letter', 'forms', 'listen', 'meanings', 'mixed'],
  syllables: ['listen', 'meanings', 'build', 'mixed'],
  words: ['build', 'listen', 'meanings', 'mixed'],
};

const plans = new Map<number, Spec[]>();

/** План недели: 21 урок. Сначала новое по частям, потом закрепление, в конце экзамен. */
export function weekPlan(week: Week): Spec[] {
  const cached = plans.get(week.n);
  if (cached) return cached;
  let specs: Spec[];
  if (isReadingWeek(week)) {
    specs = Array.from({ length: LESSONS_PER_WEEK }, (_, i): Spec =>
      i === LESSONS_PER_WEEK - 1 ? { kind: 'exam' } : { kind: 'reading', day: Math.ceil((i + 1) / LESSONS_PER_DAY), slot: (i % LESSONS_PER_DAY) + 1 },
    );
  } else {
    const chunks = introChunks(week);
    // Большую неделю делим пополам и проверяем каждую половину
    const half = chunks.length >= 8 ? Math.ceil(chunks.length / 2) : 0;
    specs = [];
    chunks.forEach((_, i) => {
      specs.push({ kind: 'intro', chunk: i });
      if (half && i === half - 1) specs.push({ kind: 'checkpoint', from: 0, to: half });
    });
    if (half) specs.push({ kind: 'checkpoint', from: half, to: chunks.length });
    const modes = PRACTICE_MODES[group(week)];
    let k = 0;
    while (specs.length < LESSONS_PER_WEEK - 2) specs.push({ kind: 'practice', mode: modes[k++ % modes.length] });
    specs.push({ kind: 'practice', mode: 'prep' });
    specs.push({ kind: 'exam' });
  }
  plans.set(week.n, specs);
  return specs;
}

const READING_TITLES: Record<'text' | 'dialogue' | 'review', string[]> = {
  text: ['Новые слова', 'Читаем текст', 'Вопросы к тексту', 'Слушаем текст', 'Собираем предложения', 'Повторение'],
  dialogue: ['Новые слова', 'Читаем диалог', 'Выбираем ответ', 'Слушаем диалог', 'Собираем реплики', 'Повторение'],
  review: ['Главные фразы', 'Пары', 'Слушаем', 'Значения', 'Смешанный урок', 'Повторение'],
};

export function examTitle(week: Week) {
  return week.bigExam ? 'Большой экзамен' : 'Экзамен недели';
}

function specTitle(week: Week, spec: Spec): string {
  const g = group(week);
  switch (spec.kind) {
    case 'intro': {
      const chunk = introChunks(week)[spec.chunk];
      if (g === 'letters') return `Буквы ${chunk.map((x) => x.ar).join(' ')}`;
      if (g === 'syllables') return `Слоги ${chunk.map((x) => x.ar).join(' ')}`;
      return spec.chunk === 0 ? 'Новые слова' : 'Ещё слова';
    }
    case 'checkpoint':
      return spec.from === 0 ? 'Проверка: первая половина' : 'Проверка: вторая половина';
    case 'practice': {
      const titles: Record<Mode, string> = {
        forms: 'Формы букв',
        'first-letter': 'Слова и буквы',
        listen: 'Слушаем',
        meanings: g === 'words' ? 'Значения' : 'Узнаём',
        build: g === 'words' ? 'Собираем слова' : 'Сравниваем',
        mixed: 'Повторение',
        prep: 'Подготовка к экзамену',
      };
      return titles[spec.mode];
    }
    case 'reading': {
      if (spec.day === DAYS_PER_WEEK) return spec.slot === 1 ? 'Подготовка к экзамену' : 'Последнее повторение';
      if (spec.slot > 1) return spec.slot === 2 ? 'Закрепление' : 'Повторение';
      const key = week.review ? 'review' : (week.kind as 'text' | 'dialogue');
      return READING_TITLES[key][spec.day - 1];
    }
    default:
      return examTitle(week);
  }
}

function makeRef(week: Week, n: number): LessonRef {
  const spec = weekPlan(week)[n - 1];
  const day = Math.ceil(n / LESSONS_PER_DAY);
  const slot = ((n - 1) % LESSONS_PER_DAY) + 1;
  const isExam = spec.kind === 'exam' || spec.kind === 'checkpoint';
  return { id: lessonId(week.n, n), week, n, day, slot, isExam, title: specTitle(week, spec), spec };
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

/** Неправильные варианты берём только из выученного: прошлые недели того же типа и уже пройденное на этой */
function poolOf(week: Week, seenThisWeek: Item[]): Item[] {
  const earlier = ALL_WEEKS.filter((w) => w.n < week.n && group(w) === group(week)).flatMap((w) => w.items);
  return uniqueBy([...seenThisWeek, ...earlier.reverse()], (x) => x.ar);
}

/** Всё этого типа до конца недели включительно */
export function poolFor(week: Week): Item[] {
  return poolOf(week, week.items);
}

/** Прошлые недели для повторения: не дальше шести недель назад */
function recentItems(week: Week): Item[] {
  const past = ALL_WEEKS.filter((w) => w.n < week.n && w.n >= week.n - 6 && group(w) === group(week));
  return uniqueBy(past.flatMap((w) => w.items), (x) => x.ar);
}

type ItemKind = 'see-hear' | 'hear-see' | 'meaning' | 'reverse' | 'form' | 'first-letter';

const OPTION_KEY: Record<ItemKind, (x: Item) => string> = {
  'see-hear': (x) => x.say,
  'hear-see': (x) => x.ar,
  meaning: (x) => x.ru,
  reverse: (x) => x.ar,
  form: (x) => x.ar,
  'first-letter': (x) => x.ar,
};

const hasForms = (x: Item) => (x.forms?.length ?? 0) > 1;

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
  if (kind === 'first-letter' && item.example) {
    return {
      type: 'choice',
      key: `${index}-${item.id}-${kind}`,
      kind,
      itemId: item.id,
      ar: item.example.ar,
      say: item.example.ar,
      options,
      answerId: item.id,
      explainAr: item.example.ar,
      explainRu: `${item.example.ru}: начинается с буквы ${item.ru}`,
    };
  }
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
  const source = joined ? pool.flatMap((x) => x.match(LETTER_RE) ?? []) : pool.flatMap((x) => x.trim().split(/\s+/));
  const extras = shuffled(uniqueBy(source.filter((x) => !answer.includes(x)), (x) => x), random).slice(0, 2);
  return { type: 'build', key: `${index}-b-${ar}`, itemId, ru, say: ar, answer, bank: shuffled([...answer, ...extras], random), joined };
}

function itemTasks(items: Item[], pool: Item[], kinds: ItemKind[], size: number, random: () => number, start = 0): ChoiceTask[] {
  if (!items.length || size <= 0) return [];
  const order = shuffled(items, random);
  return Array.from({ length: size }, (_, i) => {
    const item = order[i % order.length];
    let kind = kinds[(i + start) % kinds.length];
    if (kind === 'first-letter' && !item.example) kind = 'hear-see';
    if (kind === 'form' && !hasForms(item)) kind = 'see-hear';
    return choice(item, kind, pool, start + i, random);
  });
}

function kindsFor(week: Week): ItemKind[] {
  if (week.kind === 'letters') return ['see-hear', 'hear-see', 'first-letter'];
  return group(week) === 'words' ? ['meaning', 'hear-see', 'reverse', 'see-hear'] : ['see-hear', 'hear-see'];
}

function matchTask(items: Item[], random: () => number, key: string): MatchTask {
  const distinct = uniqueBy(uniqueBy(items, (x) => x.ru), (x) => x.ar);
  return { type: 'match', key, pairs: shuffled(distinct, random).slice(0, 4) };
}

/** Урок с новым: каждое новое показываем и сразу проверяем, потом повторяем пройденное */
function introLesson(week: Week, chunkIndex: number, random: () => number): Task[] {
  const chunks = introChunks(week);
  const fresh = chunks[chunkIndex];
  const before = chunks.slice(0, chunkIndex).flat();
  const seen = [...before, ...fresh];
  const pool = poolOf(week, seen);
  const first: ItemKind[] = group(week) === 'words' ? ['meaning', 'hear-see'] : ['see-hear', 'hear-see'];
  const tasks: Task[] = [];
  fresh.forEach((item, i) => {
    tasks.push({ type: 'intro', key: `intro-${item.id}`, item });
    tasks.push(choice(item, first[i % first.length], pool, i, random));
  });
  // Слово-пример: с какой буквы начинается
  if (week.kind === 'letters') fresh.forEach((item, i) => tasks.push(choice(item, 'first-letter', pool, 10 + i, random)));
  if (seen.length >= 4) tasks.push(matchTask(seen, random, 'm1'));
  // Повторяем прошлые части недели, чтобы не забывались
  const review = before.length ? shuffled(before, random).slice(0, 3) : fresh;
  tasks.push(...itemTasks(review, pool, kindsFor(week), 3, random, 20));
  return tasks;
}

function practiceLesson(week: Week, mode: Mode, random: () => number): Task[] {
  const pool = poolFor(week);
  const kinds = kindsFor(week);
  const items = week.items;
  switch (mode) {
    case 'forms':
      return [matchTask(items, random, 'm1'), ...itemTasks(items.filter(hasForms), pool, ['form'], LESSON_SIZE - 1, random)];
    case 'first-letter':
      return itemTasks(items, pool, ['first-letter', 'first-letter', 'hear-see'], LESSON_SIZE, random);
    case 'listen':
      return itemTasks(items, pool, ['hear-see', 'see-hear'], LESSON_SIZE, random);
    case 'meanings':
      return [
        matchTask(items, random, 'm1'),
        ...itemTasks(items, pool, group(week) === 'words' ? ['meaning', 'reverse'] : ['see-hear', 'hear-see'], LESSON_SIZE - 1, random),
      ];
    case 'build': {
      const texts = pool.map((x) => x.ar);
      const builds = shuffled(items.filter((x) => canBuild(x.ar)), random)
        .slice(0, 4)
        .map((x, i) => build(x.ar, x.ru, texts, i, random, x.id));
      return [...builds, ...itemTasks(items, pool, kinds, Math.max(4, LESSON_SIZE - builds.length), random, builds.length)];
    }
    default: {
      const recent = mode === 'prep' ? [] : shuffled(recentItems(week), random).slice(0, 5);
      const mix = [...shuffled(items, random).slice(0, 10), ...recent];
      return [matchTask(mix, random, 'm1'), ...itemTasks(mix, pool, kinds, LESSON_SIZE + (mode === 'prep' ? 1 : -1), random)];
    }
  }
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
  return { type: 'read', key: 'read', title: week.title.replace(/^Текст: (.)/, (_, c: string) => c.toUpperCase()), lines: week.lines ?? [] };
}

function speakTask(item: Item, index: number, week: Week): SpeakTask {
  return { type: 'speak', key: `${index}-speak-${item.id}`, itemId: item.id, ar: item.ar, ru: item.ru, expected: item.say, isLetter: week.kind === 'letters' };
}

function withVoice(tasks: Task[], items: Item[], week: Week, voice: boolean): Task[] {
  if (!voice) return tasks;
  // Каждое третье задание заменяем голосовым: на экране буква или слово, ученик произносит
  return tasks.map((task, i) => {
    if (i % 3 !== 2 || task.type !== 'choice') return task;
    const item = items.find((x) => x.id === task.itemId);
    return item ? speakTask(item, i, week) : task;
  });
}

function examTasks(week: Week, random: () => number, voice: boolean): Task[] {
  if (week.kind === 'text') return [...textTasks(week, random), ...buildsFromLines(week, random).slice(0, 3)];
  if (week.kind === 'dialogue') return [...replyTasks(week, random), ...buildsFromLines(week, random).slice(0, 3)];
  const size = week.bigExam ? 16 : 10;
  // Большой экзамен проверяет не только эту неделю, а всю часть курса
  const items = week.bigExam ? poolFor(week).slice(0, 28) : week.items;
  return withVoice(itemTasks(items, poolFor(week), kindsFor(week), size, random), items, week, voice);
}

function checkpointTasks(week: Week, from: number, to: number, random: () => number, voice: boolean): Task[] {
  const chunks = introChunks(week);
  const items = chunks.slice(from, to).flat();
  const pool = poolOf(week, chunks.slice(0, to).flat());
  return withVoice(itemTasks(items, pool, kindsFor(week), 10, random), items, week, voice);
}

/** Первые уроки дня в неделях с текстом, диалогом или повторением */
function readingFirst(week: Week, day: number, random: () => number): Task[] {
  const pool = poolFor(week);
  const kinds = kindsFor(week);
  if (week.review) {
    const sample = shuffled(week.items, random).slice(0, LESSON_SIZE);
    if (day === 1) {
      return week.items.slice(0, 5).flatMap((item, i): Task[] => [{ type: 'intro', key: `intro-${item.id}`, item }, choice(item, 'meaning', pool, i, random)]);
    }
    if (day === 2) return [matchTask(sample, random, 'm1'), ...itemTasks(sample, pool, kinds, LESSON_SIZE - 2, random), matchTask(sample, random, 'm2')];
    if (day === 3) return itemTasks(sample, pool, ['hear-see'], LESSON_SIZE, random);
    if (day === 4) return itemTasks(sample, pool, ['meaning', 'reverse'], LESSON_SIZE, random);
    return [matchTask(sample, random, 'm1'), ...itemTasks(sample, pool, kinds, LESSON_SIZE - 1, random)];
  }
  const lines = lineItems(week);
  const linePool = [...lines, ...pool];
  const talks = week.kind === 'dialogue';
  switch (day) {
    case 1: {
      const tasks: Task[] = [];
      week.items.forEach((item, i) => {
        tasks.push({ type: 'intro', key: `intro-${item.id}`, item });
        tasks.push(choice(item, i % 2 ? 'hear-see' : 'meaning', pool, i, random));
      });
      // Короткий урок дополняем повторением тех же слов
      tasks.push(...itemTasks(week.items, pool, kinds, Math.max(0, 6 - week.items.length), random, 30));
      return [...tasks, matchTask(week.items.length >= 4 ? week.items : pool.slice(0, 8), random, 'm1')];
    }
    case 2:
      return [readTask(week), ...itemTasks(lines, linePool, ['meaning'], Math.min(5, lines.length), random)];
    case 3:
      return [readTask(week), ...(talks ? replyTasks(week, random) : textTasks(week, random)), ...itemTasks(lines, linePool, ['meaning'], 2, random, 10)];
    case 4:
      return itemTasks(lines, linePool, ['hear-see', 'see-hear'], LESSON_SIZE - 2, random);
    case 5: {
      const builds = buildsFromLines(week, random);
      return [...builds, ...itemTasks(lines, linePool, ['hear-see'], Math.max(0, 5 - builds.length), random, 20)];
    }
    default:
      return [matchTask(pool.slice(0, 8), random, 'm1'), ...(talks ? replyTasks(week, random) : textTasks(week, random)), ...itemTasks(week.items, pool, kinds, 3, random)];
  }
}

/** Закрепление и повторение в неделях с текстом, диалогом или повторением */
function readingExtra(week: Week, day: number, slot: number, random: () => number): Task[] {
  const pool = poolFor(week);
  const seen = week.items;
  const sample = shuffled(seen, random).slice(0, 10);
  const kinds = kindsFor(week);
  const recent = shuffled(recentItems(week), random).slice(0, 6);
  const matchFrom = (items: Item[]) => (items.length >= 4 ? items : [...items, ...pool]);
  const hasLines = (week.kind === 'text' || week.kind === 'dialogue') && day >= 2;

  if (slot === 2 && day < DAYS_PER_WEEK) {
    const tasks: Task[] = [matchTask(matchFrom(sample), random, 'm1')];
    if (hasLines) tasks.push(...shuffled(buildsFromLines(week, random), random).slice(0, 3));
    else {
      const texts = pool.map((x) => x.ar);
      const builds = shuffled(seen.filter((x) => canBuild(x.ar)), random).slice(0, 2);
      tasks.push(...builds.map((x, i) => build(x.ar, x.ru, texts, i, random, x.id)));
    }
    tasks.push(...itemTasks(sample, pool, kinds, 9 - tasks.length, random, tasks.length));
    return tasks;
  }
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
  const { week, spec } = ref;
  let body: Task[];
  switch (spec.kind) {
    case 'intro':
      body = introLesson(week, spec.chunk, random);
      break;
    case 'checkpoint':
      return checkpointTasks(week, spec.from, spec.to, random, voice);
    case 'practice':
      body = practiceLesson(week, spec.mode, random);
      break;
    case 'reading':
      body = spec.slot === 1 && spec.day < DAYS_PER_WEEK ? readingFirst(week, spec.day, random) : readingExtra(week, spec.day, spec.slot, random);
      break;
    default:
      return examTasks(week, random, voice);
  }
  if (ref.n === 1 && week.tip) return [{ type: 'tip', key: 'tip', title: week.title, text: week.tip }, ...body];
  return body;
}

/** Что ученик уже видел: каждый пройденный урок с новым открывает свою часть недели */
export function knownItems(done: Record<string, unknown>): Item[] {
  const known: Item[] = [];
  for (const week of ALL_WEEKS) {
    if (isReadingWeek(week)) {
      if (lessonId(week.n, 1) in done) known.push(...week.items);
      continue;
    }
    const chunks = introChunks(week);
    weekPlan(week).forEach((spec, i) => {
      if (spec.kind === 'intro' && lessonId(week.n, i + 1) in done) known.push(...chunks[spec.chunk]);
    });
  }
  return uniqueBy(known, (x) => x.ar);
}

export type SrsState = Record<string, { box: number; due: string }>;

/** Элементы, которые пора повторить сегодня */
export function dueItems(done: Record<string, unknown>, srs: SrsState, today: string): Item[] {
  return knownItems(done).filter((x) => srs[x.id] && srs[x.id].due <= today);
}

export function buildPractice(
  done: Record<string, unknown>,
  mistakes: Record<string, number>,
  size = 10,
  random = Math.random,
  srs: SrsState = {},
  today = '',
): Task[] {
  const items = knownItems(done);
  // Сначала то, что пора повторить, потом ошибки, потом остальное
  const due = shuffled(items.filter((x) => srs[x.id] && srs[x.id].due <= today), random).sort((a, b) => srs[a.id].box - srs[b.id].box);
  const dueIds = new Set(due.map((x) => x.id));
  const weak = shuffled(items.filter((x) => !dueIds.has(x.id) && (mistakes[x.id] ?? 0) > 0), random).sort(
    (a, b) => (mistakes[b.id] ?? 0) - (mistakes[a.id] ?? 0),
  );
  const rest = shuffled(items.filter((x) => !dueIds.has(x.id) && !mistakes[x.id]), random);
  const picked = [...due, ...weak, ...rest].slice(0, size);
  const weekOf = (item: Item) => ALL_WEEKS.find((w) => w.items.some((x) => x.id === item.id)) ?? ALL_WEEKS[0];
  return picked.map((item, i) => {
    const week = weekOf(item);
    const kinds = kindsFor(week);
    // Варианты только из выученного того же типа
    const pool = items.filter((x) => group(weekOf(x)) === group(week));
    return choice(item, kinds[i % kinds.length], pool.length >= 3 ? pool : poolFor(week), i, random);
  });
}
