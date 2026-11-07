// Выгружает все арабские фразы курса для страницы проверки
import { ALL_WEEKS } from '../src/data/course';
import { LETTERS } from '../src/data/letters';

type Row = { id: string; stage: number; week: number; title: string; kind: string; ar: string; ru: string; note?: string; isNew?: boolean };
const rows: Row[] = [];
const seen = new Set<string>();
const push = (r: Row) => {
  const key = `${r.week}|${r.ar}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(r);
};

// Добавлено 7 ноября: слоги с новыми id и 13 новых недель
const NEW_PREFIX = /^(s-|w6\d-|w7[0-2]-)/;

for (const week of ALL_WEEKS) {
  const newWeek = week.items.some((x) => /^w(6[0-9]|7[0-2])-/.test(x.id));
  const base = { stage: week.stageId, week: week.n, title: week.title, ...(newWeek ? { isNew: true } : {}) };
  if (week.kind === 'letters' && week.review) continue; // повтор всего алфавита
  for (const item of week.items) {
    if (week.kind === 'letters') {
      push({ ...base, id: item.id, kind: 'Буква', ar: `${item.ar}  ${item.say}`, ru: item.ru, note: item.note });
    } else {
      push({ ...base, id: item.id, kind: week.kind === 'syllables' ? 'Слог' : 'Слово', ar: item.ar, ru: item.ru, note: item.note, ...(NEW_PREFIX.test(item.id) ? { isNew: true } : {}) });
    }
  }
  week.lines?.forEach((l, i) =>
    push({ ...base, id: `w${week.n}-line${i}`, kind: week.kind === 'dialogue' ? 'Диалог' : 'Текст', ar: l.ar, ru: l.ru }),
  );
  week.replyQuestions?.forEach((q, i) =>
    q.wrong.forEach((w, j) => push({ ...base, id: `w${week.n}-r${i}-${j}`, kind: 'Неверный вариант', ar: w, ru: '' })),
  );
}
console.log(JSON.stringify(rows));
void LETTERS;
