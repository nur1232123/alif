import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_WEEKS, getStage } from '@/data/course';
import type { Week } from '@/data/types';
import { DAYS_PER_WEEK, examTitle, getLesson, knownItems, lessonId, TOTAL_LESSONS } from '@/lib/plan';
import { useProgress, type LessonState } from '@/lib/progress';
import { say } from '@/lib/speech';
import { Ar, Button, Khatam, PlayGlyph, ProgressBar, slots, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const ROW = 92;
const BANNER = 104;
const WEEK_HEIGHT = BANNER + ROW * DAYS_PER_WEEK + 12;
const OFFSETS = [0, 52, 78, 52, 0, -52, 0];
const NUMERALS = ['١', '٢', '٣', '٤', '٥', '٦'];

type Tab = 'path' | 'practice' | 'profile';

function WeekBanner({ week }: { week: Week }) {
  const c = useColors();
  const stage = getStage(week.stageId)!;
  return (
    <View style={{ height: BANNER - 16, marginBottom: 16, borderRadius: 16, borderBottomWidth: 4, borderBottomColor: c.gold, backgroundColor: c.accent, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={13} weight="medium" style={{ color: c.onAccent, opacity: 0.85 }}>Этап {stage.id} · неделя {week.n}</T>
        <T size={19} weight="bold" style={{ color: c.onAccent, lineHeight: 25 }}>{week.title}</T>
      </View>
      <Text style={{ color: c.onAccent, fontFamily: fonts.arabic, fontSize: 20, lineHeight: 34 }}>{stage.ar}</Text>
    </View>
  );
}

function PathNode({ week, day, state, onPress }: { week: Week; day: number; state: LessonState; onPress: () => void }) {
  const c = useColors();
  const exam = day === DAYS_PER_WEEK;
  const size = exam ? 84 : 72;
  const current = state === 'open' || state === 'tomorrow';
  const fill = state === 'done' ? c.gold : state === 'open' ? c.accent : state === 'tomorrow' ? c.muted : c.line;
  const ink = state === 'locked' ? c.muted : c.onAccent;
  return (
    <View style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ transform: [{ translateX: OFFSETS[day - 1] }] }}>
        {current ? (
          <View style={{ position: 'absolute', top: -20, alignSelf: 'center', zIndex: 2, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
            <T size={12} weight="bold" tone={state === 'open' ? 'accent' : 'muted'}>{state === 'open' ? 'Начать' : 'Завтра'}</T>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Неделя ${week.n}, урок ${day}`}
          onPress={onPress}
          testID={`node-${lessonId(week.n, day)}`}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          <Khatam size={size} fill={fill}>
            {exam ? (
              <T size={13} weight="bold" style={{ color: ink }}>{state === 'done' ? '✓' : week.bigExam ? '🌟' : 'Экз'}</T>
            ) : (
              <Text style={{ color: ink, fontFamily: fonts.arabicBold, fontSize: 24, lineHeight: 38 }}>{state === 'done' ? '✓' : NUMERALS[day - 1]}</Text>
            )}
          </Khatam>
        </Pressable>
      </View>
    </View>
  );
}

function LessonSheet({ id, onClose, onTrain }: { id: string; onClose: () => void; onTrain: () => void }) {
  const c = useColors();
  const { lessonState, progress } = useProgress();
  const lesson = getLesson(id)!;
  const state = lessonState(id);
  const canTrain = Object.keys(progress.done).length > 0;
  const copy = {
    done: 'Этот урок пройден. Можно повторить.',
    open: lesson.isExam ? 'Покажите, чему научились за неделю.' : `Урок ${lesson.day} из ${DAYS_PER_WEEK} на этой неделе.`,
    tomorrow: 'Сегодняшний урок пройден. Новый откроется завтра.',
    locked: 'Сначала пройдите предыдущие уроки.',
  }[state];
  return (
    <>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.ink, opacity: 0.25 }]} testID="sheet-close" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 10, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.surface }} testID="lesson-sheet">
          <T size={13} weight="bold" tone="accent">Неделя {lesson.week.n}: {lesson.week.title}</T>
          <T size={22} weight="bold" style={{ lineHeight: 28 }}>{lesson.isExam ? examTitle(lesson.week) : lesson.title}</T>
          <T tone="muted">{copy}</T>
          {state === 'open' || state === 'done' ? (
            <Button label={state === 'done' ? 'Повторить урок' : 'Начать урок'} onPress={() => { onClose(); router.push(`/lesson/${id}`); }} testID="sheet-start" />
          ) : null}
          {state === 'tomorrow' && canTrain ? <Button label="Потренироваться" onPress={onTrain} testID="sheet-train" /> : null}
        </View>
      </View>
    </>
  );
}

function PathTab() {
  const { progress, currentLessonId, lessonState } = useProgress();
  const [sheet, setSheet] = useState<string | null>(null);
  const currentWeek = currentLessonId ? Number(currentLessonId.split('-')[0]) : ALL_WEEKS.length;
  const [initialIndex] = useState(currentWeek - 1);
  // FlatList перерисовывает недели, когда меняется прогресс
  const extra = progress;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={ALL_WEEKS}
        extraData={extra}
        keyExtractor={(w) => String(w.n)}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: WEEK_HEIGHT, offset: WEEK_HEIGHT * index, index })}
        initialNumToRender={3}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' }}
        testID="path"
        renderItem={({ item: week }) => (
          <View style={{ height: WEEK_HEIGHT }}>
            <WeekBanner week={week} />
            {Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
              const id = lessonId(week.n, i + 1);
              return <PathNode key={id} week={week} day={i + 1} state={lessonState(id)} onPress={() => setSheet(id)} />;
            })}
          </View>
        )}
      />
      {sheet ? <LessonSheet id={sheet} onClose={() => setSheet(null)} onTrain={() => { setSheet(null); router.push('/lesson/practice'); }} /> : null}
    </View>
  );
}

function PracticeTab() {
  const c = useColors();
  const { progress } = useProgress();
  const items = useMemo(() => knownItems(progress.done), [progress.done]);
  const weak = items.filter((x) => (progress.mistakes[x.id] ?? 0) > 0).length;
  const newest = [...items].reverse().slice(0, 120);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }} testID="practice-tab">
      <T size={26} weight="bold" style={{ lineHeight: 34 }}>Тренировка</T>
      {items.length === 0 ? (
        <T tone="muted">Пройдите первый урок, и здесь появится всё, что вы выучили.</T>
      ) : (
        <>
          <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderBottomWidth: 4, borderColor: c.line, backgroundColor: c.surface }}>
            <T size={18} weight="bold">{weak > 0 ? `Слабых мест: ${weak}` : 'Ошибок нет'}</T>
            <T tone="muted" size={14}>{weak > 0 ? 'Сначала повторим то, где были ошибки.' : 'Повторим случайные слова и буквы из пройденного.'}</T>
            <Button label="Начать тренировку" onPress={() => router.push('/lesson/practice')} testID="practice" />
          </View>
          <T weight="bold" size={18}>Уже знакомо: {items.length}</T>
          <View style={{ gap: 8 }}>
            {newest.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Слушать: ${item.ru}`}
                onPress={() => say(item.say)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 })}
              >
                <PlayGlyph color={c.accent} size={11} />
                <T style={{ flex: 1, minWidth: 0 }}>{item.ru}</T>
                <Ar size={22} style={{ lineHeight: 36 }}>{item.ar}</Ar>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', gap: 2, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: c.line, backgroundColor: c.surface }}>
      <T size={22} weight="bold">{value}</T>
      <T size={13} tone="muted">{label}</T>
    </View>
  );
}

function ProfileTab() {
  const { progress, liveStreak, currentLessonId } = useProgress();
  const doneCount = Object.keys(progress.done).length;
  const week = currentLessonId ? Number(currentLessonId.split('-')[0]) : ALL_WEEKS.length;
  const words = useMemo(() => knownItems(progress.done).length, [progress.done]);
  const Footer = slots.homeFooter;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }} testID="profile-tab">
      <T size={26} weight="bold" style={{ lineHeight: 34 }}>{progress.name}</T>
      <View style={{ gap: 6 }}>
        <T tone="muted" size={14}>Курс рассчитан на год: один урок в день</T>
        <ProgressBar value={doneCount} total={TOTAL_LESSONS} thick />
        <T size={13} tone="muted">Уроков пройдено: {doneCount} из {TOTAL_LESSONS}</T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat value={`🔥 ${liveStreak}`} label="дней подряд" />
        <Stat value={`🌟 ${progress.stars.length}`} label="звёзд из 5" />
        <Stat value={`${week} / ${ALL_WEEKS.length}`} label="неделя курса" />
        <Stat value={String(words)} label="знакомых элементов" />
      </View>
      <Button label="Изменить имя" kind="quiet" onPress={() => router.push('/welcome')} testID="change-name" />
      {Footer ? <Footer /> : null}
    </ScrollView>
  );
}

function TabButton({ label, active, onPress, id }: { label: string; active: boolean; onPress: () => void; id: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={id}
      style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <Khatam size={16} fill={active ? c.accent : c.line} />
      <T size={12} weight={active ? 'bold' : 'regular'} tone={active ? 'accent' : 'muted'}>{label}</T>
    </Pressable>
  );
}

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { progress, isNewUser, liveStreak } = useProgress();
  const [tab, setTab] = useState<Tab>('path');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="home">
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <T size={17} weight="bold" style={{ flex: 1, minWidth: 0 }} testID="greeting">
            {isNewUser ? `Добро пожаловать, ${progress.name}` : `С возвращением, ${progress.name}`}
          </T>
          <T size={15} weight="bold" tone="bad" testID="streak">🔥 {liveStreak}</T>
          <T size={15} weight="bold" tone="gold" testID="stars">🌟 {progress.stars.length}</T>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'path' ? <PathTab /> : tab === 'practice' ? <PracticeTab /> : <ProfileTab />}
      </View>
      <View style={{ paddingBottom: insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: c.surface }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row' }}>
          <TabButton id="tab-path" label="Путь" active={tab === 'path'} onPress={() => setTab('path')} />
          <TabButton id="tab-practice" label="Тренировка" active={tab === 'practice'} onPress={() => setTab('practice')} />
          <TabButton id="tab-profile" label="Профиль" active={tab === 'profile'} onPress={() => setTab('profile')} />
        </View>
      </View>
    </View>
  );
}
