import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStage } from '@/data/course';
import { buildLesson, buildPractice, getLesson, isGraded, passMark, type BuildTask, type ChoiceTask, type IntroTask, type LessonRef, type MatchTask, type ReadTask, type SpeakTask, type Task, type TipTask } from '@/lib/plan';
import { dayKey, useProgress, type FinishResult } from '@/lib/progress';
import { stopSpeech } from '@/lib/speech';
import { voiceReady } from '@/lib/voice';
import { Button, Khatam, ProgressBar, Screen, T } from '@/ui/kit';
import { useSpeak } from '@/ui/speak';
import { useBuild, useChoice, useIntro, useMatch, useRead, useTip, type Slots } from '@/ui/tasks';
import { useColors } from '@/ui/theme';

function Frame({ value, total, slots, testID }: { value: number; total: number; slots: Slots; testID: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: insets.top + 12, paddingBottom: 8, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Выйти из урока"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          testID="close"
        >
          <T size={22} weight="bold" tone="muted">✕</T>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={value} total={total} thick />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {slots.body}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, overflow: 'hidden' }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>{slots.footer}</View>
      </View>
    </View>
  );
}

type StepProps<T> = { task: T; value: number; total: number; last: boolean; onDone: (correct?: boolean) => void; testID: string };

function TipStep({ task, value, total, onDone, testID }: StepProps<TipTask>) {
  return <Frame value={value} total={total} slots={useTip(task, () => onDone())} testID={testID} />;
}
function IntroStep({ task, value, total, onDone, testID }: StepProps<IntroTask>) {
  return <Frame value={value} total={total} slots={useIntro(task, () => onDone())} testID={testID} />;
}
function ReadStep({ task, value, total, onDone, testID }: StepProps<ReadTask>) {
  return <Frame value={value} total={total} slots={useRead(task, () => onDone())} testID={testID} />;
}
function ChoiceStep({ task, value, total, last, onDone, testID }: StepProps<ChoiceTask>) {
  return <Frame value={value} total={total} slots={useChoice(task, last, onDone)} testID={testID} />;
}
function MatchStep({ task, value, total, last, onDone, testID }: StepProps<MatchTask>) {
  return <Frame value={value} total={total} slots={useMatch(task, last, () => onDone())} testID={testID} />;
}
function BuildStep({ task, value, total, last, onDone, testID }: StepProps<BuildTask>) {
  return <Frame value={value} total={total} slots={useBuild(task, last, onDone)} testID={testID} />;
}

function SpeakStep({ task, value, total, last, onDone, onSkip, testID }: StepProps<SpeakTask> & { onSkip: () => void }) {
  return <Frame value={value} total={total} slots={useSpeak(task, last, onDone, onSkip)} testID={testID} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 2, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: c.shadow }}>
      <T size={22} weight="bold" tone="accent">{value}</T>
      <T size={13} tone="muted" style={{ textAlign: 'center' }}>{label}</T>
    </View>
  );
}

function Failed({ score, total, onRetry }: { score: number; total: number; onRetry: () => void }) {
  return (
    <Screen footer={<><Button label="Сдать ещё раз" onPress={onRetry} testID="retry" /><Button label="На главную" kind="quiet" onPress={() => router.replace('/')} testID="finish" /></>} testID="result-fail">
      <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        <T size={24} weight="bold" style={{ lineHeight: 32 }}>Почти получилось</T>
        <T size={18}>Верных ответов: {score} из {total}. Нужно {passMark(total)}.</T>
        <T tone="muted">Потренируйтесь и попробуйте снова. Попытки не ограничены.</T>
      </View>
    </Screen>
  );
}

function Finished({ lesson, score, total, mistakes, result }: { lesson: LessonRef | null; score: number; total: number; mistakes: number; result: FinishResult | null }) {
  const c = useColors();
  const { progress, liveStreak, currentLessonId, lessonState } = useProgress();
  const name = progress.name ?? '';
  const accuracy = total ? Math.round((score / total) * 100) : 100;

  if (!lesson) {
    return (
      <Screen footer={<Button label="На главную" onPress={() => router.replace('/')} testID="finish" />} testID="result-practice">
        <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
          <T size={24} weight="bold" style={{ lineHeight: 32 }}>Хорошая тренировка, {name}</T>
          <T size={18}>Верных ответов: {score} из {total}.</T>
          <T tone="muted">Ошибки вернутся в следующей тренировке.</T>
        </View>
      </Screen>
    );
  }

  const star = result?.stageStar ? getStage(result.stageStar) : null;
  const count = result?.todayCount ?? 0;
  const goal = progress.settings.dailyGoal;
  const left = goal - count;
  const canContinue = !result?.courseDone && currentLessonId !== null && lessonState(currentLessonId) === 'open';
  const moreToday = !!result?.firstTime && left > 0 && canContinue;
  const goalReached = !!result?.firstTime && count === goal;
  let heading = `На сегодня всё, ${name}`;
  let line = 'Цель дня выполнена. Давай потренируемся на том, чему научились, или пройди ещё урок.';
  if (!goalReached && !moreToday && result?.firstTime) {
    heading = `Ещё один урок, ${name}`;
    line = 'Отлично идёте. Не забывайте отдыхать: так буквы и слова лучше запоминаются.';
  }
  if (result?.courseDone) {
    heading = `Вы прошли весь курс, ${name}`;
    line = 'Целый год занятий позади. Тренировка всегда открыта.';
  } else if (result?.firstTime === false) {
    heading = `Урок повторён, ${name}`;
    line = 'Хорошо, что вы вернулись к этому уроку.';
  } else if (moreToday) {
    heading = `Урок ${count} из ${goal} пройден`;
    line = left === 1 ? 'Сегодня остался ещё один урок.' : `Сегодня осталось ещё уроков: ${left}.`;
  }

  return (
    <Screen
      footer={
        <>
          {moreToday || (!goalReached && canContinue) ? (
            <Button label="Следующий урок" onPress={() => router.replace(`/lesson/${currentLessonId}`)} testID="next-lesson" />
          ) : (
            <>
              <Button label="Давай потренируемся" onPress={() => router.replace('/lesson/practice')} testID="practice-now" />
              {canContinue ? <Button label="Ещё урок" kind="quiet" onPress={() => router.replace(`/lesson/${currentLessonId}`)} testID="more-lesson" /> : null}
            </>
          )}
          <Button label="На главную" kind="quiet" onPress={() => router.replace('/')} testID="finish" />
        </>
      }
      testID={star ? 'result-star' : moreToday || (!goalReached && canContinue && !!result?.firstTime) ? 'result-next' : 'result-rest'}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        {star ? (
          <>
            <Text style={{ fontSize: 72, lineHeight: 92 }}>🌟</Text>
            <T size={15} weight="bold" tone="gold" style={{ textAlign: 'center' }}>Этап {star.id} пройден: {star.title}</T>
          </>
        ) : (
          <Khatam size={96} fill={c.gold}>
            <T size={32} weight="bold" style={{ color: c.onAccent, lineHeight: 40 }}>✓</T>
          </Khatam>
        )}
        <T size={24} weight="bold" style={{ lineHeight: 32, textAlign: 'center' }}>{heading}</T>
        <T size={17} style={{ textAlign: 'center', lineHeight: 25 }}>{line}</T>
        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <Stat value={`${accuracy}%`} label={mistakes ? `ошибок: ${mistakes}` : 'без ошибок'} />
          <Stat value={`🔥 ${liveStreak}`} label="дней подряд" />
        </View>
      </View>
    </Screen>
  );
}

function Runner({ lesson }: { lesson: LessonRef | null }) {
  const { progress, finishLesson, finishPractice, recordAnswer } = useProgress();
  const [attempt, setAttempt] = useState(0);
  const initial = useMemo<Task[]>(
    () => (lesson ? buildLesson(lesson, Math.random, voiceReady()) : buildPractice(progress.done, progress.mistakes, 10, Math.random, progress.srs, dayKey(new Date()))),
    // Задания выбираются один раз на попытку и не меняются от новых ответов
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson?.id, attempt],
  );
  const [queue, setQueue] = useState<Task[]>(initial);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [finished, setFinished] = useState(false);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => () => stopSpeech(), []);

  const isExam = lesson?.isExam ?? false;
  const uniqueTotal = new Set(queue.filter(isGraded).map((t) => t.key)).size - skipped;

  const finish = (finalScore: number, total = uniqueTotal) => {
    if (lesson && isExam && finalScore < passMark(total)) {
      setFailed(true);
      return;
    }
    if (lesson) setResult(finishLesson(lesson.id, finalScore, total));
    else finishPractice();
    setFinished(true);
  };

  const onDone = (correct?: boolean) => {
    stopSpeech();
    const task = queue[index];
    let nextQueue = queue;
    let nextScore = score;
    if (isGraded(task)) {
      const firstTry = !missed.includes(task.key);
      const itemId = (task as ChoiceTask | BuildTask | SpeakTask).itemId;
      if (itemId) recordAnswer(itemId, !!correct);
      if (correct && firstTry) nextScore += 1;
      if (!correct) {
        setMistakes(mistakes + 1);
        setMissed([...missed, task.key]);
        // В уроке ошибка возвращается в конец, на экзамене нет
        if (!isExam) nextQueue = [...queue, task];
      }
    }
    setQueue(nextQueue);
    setScore(nextScore);
    if (index + 1 >= nextQueue.length) finish(nextScore);
    else setIndex(index + 1);
  };

  // Нельзя говорить или нет связи: задание не считается ни верным, ни ошибкой
  const onSkip = () => {
    stopSpeech();
    const nextSkipped = skipped + 1;
    setSkipped(nextSkipped);
    if (index + 1 >= queue.length) finish(score, uniqueTotal - 1);
    else setIndex(index + 1);
  };

  if (failed) {
    return (
      <Failed
        score={score}
        total={uniqueTotal}
        onRetry={() => {
          const next = attempt + 1;
          setAttempt(next);
          setQueue(buildLesson(lesson!, Math.random, voiceReady()));
          setIndex(0);
          setScore(0);
          setMistakes(0);
          setMissed([]);
          setFailed(false);
          setSkipped(0);
        }}
      />
    );
  }
  if (finished) return <Finished lesson={lesson} score={score} total={uniqueTotal} mistakes={mistakes} result={result} />;

  const task = queue[index];
  const common = {
    value: index + 1,
    total: queue.length,
    last: index + 1 === queue.length,
    onDone,
    testID: `task-${task.type}`,
  };
  const key = `${attempt}-${index}-${task.key}`;
  switch (task.type) {
    case 'tip': return <TipStep key={key} {...common} task={task} />;
    case 'intro': return <IntroStep key={key} {...common} task={task} />;
    case 'read': return <ReadStep key={key} {...common} task={task} />;
    case 'match': return <MatchStep key={key} {...common} task={task} />;
    case 'build': return <BuildStep key={key} {...common} task={task} />;
    case 'speak': return <SpeakStep key={key} {...common} task={task} onSkip={onSkip} />;
    default: return <ChoiceStep key={key} {...common} task={task} />;
  }
}

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { progress, lessonState } = useProgress();

  if (id === 'practice') {
    if (Object.keys(progress.done).length === 0) return <Redirect href="/" />;
    return <Runner key="practice" lesson={null} />;
  }
  const lesson = getLesson(id);
  if (!lesson) return <Redirect href="/" />;
  const state = lessonState(lesson.id);
  // Экран результата показывается уже после записи урока, поэтому 'done' тоже разрешён
  if (state === 'locked') return <Redirect href="/" />;
  return <Runner key={lesson.id} lesson={lesson} />;
}
