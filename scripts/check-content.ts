import { ALL_WEEKS, STAGES } from '../src/data/course';
import { LETTERS } from '../src/data/letters';
import type { Item } from '../src/data/types';
import { MARKS, toArabicDigits } from '../src/data/reference';
import { buildNumbersLevel } from '../src/lib/numbers';
import {
  ALL_LESSONS,
  buildLesson,
  buildPractice,
  LESSONS_PER_DAY,
  LESSONS_PER_WEEK,
  introChunks,
  weekPlan,
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
if (TOTAL_LESSONS !== 1092) bad(`уроков ${TOTAL_LESSONS}`);
if (ALL_LESSONS.length !== 1092) bad(`в списке уроков ${ALL_LESSONS.length}`);
if (ALL_LESSONS.length / LESSONS_PER_DAY !== 364) bad('курс не рассчитан на 52 недели');
ALL_WEEKS.forEach((w, i) => {
  if (i > 0 && w.stageId < ALL_WEEKS[i - 1].stageId) bad(`неделя ${w.n}: порядок этапов`);
});
if (LETTERS.length !== 28) bad(`букв ${LETTERS.length}, нужно 28`);
if (new Set(LETTERS.map((l) => l.ar)).size !== 28) bad('повторяются буквы');
if (new Set(LETTERS.map((l) => l.ru)).size !== 28) bad('повторяются русские названия букв');
for (const l of LETTERS) checkVowels(l.say, `буква ${l.ar}`);

// Алфавит за одну неделю: две проверки половин и большой экзамен
if (ALL_WEEKS.filter((w) => w.stageId === 1).length !== 1) bad('алфавит не 1 неделя');
if (new Set(ALL_WEEKS[0].items.map((x) => x.ar)).size !== 28) bad('в первой неделе не все буквы');
const alphabetPlan = weekPlan(ALL_WEEKS[0]);
if (alphabetPlan.filter((x) => x.kind === 'checkpoint').length !== 2) bad('у алфавита не две проверки');
for (const l of LETTERS) {
  if (!l.example) bad(`у буквы ${l.ar} нет слова-примера`);
  else {
    checkVowels(l.example.ar, `пример ${l.ar}`);
    const first = l.example.ar.replace(/[أإآ]/g, 'ا')[0];
    if (first !== l.ar) bad(`слово ${l.example.ar} начинается не с ${l.ar}`);
  }
}
for (const week of ALL_WEEKS) {
  const plan = weekPlan(week);
  if (plan.length !== LESSONS_PER_WEEK) bad(`неделя ${week.n}: уроков ${plan.length}`);
  if (plan[plan.length - 1].kind !== 'exam') bad(`неделя ${week.n}: нет экзамена в конце`);
}
// Новое каждый день понемногу
for (const week of ALL_WEEKS) {
  for (const chunk of introChunks(week)) {
    if (week.kind !== 'text' && week.kind !== 'dialogue' && chunk.length > 5) bad(`неделя ${week.n}: ${chunk.length} новых за день`);
  }
  if (!week.review && introChunks(week).flat().length !== week.items.length) bad(`неделя ${week.n}: не все элементы вводятся`);
}

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
  for (let run = 0; run < 6; run++) {
    const tasks = buildLesson(ref);
    const graded = tasks.filter(isGraded);
    const where = `урок ${ref.id} (${ref.title})`;
    if (graded.length < 4) bad(`${where}: мало заданий (${graded.length})`);
    if (graded.length > 22) bad(`${where}: слишком много заданий (${graded.length})`);
    const keys = tasks.map((t) => t.key);
    if (new Set(keys).size !== keys.length) bad(`${where}: повтор ключа`);
    tasks.forEach((t) => checkTask(t, where));
    // Новое появляется только в уроках с новым
    const mayIntro = ref.spec.kind === 'intro' || (ref.spec.kind === 'reading' && ref.spec.day === 1 && ref.spec.slot === 1);
    if (!mayIntro && tasks.some((t) => t.type === 'intro')) bad(`${where}: новое в уроке повторения`);
    // В вариантах ответа только выученное: прошлые недели и уже пройденные части этой
    if (ref.spec.kind === 'intro' || ref.spec.kind === 'checkpoint') {
      const chunks = introChunks(ref.week);
      const upTo = ref.spec.kind === 'intro' ? ref.spec.chunk + 1 : ref.spec.to;
      const allowed = new Set([
        ...ALL_WEEKS.filter((w) => w.n < ref.week.n).flatMap((w) => w.items.map((x) => x.id)),
        ...chunks.slice(0, upTo).flat().map((x) => x.id),
      ]);
      for (const t of tasks) {
        if (t.type === 'choice' && t.kind !== 'text' && t.kind !== 'reply') {
          for (const o of t.options) if (!allowed.has(o.id)) bad(`${where}: вариант из невыученного (${o.ar ?? o.ru ?? o.id})`);
        }
      }
    }
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
if (firstIntro > 4) bad(`в первом уроке новых букв ${firstIntro}`);

// Тренировка отдаёт ошибки первыми
const done = { [lessonId(1, 1)]: 1, [lessonId(1, 4)]: 1 };
const items = knownItems(done);
if (items.length !== 6) bad(`после двух уроков с новым известно ${items.length}`);
for (let run = 0; run < 100; run++) {
  const practice = buildPractice(done, { [items[2].id]: 2 });
  if (practice.length !== 6) bad(`тренировка: ${practice.length} заданий`);
  const first = practice[0];
  if (first.type !== 'choice' || first.itemId !== items[2].id) bad('тренировка: ошибка не первая');
  practice.forEach((t) => checkTask(t, 'тренировка'));
}
const allDone = Object.fromEntries(ALL_LESSONS.map((l) => [l.id, 1]));
for (let run = 0; run < 200; run++) buildPractice(allDone, {}).forEach((t) => checkTask(t, 'тренировка всего курса'));

// Мини-курс «Учим цифры»: у каждого задания три разных варианта и один ответ, у вопросов есть что показать
for (let run = 0; run < 300; run++) {
  for (const level of [1, 2, 3] as const) {
    buildNumbersLevel(level, Math.random).forEach((t) => {
      checkTask(t, `цифры, уровень ${level}`);
      if (t.type === 'choice') {
        if (t.kind === 'number' && !t.ar) bad(`цифры ${level}: нет числа в вопросе`);
        if (t.kind === 'number-ar' && !t.ru) bad(`цифры ${level}: нет числа в вопросе`);
        if (t.itemId) bad(`цифры ${level}: задание влияет на повторение`);
        const answer = t.options.find((o) => o.id === t.answerId)!;
        if (t.kind === 'number' && level === 2 && toArabicDigits(Number(answer.ru)) !== t.ar) bad(`цифры 2: неверный ответ ${t.ar} → ${answer.ru}`);
      }
    });
  }
}
for (const m of MARKS) {
  if (!HARAKAT.test(m.sample)) bad(`огласовка ${m.name}: нет знака в образце`);
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(unique.slice(0, 40).join('\n'));
  console.error(`Всего проблем: ${unique.length}`);
  process.exit(1);
}
const uniqueWords = new Set(ALL_WEEKS.filter((w) => w.stageId > 1).flatMap((w) => w.items.map((x) => x.ar))).size;
console.log(`Проверка пройдена. ${STAGES.map((s) => `этап ${s.id}: ${s.weeks.length} нед.`).join(', ')}.`);
console.log(`Уроков: ${ALL_LESSONS.length}, по ${LESSONS_PER_WEEK} в неделю, по ${LESSONS_PER_DAY} в день. Заданий: ${taskTotal}. В уроке от ${Math.min(...sizes)} до ${Math.max(...sizes)}.`);
console.log(`Новых элементов в неделю: от ${Math.min(...newPerWeek)} до ${Math.max(...newPerWeek)}. Слов и слогов после алфавита: ${uniqueWords}.`);
