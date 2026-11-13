// Мини-курс «Учим цифры» во вкладке «Цифры»: три уровня, отдельно от пути.
// Арабский текст мой, его проверяет автор курса.
import type { Item } from '@/data/types';
import { NUMERALS_REF, toArabicDigits } from '@/data/reference';
import { choice, type ChoiceTask, type Task } from './plan';

export type NumbersLevel = 1 | 2 | 3;
export const NUMBER_LEVELS: { level: NumbersLevel; title: string; text: string }[] = [
  { level: 1, title: 'Цифры от ٠ до ٩', text: 'Как выглядит каждая цифра и как её не перепутать' },
  { level: 2, title: 'Числа из нескольких цифр', text: 'Читаем числа вроде ٣٥ и не путаем их с ٥٣' },
  { level: 3, title: 'Числа по-арабски', text: 'Называем числа словами: от 11 до 100' },
];
/** Звезда за уровень: столько ответов с первого раза */
export const NUMBERS_PASS = 0.8;

export const numbersLessonId = (level: NumbersLevel) => `numbers-${level}`;
export const parseNumbersLevel = (id: string): NumbersLevel | null => {
  const m = /^numbers-([123])$/.exec(id);
  return m ? (Number(m[1]) as NumbersLevel) : null;
};

// Подсказки, как запомнить цифру
const HINTS = [
  'Ноль — просто точка',
  'Как наша 1',
  'Палочка с одним зубчиком наверху',
  'Палочка с двумя зубчиками наверху',
  'Похожа на перевёрнутую 3',
  'Кружок. Это пять, а не ноль: ноль — точка',
  'Как 7, отражённая в зеркале',
  'Галочка, как буква V',
  'Перевёрнутая галочка, как крыша',
  'Как наша 9',
];
// Похожие цифры: их дают в вариантах рядом, чтобы научиться различать
const FAMILY: Record<number, string> = { 2: 'teeth', 3: 'teeth', 7: 'v', 8: 'v', 0: 'round', 5: 'round', 4: 'curl', 6: 'curl' };

const DIGITS: Item[] = NUMERALS_REF.slice(0, 10).map((n, i) => ({
  id: `d-${i}`,
  ar: n.digit,
  say: n.word,
  ru: n.value,
  note: HINTS[i],
  family: FAMILY[i],
}));

// Числа словами для уровня 3. 1–10 из справочника, остальное ниже
const WORDS: [number, string, string?][] = [
  [11, 'أَحَدَ عَشَرَ', 'Один и десять'],
  [12, 'اِثْنَا عَشَرَ', 'Два и десять'],
  [13, 'ثَلَاثَةَ عَشَرَ', 'Три и десять'],
  [15, 'خَمْسَةَ عَشَرَ', 'Пять и десять'],
  [20, 'عِشْرُونَ', 'Двадцать'],
  [30, 'ثَلَاثُونَ', 'Похоже на «три»: ثَلَاثَة'],
  [40, 'أَرْبَعُونَ', 'Похоже на «четыре»: أَرْبَعَة'],
  [50, 'خَمْسُونَ', 'Похоже на «пять»: خَمْسَة'],
  [21, 'وَاحِدٌ وَعِشْرُونَ', 'Один и двадцать'],
  [25, 'خَمْسَةٌ وَعِشْرُونَ', 'Пять и двадцать'],
  [35, 'خَمْسَةٌ وَثَلَاثُونَ', 'Пять и тридцать'],
  [100, 'مِائَةٌ', 'Сто'],
];
const wordItem = (n: number, ar: string, note?: string): Item => ({ id: `nw-${n}`, ar, say: ar, ru: String(n), note });
const BASE_WORDS: Item[] = NUMERALS_REF.slice(1, 11).map((n) => wordItem(Number(n.value), n.word));
const NEW_WORDS: Item[] = WORDS.map(([n, ar, note]) => wordItem(n, ar, note));

function shuffled<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Мини-курс не влияет на повторение слов в пути, поэтому у заданий нет itemId
const loose = (task: ChoiceTask, kind: ChoiceTask['kind']): ChoiceTask => ({ ...task, kind, itemId: undefined });

function itemChoice(item: Item, ask: 'number' | 'number-ar', pool: Item[], i: number, random: () => number): ChoiceTask {
  return loose(choice(item, ask === 'number' ? 'meaning' : 'reverse', pool, i, random), ask);
}

function level1(random: () => number): Task[] {
  const tasks: Task[] = [
    { type: 'tip', key: 'n1-tip', label: 'ПРАВИЛО', title: 'Арабские цифры', text: 'Цифр десять, как у нас, и это не буквы. Посмотрите на каждую и запомните подсказку.' },
  ];
  for (const group of [DIGITS.slice(0, 5), DIGITS.slice(5)]) {
    group.forEach((d) => tasks.push({ type: 'intro', key: `n1-in-${d.id}`, item: d }));
    shuffled(group, random).forEach((d, i) => tasks.push(itemChoice(d, 'number', DIGITS, i, random)));
  }
  shuffled(DIGITS, random)
    .slice(0, 6)
    .forEach((d, i) => tasks.push(itemChoice(d, i % 2 ? 'number' : 'number-ar', DIGITS, 20 + i, random)));
  return tasks;
}

/** Задание «какое это число» на числе из нескольких цифр */
function multiChoice(n: number, i: number, random: () => number): ChoiceTask {
  const s = String(n);
  const reversed = Number([...s].reverse().join(''));
  const pos = Math.floor(random() * s.length);
  const changedDigit = (Number(s[pos]) + 1 + Math.floor(random() * 8)) % 10;
  const changed = Number(s.slice(0, pos) + changedDigit + s.slice(pos + 1));
  // Сначала самые коварные варианты: те же цифры наоборот и одна цифра другая. Запасные идут по порядку
  const values = [n];
  for (const v of [reversed, changed, n + 10, n - 10, n + 1, n - 1, n + 2, n - 2]) {
    if (values.length < 3 && !values.includes(v) && String(v).length === s.length) values.push(v);
  }
  const options = shuffled(values, random).map((v) => ({ id: `v${v}`, ru: String(v), ar: toArabicDigits(v) }));
  const showArabic = i % 3 !== 2;
  return {
    type: 'choice',
    key: `n2-${i}-${n}`,
    kind: showArabic ? 'number' : 'number-ar',
    ar: showArabic ? toArabicDigits(n) : undefined,
    ru: showArabic ? undefined : String(n),
    options: options.map((o) => (showArabic ? { id: o.id, ru: o.ru } : { id: o.id, ar: o.ar })),
    answerId: `v${n}`,
    explainAr: toArabicDigits(n),
    explainRu: `= ${n}`,
  };
}

function level2(random: () => number): Task[] {
  const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const numbers = [between(12, 49), between(51, 98), between(12, 98), between(102, 498), between(501, 989), between(1001, 2099), between(2101, 9898)];
  const extra = [between(13, 97), between(103, 979), between(1200, 9800)];
  // Не берём числа вроде 22 и 303: их нельзя перепутать, читая в обратную сторону
  const fine = (n: number) => String(n) !== [...String(n)].reverse().join('');
  const list = [...numbers, ...extra].map((n) => (fine(n) ? n : n + 1));
  return [
    // Первым экраном уровня: порядок цифр на письме и порядок слов вслух
    {
      type: 'tip',
      key: 'n2-important',
      label: 'ВАЖНО',
      title: 'Пишем как у нас, говорим наоборот',
      text: 'На письме цифры стоят в том же порядке, что и у нас: ٣٢ — это 32. Но вслух по-арабски сначала называют единицы, потом десятки.',
      example: { ar: 'اِثْنَانِ وَثَلَاثُونَ', ru: '32, дословно «два и тридцать»' },
    },
    {
      type: 'tip',
      key: 'n2-tip',
      label: 'ПРАВИЛО',
      title: 'Слева направо',
      text: 'Буквы пишут справа налево, а числа читают слева направо, как у нас. ٣٥ — это 35, а не 53. ٢٠٢٦ — это 2026.',
    },
    ...list.map((n, i) => multiChoice(n, i, random)),
  ];
}

function level3(random: () => number): Task[] {
  const pool = [...BASE_WORDS, ...NEW_WORDS];
  const tasks: Task[] = [
    {
      type: 'tip',
      key: 'n3-tip1',
      label: 'ПРАВИЛО',
      title: 'От 11 до 19',
      text: 'Сначала единицы, потом عَشَرَ — «десять». Особенные только 11 и 12, их просто запомним.',
      example: { ar: 'ثَلَاثَةَ عَشَرَ', ru: '13, дословно «три-десять»' },
    },
  ];
  NEW_WORDS.slice(0, 4).forEach((w) => tasks.push({ type: 'intro', key: `n3-in-${w.id}`, item: w }));
  shuffled(NEW_WORDS.slice(0, 4), random).forEach((w, i) => tasks.push(itemChoice(w, 'number', pool, i, random)));
  tasks.push({
    type: 'tip',
    key: 'n3-tip2',
    label: 'ПРАВИЛО',
    title: 'Десятки и «пять и двадцать»',
    text: 'Десятки похожи на единицы с окончанием «-ун»: ثَلَاثَة → ثَلَاثُونَ. В числах от 21 до 99 сначала единицы, потом وَ «и», потом десятки.',
    example: { ar: 'خَمْسَةٌ وَعِشْرُونَ', ru: '25, дословно «пять и двадцать»' },
  });
  NEW_WORDS.slice(4).forEach((w) => tasks.push({ type: 'intro', key: `n3-in-${w.id}`, item: w }));
  shuffled(NEW_WORDS.slice(4), random).forEach((w, i) => tasks.push(itemChoice(w, i % 2 ? 'number' : 'number-ar', pool, 10 + i, random)));
  shuffled(pool, random)
    .slice(0, 4)
    .forEach((w, i) => tasks.push(itemChoice(w, i % 2 ? 'number-ar' : 'number', pool, 30 + i, random)));
  return tasks;
}

export function buildNumbersLevel(level: NumbersLevel, random: () => number): Task[] {
  return level === 1 ? level1(random) : level === 2 ? level2(random) : level3(random);
}
