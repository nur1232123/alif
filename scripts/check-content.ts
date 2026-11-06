import { ALL_WEEKS, STAGES } from '../src/data/course';
import { LETTERS } from '../src/data/letters';
import type { Item } from '../src/data/types';
import {
  ALL_LESSONS,
  buildLesson,
  buildPractice,
  DAYS_PER_WEEK,
  isGraded,
  knownItems,
  lessonId,
  passMark,
  TOTAL_LESSONS,
  type Task,
} from '../src/lib/plan';

const problems: string[] = [];
const bad = (m: string) => problems.push(m);

const ARABIC = /[ء-ي]/;
const HARAKAT = /[ً-ْ]/;
const LATIN = /[A-Za-z]/;

function checkVowels(text: string, where: string) {
  if (!ARABIC.test(text)) bad(`${where}: нет арабского текста: ${text}`);
  if (LATIN.test(text)) bad(`${where}: латиница в арабском тексте: ${text}`);
  for (const word of text.split(/[\s،.؟]+/).filter(Boolean)) {
    const letters = [...word].filter((c) => ARABIC.test(c)).length;
    if (letters >= 2 && !HARAKAT.test(word)) bad(`${where}: нет огласовок: ${word}`);
  }
}

if (ALL_WEEKS.length !== 52) bad(`недель ${ALL_WEEKS.length}, нужно 52`);
if (TOTAL_LESSONS !== 364) bad(`уроков ${TOTAL_LESSONS}`);
if (ALL_LESSONS.length !== 364) bad(`в списке уроков ${ALL_LESSONS.length}`);
ALL_WEEKS.forEach((w, i) => {
  if (i > 0 && w.stageId < ALL_WEEKS[i - 1].stageId) bad(`неделя ${w.n}: порядок этапов`);
});
if (LETTERS.length !== 28) bad(`букв ${LETTERS.length}, нужно 28`);
if (new Set(LETTERS.map((l) => l.ar)).size !== 28) bad('повторяются буквы');
if (new Set(LETTERS.map((l) => l.ru)).size !== 28) bad('повторяются русские названия букв');
for (const l of LETTERS) checkVowels(l.say, `буква ${l.ar}`);

// Первая половина алфавита заканчивается на 4-й неделе, вторая на 8-й
const seen = (to: number) => new Set(ALL_WEEKS.filter((w) => w.n <= to).flatMap((w) => w.items.map((x) => x.ar)));
if (seen(4).size !== 14) bad(`к 4-й неделе букв ${seen(4).size}`);
if (seen(8).size !== 28) bad(`к 8-й неделе букв ${seen(8).size}`);

const ids = new Map<string, Item>();
const newPerWeek: number[] = [];
for (const week of ALL_WEEKS) {
  if (week.items.length < 3) bad(`неделя ${week.n}: мало элементов`);
  if (!week.review) newPerWeek.push(week.items.length);
  for (const item of week.items) {
    const known = ids.get(item.id);
    if (known && known !== item) bad(`повторный id ${item.id}`);
    ids.set(item.id, item);
    if (week.stageId > 1) checkVowels(item.ar, `неделя ${week.n}`);
    if (!item.ru.trim()) bad(`${item.id}: нет перевода`);
    if (week.stageId > 1 && item.say !== item.ar) bad(`${item.id}: голос и текст разные`);
  }
  if (new Set(week.items.map((x) => x.ar)).size !== week.items.length && !week.review) bad(`неделя ${week.n}: повтор внутри недели`);
  if (new Set(week.items.map((x) => x.ru)).size !== week.items.length) bad(`неделя ${week.n}: одинаковый перевод внутри недели`);
  for (const line of week.lines ?? []) {
    checkVowels(line.ar, `неделя ${week.n} текст`);
    if (!line.ru.trim()) bad(`неделя ${week.n}: нет перевода`);
  }
  if (week.kind === 'text' && !week.textQuestions?.length) bad(`неделя ${week.n}: нет вопросов`);
  if (week.kind === 'dialogue' && !week.replyQuestions?.length) bad(`неделя ${week.n}: нет ответов`);
  for (const q of week.textQuestions ?? []) {
    if (new Set([q.right, ...q.wrong]).size !== 3) bad(`неделя ${week.n}: одинаковые варианты: ${q.q}`);
  }
  for (const q of week.replyQuestions ?? []) {
    [q.line, q.right, ...q.wrong].forEach((t) => checkVowels(t, `неделя ${week.n} ответы`));
    if (new Set([q.right, ...q.wrong]).size !== 3) bad(`неделя ${week.n}: одинаковые варианты: ${q.line}`);
    const lines = (week.lines ?? []).map((l) => l.ar);
    const normal = (s: string) => s.replace(/[.؟]/g, '');
    if (!lines.some((l) => normal(l).includes(normal(q.line)))) bad(`неделя ${week.n}: реплики нет в диалоге: ${q.line}`);
    if (!lines.some((l) => normal(l).includes(normal(q.right)))) bad(`неделя ${week.n}: ответа нет в диалоге: ${q.right}`);
  }
}

function checkTask(t: Task, where: string) {
  if (t.type === 'choice') {
    if (t.options.length !== 3) bad(`${where}: вариантов ${t.options.length}`);
    if (t.options.filter((o) => o.id === t.answerId).length !== 1) bad(`${where}: нет ответа`);
    const labels = t.options.map((o) => o.ar ?? o.say ?? o.ru);
    if (new Set(labels).size !== 3) bad(`${where}: одинаковые варианты ${labels}`);
    if (t.kind === 'see-hear' && t.options.some((o) => o.ar || o.ru)) bad(`${where}: подсказка в звуковом варианте`);
    if (t.kind === 'hear-see' && (t.ar || t.ru)) bad(`${where}: подсказка в вопросе на слух`);
    if (t.kind === 'hear-see' && !t.say) bad(`${where}: нет звука`);
    if (t.kind === 'reverse' && !t.ru) bad(`${where}: нет русского вопроса`);
    if (t.kind === 'form' && !t.ar) bad(`${where}: нет формы`);
  }
  if (t.type === 'match') {
    if (t.pairs.length < 3) bad(`${where}: мало пар (${t.pairs.length})`);
    if (new Set(t.pairs.map((p) => p.ru)).size !== t.pairs.length) bad(`${where}: одинаковые пары`);
  }
  if (t.type === 'build') {
    if (t.answer.length < 2) bad(`${where}: короткая сборка`);
    const bank = [...t.bank];
    for (const part of t.answer) {
      const i = bank.indexOf(part);
      if (i < 0) bad(`${where}: нет плитки ${part}`);
      else bank.splice(i, 1);
    }
    if (t.answer.join(t.joined ? '' : ' ') !== t.say.trim()) bad(`${where}: сборка не совпадает: ${t.say}`);
  }
}

let taskTotal = 0;
const sizes: number[] = [];
for (const ref of ALL_LESSONS) {
  for (let run = 0; run < 12; run++) {
    const tasks = buildLesson(ref);
    const graded = tasks.filter(isGraded);
    const where = `урок ${ref.id} (${ref.title})`;
    if (graded.length < 4) bad(`${where}: мало заданий (${graded.length})`);
    if (graded.length > 22) bad(`${where}: слишком много заданий (${graded.length})`);
    const keys = tasks.map((t) => t.key);
    if (new Set(keys).size !== keys.length) bad(`${where}: повтор ключа`);
    tasks.forEach((t) => checkTask(t, where));
    if (ref.isExam && tasks.some((t) => t.type !== 'choice' && t.type !== 'build')) bad(`${where}: в экзамене подсказка`);
    const pass = passMark(graded.length);
    if (pass < 1 || pass > graded.length) bad(`${where}: порог ${pass}`);
    if (run === 0) {
      taskTotal += tasks.length;
      sizes.push(tasks.length);
    }
  }
}

// Новые элементы только там, где их обещает урок
const firstLesson = buildLesson(ALL_LESSONS[0]);
if (firstLesson[0].type !== 'tip') bad('первый урок начинается не с правила');
const firstIntro = firstLesson.filter((t) => t.type === 'intro').length;
if (firstIntro > 2) bad(`в первом уроке новых букв ${firstIntro}`);

// Тренировка отдаёт ошибки первыми
const done = { [lessonId(1, 1)]: 1, [lessonId(1, 2)]: 1 };
const items = knownItems(done);
if (items.length !== 4) bad(`после двух уроков известно ${items.length}`);
for (let run = 0; run < 100; run++) {
  const practice = buildPractice(done, { [items[2].id]: 2 });
  if (practice.length !== 4) bad(`тренировка: ${practice.length} заданий`);
  const first = practice[0];
  if (first.type !== 'choice' || first.itemId !== items[2].id) bad('тренировка: ошибка не первая');
  practice.forEach((t) => checkTask(t, 'тренировка'));
}
const allDone = Object.fromEntries(ALL_LESSONS.map((l) => [l.id, 1]));
for (let run = 0; run < 200; run++) buildPractice(allDone, {}).forEach((t) => checkTask(t, 'тренировка всего курса'));

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(unique.slice(0, 40).join('\n'));
  console.error(`Всего проблем: ${unique.length}`);
  process.exit(1);
}
const uniqueWords = new Set(ALL_WEEKS.filter((w) => w.stageId > 1).flatMap((w) => w.items.map((x) => x.ar))).size;
console.log(`Проверка пройдена. ${STAGES.map((s) => `этап ${s.id}: ${s.weeks.length} нед.`).join(', ')}.`);
console.log(`Уроков: ${ALL_LESSONS.length}, по ${DAYS_PER_WEEK} в неделю. Заданий: ${taskTotal}. В уроке от ${Math.min(...sizes)} до ${Math.max(...sizes)}.`);
console.log(`Новых элементов в неделю: от ${Math.min(...newPerWeek)} до ${Math.max(...newPerWeek)}. Слов и слогов после алфавита: ${uniqueWords}.`);
