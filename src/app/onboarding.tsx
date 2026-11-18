import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ALL_WEEKS } from '@/data/course';
import type { Item } from '@/data/types';
import { track } from '@/lib/feedback';
import { ALL_LESSONS } from '@/lib/plan';
import { useProgress } from '@/lib/progress';
import { playSfx } from '@/lib/sfx';
import { Fox, type FoxPose } from '@/ui/fox';
import { Appear, Ar, Button, ProgressBar, Screen, T } from '@/ui/kit';
import { useColors } from '@/ui/theme';

// Первый вход: фенёк знакомится, спрашивает цель, уровень и время, а знающим алфавит предлагает тест

type Choice = { id: string; label: string; hint?: string; icon?: string };

const GOALS: Choice[] = [
  { id: 'travel', icon: '✈️', label: 'Для путешествий' },
  { id: 'quran', icon: '🕌', label: 'Читать Коран и молитвы' },
  { id: 'move', icon: '🏠', label: 'Переезжаю или живу в арабской стране' },
  { id: 'work', icon: '💼', label: 'Для работы или учёбы' },
  { id: 'fun', icon: '✨', label: 'Просто интересно' },
];
const GOAL_REPLY: Record<string, string> = {
  travel: 'Отлично! Скоро сможешь читать вывески и меню.',
  quran: 'Прекрасная цель. Начнём с букв и огласовок: на них всё держится.',
  move: 'Тогда арабский пригодится каждый день. Поехали!',
  work: 'Серьёзно! Будем идти шаг за шагом.',
  fun: 'Любопытство — лучший двигатель!',
};
const LEVELS: (Choice & { level: number })[] = [
  { id: 'l0', level: 0, label: 'Совсем не знаю', hint: 'Начнём с первой буквы' },
  { id: 'l1', level: 1, label: 'Знаю несколько букв', hint: 'Быстро пройдём алфавит' },
  { id: 'l2', level: 2, label: 'Знаю алфавит', hint: 'Можно пропустить алфавит по тесту' },
  { id: 'l3', level: 3, label: 'Читаю с огласовками', hint: 'Можно пропустить алфавит и чтение' },
];
const TIMES: (Choice & { lessons: number })[] = [
  { id: 't1', lessons: 1, label: '5 минут в день', hint: '1 урок · легко' },
  { id: 't3', lessons: 3, label: '15 минут в день', hint: '3 урока · хороший темп' },
  { id: 't5', lessons: 5, label: '25 минут в день', hint: '5 уроков · быстро' },
];

type Q = { ar: string; right: string; options: string[] };

/** Вопросы теста: буква или слог, четыре варианта чтения */
function makeTest(level: number): Q[] {
  const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((x, y) => x[0] - y[0]).map(([, x]) => x);
  const letters = ALL_WEEKS.filter((w) => w.kind === 'letters').flatMap((w) => w.items);
  const syll = ALL_WEEKS.filter((w) => w.kind === 'syllables').flatMap((w) => w.items);
  const q = (pool: Item[], n: number) =>
    shuffle(pool).slice(0, n).map((it) => {
      const wrong = shuffle(pool.filter((x) => x.ru !== it.ru)).slice(0, 3).map((x) => x.ru);
      return { ar: it.ar, right: it.ru, options: shuffle([it.ru, ...wrong]) };
    });
  return level >= 3 ? [...q(letters, 4), ...q(syll, 4)] : q(letters, 8);
}

export default function Onboarding() {
  const c = useColors();
  const { progress, completeOnboarding } = useProgress();
  const [step, setStep] = useState<'hi' | 'goal' | 'level' | 'time' | 'offer' | 'test' | 'result'>('hi');
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState(0);
  const [lessons, setLessons] = useState(3);
  const [picked, setPicked] = useState<string | null>(null);
  const [test, setTest] = useState<Q[]>([]);
  const [qi, setQi] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [right, setRight] = useState({ letters: 0, reading: 0 });
  const [skipped, setSkipped] = useState(0);

  const steps = ['hi', 'goal', 'level', 'time', 'offer', 'test', 'result'];
  const stepNo = steps.indexOf(step);

  // Через полсекунды после выбора варианта фенёк реагирует и ведёт дальше
  const choose = (id: string, then: () => void) => {
    if (picked) return;
    setPicked(id);
    setTimeout(() => { setPicked(null); then(); }, 650);
  };

  const finish = (skip: number, openLesson = true) => {
    completeOnboarding({ goal, level, minutes: lessons * 5, skipped: skip }, lessons);
    track('onboarding', `${goal}|${level}|${lessons}`, skip);
    const first = ALL_LESSONS.find((l) => l.week.stageId > skip && !(l.id in progress.done));
    router.replace('/');
    if (first && openLesson) setTimeout(() => router.push(`/lesson/${first.id}`), 50);
  };

  const startTest = () => { setTest(makeTest(level)); setQi(0); setRight({ letters: 0, reading: 0 }); setAnswer(null); setStep('test'); };

  const pickAnswer = (opt: string) => {
    if (answer) return;
    const q = test[qi];
    const ok = opt === q.right;
    setAnswer(opt);
    playSfx(ok ? 'right' : 'wrong');
    const reading = level >= 3 && qi >= 4;
    const next = { letters: right.letters + (ok && !reading ? 1 : 0), reading: right.reading + (ok && reading ? 1 : 0) };
    setRight(next);
    setTimeout(() => {
      setAnswer(null);
      if (qi + 1 < test.length) { setQi(qi + 1); return; }
      // Итог: алфавит пропускается при 7 из 8 (или 4 из 4 букв), чтение — ещё при 3 из 4 слогов
      const lettersOk = level >= 3 ? next.letters >= 4 : next.letters >= 7;
      const readingOk = level >= 3 && lettersOk && next.reading >= 3;
      setSkipped(readingOk ? 2 : lettersOk ? 1 : 0);
      setStep('result');
    }, 900);
  };

  const name = progress.name ?? '';
  const nextTitle = useMemo(() => ALL_LESSONS.find((l) => l.week.stageId > skipped)?.week.title ?? '', [skipped]);

  // Что говорит фенёк и как выглядит на каждом шаге
  let pose: FoxPose = 'idle';
  let say = '';
  let body: ReactNode = null;
  let footer: ReactNode = null;

  const options = (list: Choice[], onPick: (ch: Choice) => void, prefix: string) => (
    <View style={{ gap: 10 }}>
      {list.map((ch, i) => {
        const on = picked === ch.id;
        return (
          <Appear key={ch.id} delay={120 + i * 70}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(ch)}
              testID={`${prefix}-${ch.id}`}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingHorizontal: 16, paddingVertical: 12,
                borderRadius: 18, borderWidth: on ? 2.5 : 1.5, borderColor: on ? c.accent : c.line,
                backgroundColor: on ? c.soft : c.surface, transform: [{ scale: pressed || on ? 0.98 : 1 }],
              })}
            >
              {ch.icon ? <T size={26} style={{ lineHeight: 34 }}>{ch.icon}</T> : null}
              <View style={{ flex: 1 }}>
                <T size={17} weight="bold">{ch.label}</T>
                {ch.hint ? <T size={14} tone="muted">{ch.hint}</T> : null}
              </View>
            </Pressable>
          </Appear>
        );
      })}
    </View>
  );

  if (step === 'hi') {
    pose = 'happy';
    say = `Ахлан, ${name}! Я Фенёк 🦊 Помогу тебе выучить арабский. Ответь на пару вопросов — и подберём, с чего начать.`;
    footer = <Button label="Поехали!" onPress={() => setStep('goal')} testID="onb-start" />;
  } else if (step === 'goal') {
    pose = picked ? 'happy' : 'think';
    say = picked ? GOAL_REPLY[picked] : 'Зачем тебе арабский?';
    body = options(GOALS, (ch) => choose(ch.id, () => { setGoal(ch.id); setStep('level'); }), 'goal');
  } else if (step === 'level') {
    pose = 'think';
    say = 'Сколько ты уже знаешь арабский?';
    body = options(LEVELS, (ch) => choose(ch.id, () => { setLevel((ch as (typeof LEVELS)[number]).level); setStep('time'); }), 'level');
  } else if (step === 'time') {
    pose = picked ? 'happy' : 'idle';
    say = picked ? 'Договорились! Я буду напоминать.' : 'Сколько времени в день готов заниматься?';
    body = options(TIMES, (ch) => choose(ch.id, () => { setLessons((ch as (typeof TIMES)[number]).lessons); setStep(level >= 2 ? 'offer' : 'result'); }), 'time');
  } else if (step === 'offer') {
    pose = 'wow';
    say = level >= 3
      ? 'Ого, ты уже читаешь! Пройди короткий тест из 8 вопросов — и пропустишь алфавит и чтение.'
      : 'Знаешь алфавит? Проверим! 8 быстрых вопросов — и пропустишь алфавит.';
    footer = (
      <>
        <Button label="Пройти тест" onPress={startTest} testID="onb-test" />
        <Button label="Начать с нуля" kind="quiet" onPress={() => { setSkipped(0); finish(0); }} testID="onb-zero" />
      </>
    );
  } else if (step === 'test') {
    const q = test[qi];
    const shown = answer;
    pose = shown ? (shown === q.right ? 'happy' : 'wow') : 'think';
    say = shown ? (shown === q.right ? 'Верно!' : `Это «${q.right}»`) : level >= 3 && qi >= 4 ? 'Как читается этот слог?' : 'Что это за буква?';
    body = (
      <View style={{ gap: 14 }}>
        <ProgressBar value={qi + (shown ? 1 : 0)} total={test.length} thick />
        <View style={{ alignItems: 'center', paddingVertical: 6, borderRadius: 24, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line }}>
          <Ar size={72} bold>{q.ar}</Ar>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {q.options.map((opt, i) => {
            const isRight = shown && opt === q.right;
            const isWrong = shown === opt && opt !== q.right;
            return (
              <Pressable
                key={opt}
                accessibilityRole="button"
                onPress={() => pickAnswer(opt)}
                testID={`onb-opt-${i}`}
                style={{
                  flexBasis: '47%', flexGrow: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 16,
                  borderWidth: 2, borderColor: isRight ? c.good : isWrong ? c.bad : c.line,
                  backgroundColor: isRight ? c.goodSoft : isWrong ? c.badSoft : c.surface,
                }}
              >
                <T size={18} weight="bold">{opt}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  } else {
    const tested = level >= 2 && test.length > 0;
    pose = skipped > 0 || !tested ? 'happy' : 'idle';
    say = skipped === 2
      ? `Блестяще, ${name}! Алфавит и чтение пропускаем. Начнём с «${nextTitle}».`
      : skipped === 1
        ? `Отлично! Алфавит ты знаешь — пропускаем. Дальше «${nextTitle}».`
        : tested
          ? 'Ничего страшного! Начнём с алфавита — быстро повторишь, и дальше будет легче.'
          : 'Тогда начнём с самого начала. Первая буква уже ждёт!';
    body = tested ? (
      <Appear delay={150}>
        <T tone="muted" style={{ textAlign: 'center' }} testID="onb-score">
          Правильных ответов: {right.letters + right.reading} из {test.length}
        </T>
      </Appear>
    ) : null;
    footer = <Button label="Начать первый урок" onPress={() => finish(skipped)} testID="onb-finish" />;
  }

  return (
    <Screen footer={footer} testID="onboarding">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>{step !== 'test' ? <ProgressBar value={stepNo} total={steps.length - 1} /> : null}</View>
        {step !== 'test' && step !== 'result' ? (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => finish(0, false)} testID="onb-skip">
            <T size={14} tone="muted">Пропустить</T>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
        <Fox pose={pose} size={step === 'hi' ? 150 : 110} />
        <Appear key={say} delay={60} style={{ flex: 1, marginBottom: 18 }}>
          <View style={{ backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, borderRadius: 20, borderBottomLeftRadius: 6, padding: 14 }}>
            <T size={17} weight="medium" style={{ lineHeight: 24 }} testID="onb-say">{say}</T>
          </View>
        </Appear>
      </View>
      {body ? <View key={step + qi} style={{ marginTop: 6 }}>{body}</View> : null}
    </Screen>
  );
}
