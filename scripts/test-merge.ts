// Проверка объединения прогресса с двух телефонов: ничего выученного не теряется
import assert from 'node:assert/strict';
import { EMPTY, mergeProgress, normalizeProgress, type Progress } from '../src/lib/progress-model';

const base = (over: Partial<Progress>): Progress => ({ ...EMPTY, ...over, settings: { ...EMPTY.settings, ...over.settings } });

const cloud = base({
  name: 'Нур',
  done: { '1-1': { score: 5, total: 10 }, '1-2': { score: 10, total: 10 } },
  stars: [1],
  lastActive: '2026-11-10',
  streak: 4,
  mistakes: { 'l-ba': 2 },
  srs: { 'l-ba': { box: 3, due: '2026-11-17' }, 'l-ta': { box: 1, due: '2026-11-11' } },
  numbers: { '1': 0.9 },
  settings: { sounds: false, reminder: true, reminderHour: 8, dailyGoal: 5, allOpen: false },
});
const phone = base({
  name: null,
  done: { '1-1': { score: 9, total: 10 }, '1-3': { score: 7, total: 10 } },
  stars: [2],
  lastActive: '2026-11-12',
  streak: 1,
  mistakes: { 'l-ba': 5, 'l-tha': 1 },
  srs: { 'l-ba': { box: 1, due: '2026-11-13' }, 'l-ta': { box: 1, due: '2026-11-14' } },
  numbers: { '1': 0.5, '2': 1 },
});

const m = mergeProgress(cloud, phone);
assert.equal(m.name, 'Нур', 'имя из аккаунта');
assert.deepEqual(Object.keys(m.done).sort(), ['1-1', '1-2', '1-3'], 'уроки объединены');
assert.equal(m.done['1-1'].score, 9, 'лучший результат урока');
assert.deepEqual(m.stars, [1, 2], 'звёзды объединены');
assert.equal(m.lastActive, '2026-11-12', 'последний день занятий');
assert.equal(m.streak, 1, 'серия того, кто занимался позже');
assert.deepEqual(m.mistakes, { 'l-ba': 5, 'l-tha': 1 }, 'ошибки по максимуму');
assert.equal(m.srs['l-ba'].box, 3, 'повторение: выше ступень');
assert.equal(m.srs['l-ta'].due, '2026-11-14', 'повторение: при равной ступени позже');
assert.deepEqual(m.numbers, { '1': 0.9, '2': 1 }, 'цифры по максимуму');
assert.equal(m.settings.dailyGoal, 5, 'после переустановки настройки из аккаунта');
// Если на телефоне уже есть имя, настройки телефона остаются
assert.equal(mergeProgress(cloud, { ...phone, name: 'Нур' }).settings.dailyGoal, EMPTY.settings.dailyGoal);
// Один и тот же день: серия по максимуму, уроки за день по максимуму
const sameDay = mergeProgress(base({ lastActive: '2026-11-12', streak: 6, today: { day: '2026-11-12', count: 2 } }), base({ lastActive: '2026-11-12', streak: 3, today: { day: '2026-11-12', count: 4 } }));
assert.equal(sameDay.streak, 6);
assert.deepEqual(sameDay.today, { day: '2026-11-12', count: 4 });
// Объединение с пустым ничего не теряет
assert.deepEqual(mergeProgress(cloud, normalizeProgress({})).done, cloud.done);
assert.deepEqual(mergeProgress(normalizeProgress({}), phone).done, phone.done);
// Старая запись без новых полей дополняется
assert.equal(normalizeProgress({ name: 'A', settings: { sounds: false } as Progress['settings'] }).settings.dailyGoal, EMPTY.settings.dailyGoal);
console.log('Объединение прогресса: все проверки пройдены');
