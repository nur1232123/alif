import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_WEEKS, getStage } from '@/data/course';
import { LETTERS } from '@/data/letters';
import type { Item, Week } from '@/data/types';
import { dueItems, getLesson, introChunks, knownItems, lessonId, LESSONS_PER_DAY, LESSONS_PER_WEEK, passMark, TOTAL_LESSONS } from '@/lib/plan';
import { dayKey, useProgress, type LessonState } from '@/lib/progress';
import { cancelReminder, remindersSupported, scheduleReminder } from '@/lib/reminders';
import { FREE_TUTOR_PER_DAY, isPaidWeek, usePremium } from '@/lib/premium';
import { TEST_MODE } from '@/lib/server';
import { say } from '@/lib/speech';
import { Ar, Button, Khatam, PlayGlyph, ProgressBar, slots, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const ROW = 90;
const BANNER = 104;
const WEEK_HEIGHT = BANNER + ROW * LESSONS_PER_WEEK + 12;
const NUMERALS = ['١', '٢', '٣', '٤', '٥', '٦', '٧'];

/** Дорожка плавно идёт из стороны в сторону, экзамен стоит по центру */
const offsetOf = (n: number) => (n === LESSONS_PER_WEEK ? 0 : Math.round(Math.sin((n - 1) * 0.65) * 76));

type Tab = 'path' | 'letters' | 'practice' | 'profile';

function WeekBanner({ week, paidLock }: { week: Week; paidLock: boolean }) {
  const c = useColors();
  const stage = getStage(week.stageId)!;
  return (
    <View style={{ height: BANNER - 16, marginBottom: 16, borderRadius: 20, backgroundColor: c.accent, boxShadow: c.lift, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={13} weight="medium" style={{ color: c.onAccent, opacity: 0.85 }}>Этап {stage.id} · неделя {week.n}</T>
          {paidLock ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 7, backgroundColor: c.gold }} testID={`premium-badge-${week.n}`}>
              <T size={11} weight="bold" style={{ color: c.onAccent }}>Премиум</T>
            </View>
          ) : null}
        </View>
        <T size={19} weight="bold" style={{ color: c.onAccent, lineHeight: 25 }}>{week.title}</T>
      </View>
      <Text style={{ color: c.onAccent, fontFamily: fonts.arabic, fontSize: 20, lineHeight: 34 }}>{stage.ar}</Text>
    </View>
  );
}

function PathNode({ week, n, state, current, paidLock, onPress }: { week: Week; n: number; state: LessonState; current: boolean; paidLock: boolean; onPress: () => void }) {
  const c = useColors();
  const exam = n === LESSONS_PER_WEEK;
  const day = Math.ceil(n / LESSONS_PER_DAY);
  const lesson = getLesson(lessonId(week.n, n))!;
  const checkpoint = lesson.spec.kind === 'checkpoint';
  const size = exam ? 84 : checkpoint ? 78 : 70;
  const fill = paidLock ? c.line : state === 'done' ? c.gold : state === 'open' ? c.accent : c.line;
  // В уроке с новыми буквами на узле видна первая из них
  const spec = lesson.spec;
  const glyph = spec.kind === 'intro' && week.kind !== 'words' ? introChunks(week)[spec.chunk][0].ar : NUMERALS[day - 1];
  const ink = state === 'locked' || paidLock ? c.muted : c.onAccent;
  return (
    <View style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ transform: [{ translateX: offsetOf(n) }] }}>
        {current ? (
          <View style={{ position: 'absolute', top: -20, alignSelf: 'center', zIndex: 2, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
            <T size={12} weight="bold" tone={paidLock ? 'gold' : 'accent'}>{paidLock ? 'Премиум' : 'Начать'}</T>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Неделя ${week.n}, день ${day}, урок ${((n - 1) % LESSONS_PER_DAY) + 1}`}
          onPress={onPress}
          testID={`node-${lessonId(week.n, n)}`}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          <Khatam size={size} fill={fill}>
            {paidLock ? (
              <View style={{ position: 'absolute', right: -2, top: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
                <T size={11} weight="bold" style={{ color: c.onAccent, lineHeight: 14 }}>★</T>
              </View>
            ) : null}
            {exam || checkpoint ? (
              <T size={13} weight="bold" style={{ color: ink }}>{state === 'done' ? '✓' : exam ? (week.bigExam ? '🌟' : 'Экз') : '½'}</T>
            ) : (
              <Text style={{ color: ink, fontFamily: fonts.arabicBold, fontSize: 24, lineHeight: 38 }}>{state === 'done' ? '✓' : glyph}</Text>
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
  const { isPremium } = usePremium();
  const lesson = getLesson(id)!;
  const state = lessonState(id);
  const paidLock = isPaidWeek(lesson.week) && !isPremium;
  const canTrain = Object.keys(progress.done).length > 0;
  const openCopy =
    lesson.spec.kind === 'checkpoint'
      ? `Проверка половины недели: нужно ответить верно на ${passMark(10)} из 10.`
      : lesson.spec.kind === 'exam'
        ? 'Покажите, чему научились за неделю.'
        : `Урок ${lesson.n} из ${LESSONS_PER_WEEK} на этой неделе.`;
  const copy = {
    done: 'Этот урок пройден. Можно повторить.',
    open: openCopy,
    locked: 'Сначала пройдите предыдущие уроки.',
  }[state];
  return (
    <>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.ink, opacity: 0.25 }]} testID="sheet-close" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 10, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.surface }} testID="lesson-sheet">
          <T size={13} weight="bold" tone="accent">Неделя {lesson.week.n}: {lesson.week.title}</T>
          <T size={22} weight="bold" style={{ lineHeight: 28 }}>{lesson.title}</T>
          <T tone="muted">{paidLock ? 'Этот урок входит в Алиф Премиум. Алфавит и чтение остаются бесплатными.' : copy}</T>
          {paidLock ? (
            <Button label="Открыть Премиум" onPress={() => { onClose(); router.push('/premium'); }} testID="sheet-premium" />
          ) : state === 'open' || state === 'done' ? (
            <Button label={state === 'done' ? 'Повторить урок' : 'Начать урок'} onPress={() => { onClose(); router.push(`/lesson/${id}`); }} testID="sheet-start" />
          ) : null}
          {canTrain ? <Button label="Потренироваться" kind="quiet" onPress={onTrain} testID="sheet-train" /> : null}
        </View>
      </View>
    </>
  );
}

function PathTab() {
  const { progress, currentLessonId, lessonState } = useProgress();
  const { isPremium } = usePremium();
  const [sheet, setSheet] = useState<string | null>(null);
  const currentWeek = currentLessonId ? Number(currentLessonId.split('-')[0]) : ALL_WEEKS.length;
  const [initialIndex] = useState(currentWeek - 1);
  // FlatList перерисовывает недели, когда меняется прогресс
  const extra = progress;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={ALL_WEEKS}
        extraData={[extra, isPremium]}
        keyExtractor={(w) => String(w.n)}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: WEEK_HEIGHT, offset: WEEK_HEIGHT * index, index })}
        initialNumToRender={3}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' }}
        testID="path"
        renderItem={({ item: week }) => (
          <View style={{ height: WEEK_HEIGHT }}>
            <WeekBanner week={week} paidLock={isPaidWeek(week) && !isPremium} />
            {Array.from({ length: LESSONS_PER_WEEK }, (_, i) => {
              const id = lessonId(week.n, i + 1);
              return <PathNode key={id} week={week} n={i + 1} state={lessonState(id)} current={id === currentLessonId} paidLock={isPaidWeek(week) && !isPremium} onPress={() => setSheet(id)} />;
            })}
          </View>
        )}
      />
      {sheet ? <LessonSheet id={sheet} onClose={() => setSheet(null)} onTrain={() => { setSheet(null); router.push('/lesson/practice'); }} /> : null}
    </View>
  );
}

function LetterSheet({ letter, onClose }: { letter: Item; onClose: () => void }) {
  const c = useColors();
  return (
    <>
      <Pressable accessibilityLabel="Закрыть" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.ink, opacity: 0.25 }]} testID="letter-close" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <ScrollView
          style={{ width: '100%', maxWidth: 560, maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: c.surface }}
          contentContainerStyle={{ gap: 12, padding: 20 }}
          testID="letter-sheet"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Ar size={88} style={{ lineHeight: 140 }}>{letter.ar}</Ar>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <T size={24} weight="bold" style={{ lineHeight: 30 }}>{letter.ru}</T>
              <T tone="muted" size={14}>{letter.note}</T>
            </View>
          </View>
          <Button label="Слушать название" kind="quiet" onPress={() => say(letter.say)} testID="letter-listen" />
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
            {letter.forms?.map((form) => (
              <View key={form.label} style={{ flexGrow: 1, flexBasis: '22%', minWidth: 72, alignItems: 'center', borderRadius: 12, backgroundColor: c.soft, paddingVertical: 6 }}>
                <Ar size={32}>{form.ar}</Ar>
                <T size={12} tone="muted">{form.label}</T>
              </View>
            ))}
          </View>
          {letter.example ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Слушать слово: ${letter.example.ru}`}
              onPress={() => say(letter.example!.ar)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, opacity: pressed ? 0.75 : 1 })}
            >
              <PlayGlyph color={c.accent} size={11} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={12} tone="muted">Слово на эту букву</T>
                <T weight="medium">{letter.example.ru}</T>
              </View>
              <Ar size={28} style={{ lineHeight: 44 }}>{letter.example.ar}</Ar>
            </Pressable>
          ) : null}
          <Button label="Закрыть" onPress={onClose} testID="letter-done" />
        </ScrollView>
      </View>
    </>
  );
}

/** Весь алфавит доступен с первого дня: можно посмотреть и послушать любую букву */
function LettersTab() {
  const c = useColors();
  const { progress } = useProgress();
  const known = useMemo(() => new Set(knownItems(progress.done).map((x) => x.id)), [progress.done]);
  const [open, setOpen] = useState<Item | null>(null);
  const learned = LETTERS.filter((l) => known.has(l.id)).length;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }} testID="letters-tab">
        <T size={24} weight="bold" style={{ lineHeight: 32 }}>Буквы</T>
        <View style={{ gap: 6 }}>
          <T tone="muted" size={14}>Выучено {learned} из 28. Нажмите на букву, чтобы услышать её и посмотреть формы.</T>
          <ProgressBar value={learned} total={28} />
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
          {LETTERS.map((letter) => {
            const isKnown = known.has(letter.id);
            return (
              <Pressable
                key={letter.id}
                accessibilityRole="button"
                accessibilityLabel={`${letter.ru}${isKnown ? ', выучена' : ''}`}
                onPress={() => {
                  say(letter.say);
                  setOpen(letter);
                }}
                testID={`letter-${letter.id}`}
                style={({ pressed }) => ({
                  flexBasis: '22%',
                  flexGrow: 1,
                  minWidth: 70,
                  alignItems: 'center',
                  paddingTop: 4,
                  paddingBottom: 8,
                  borderRadius: 16,
                  borderWidth: isKnown ? 1.5 : 1,
                  borderColor: isKnown ? c.gold : c.line,
                  backgroundColor: c.surface,
                  boxShadow: c.shadow,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Ar size={40} bold style={{ lineHeight: 66 }}>{letter.ar}</Ar>
                <T size={12} tone={isKnown ? 'ink' : 'muted'} weight={isKnown ? 'medium' : 'regular'} style={{ textAlign: 'center' }}>{letter.ru}</T>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {open ? <LetterSheet letter={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function PracticeTab() {
  const c = useColors();
  const { progress } = useProgress();
  const { tutorLeft } = usePremium();
  const items = useMemo(() => knownItems(progress.done), [progress.done]);
  const weak = items.filter((x) => (progress.mistakes[x.id] ?? 0) > 0).length;
  const due = dueItems(progress.done, progress.srs, dayKey(new Date())).length;
  const newest = [...items].reverse().slice(0, 120);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }} testID="practice-tab">
      <T size={24} weight="bold" style={{ lineHeight: 32 }}>Тренировка</T>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/tutor')}
          testID="open-tutor"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: c.shadow, opacity: pressed ? 0.8 : 1 })}
        >
          <Khatam size={44} fill={c.gold}>
            <T size={18} weight="bold" style={{ color: c.onAccent }}>؟</T>
          </Khatam>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={17} weight="bold">Спросить ИИ-учителя</T>
            <T size={14} tone="muted">
              {tutorLeft === Infinity ? 'Объяснит правило или слово по-русски' : `Объяснит по-русски. Сегодня осталось ${tutorLeft} из ${FREE_TUTOR_PER_DAY}`}
            </T>
          </View>
        </Pressable>
      {items.length === 0 ? (
        <T tone="muted">Пройдите первый урок, и здесь появится всё, что вы выучили.</T>
      ) : (
        <>
          <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: c.shadow }}>
            <T size={18} weight="bold" testID="due-count">{due > 0 ? `Пора повторить: ${due}` : weak > 0 ? `Слабых мест: ${weak}` : 'Всё повторено'}</T>
            <T tone="muted" size={14}>
              {due > 0
                ? 'Пора освежить пройденное, чтобы оно не забылось. После каждого верного ответа следующий повтор будет позже: через день, 3 дня, неделю, месяц.'
                : weak > 0
                  ? 'Сначала повторим то, где были ошибки.'
                  : 'Повторим случайные слова и буквы из пройденного.'}
            </T>
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
    <View style={{ flexGrow: 1, flexBasis: '45%', gap: 2, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: c.shadow }}>
      <T size={22} weight="bold">{value}</T>
      <T size={13} tone="muted">{label}</T>
    </View>
  );
}

const HOURS = [8, 12, 17, 19, 21];

function SettingsBlock() {
  const c = useColors();
  const { progress, updateSettings } = useProgress();
  const { settings } = progress;
  const [notice, setNotice] = useState<string | null>(null);

  const setReminder = async (on: boolean, hour = settings.reminderHour) => {
    setNotice(null);
    if (!on) {
      await cancelReminder();
      updateSettings({ reminder: false, reminderHour: hour });
      return;
    }
    const ok = await scheduleReminder(progress.name ?? '', hour, settings.dailyGoal);
    updateSettings({ reminder: ok, reminderHour: hour });
    if (!ok) setNotice('Уведомления запрещены. Разрешите их для «Алиф» в настройках телефона.');
  };

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56 };
  const chip = (active: boolean) => ({
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: active ? c.accent : c.line,
    backgroundColor: active ? c.soft : c.surface,
  });
  return (
    <View style={{ gap: 4, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, boxShadow: c.shadow }} testID="settings">
      <T size={18} weight="bold">Настройки</T>
      <T style={{ marginTop: 8 }}>Цель дня</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }}>
        {[1, 3, 5].map((goal) => {
          const active = settings.dailyGoal === goal;
          return (
            <Pressable key={goal} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => updateSettings({ dailyGoal: goal })} style={chip(active)} testID={`goal-${goal}`}>
              <T weight={active ? 'bold' : 'regular'}>{({ 1: '1 урок', 3: '3 урока', 5: '5 уроков' } as Record<number, string>)[goal]}</T>
            </Pressable>
          );
        })}
      </View>
      <T size={13} tone="muted">При цели 3 урока в день курс займёт год. Больше уроков можно проходить в любой день.</T>
      {TEST_MODE ? (
        <View style={row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T>Режим проверки: все уроки открыты</T>
            <T size={13} tone="muted">Видно только вам. У учеников уроки открываются по порядку</T>
          </View>
          <Switch value={settings.allOpen} onValueChange={(v) => updateSettings({ allOpen: v })} trackColor={{ true: c.accent, false: c.line }} testID="all-open-switch" />
        </View>
      ) : null}
      <View style={row}>
        <T style={{ flex: 1 }}>Звуки ответов</T>
        <Switch value={settings.sounds} onValueChange={(v) => updateSettings({ sounds: v })} trackColor={{ true: c.accent, false: c.line }} testID="sounds-switch" />
      </View>
      {remindersSupported ? (
        <>
          <View style={row}>
            <T style={{ flex: 1 }}>Напоминать каждый день</T>
            <Switch value={settings.reminder} onValueChange={(v) => setReminder(v)} trackColor={{ true: c.accent, false: c.line }} testID="reminder-switch" />
          </View>
          {settings.reminder ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 }}>
              {HOURS.map((h) => {
                const active = settings.reminderHour === h;
                return (
                  <Pressable
                    key={h}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setReminder(true, h)}
                    style={{ minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: active ? c.accent : c.line, backgroundColor: active ? c.soft : c.surface }}
                  >
                    <T weight={active ? 'bold' : 'regular'}>{h}:00</T>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : (
        <T size={13} tone="muted">Ежедневные напоминания работают в приложении на телефоне.</T>
      )}
      {notice ? <T size={14} tone="bad">{notice}</T> : null}
    </View>
  );
}

/** Подписка в профиле */
function PremiumBlock() {
  const c = useColors();
  const { isPremium, testPremium, setTestPremium } = usePremium();
  const manage = Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 20, borderWidth: isPremium ? 1.5 : 1, borderColor: isPremium ? c.gold : c.line, backgroundColor: c.surface, boxShadow: c.shadow }} testID="premium-block">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Khatam size={40} fill={isPremium ? c.gold : c.line}>
          <T size={15} weight="bold" style={{ color: isPremium ? c.onAccent : c.muted, lineHeight: 18 }}>★</T>
        </Khatam>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={17} weight="bold">{isPremium ? 'Алиф Премиум' : 'Бесплатная версия'}</T>
          <T size={14} tone="muted">{isPremium ? 'Открыты все этапы и ИИ-учитель' : 'Открыты алфавит и чтение (этапы 1–2)'}</T>
        </View>
      </View>
      {isPremium ? (
        Platform.OS !== 'web' ? <Button label="Управлять подпиской" kind="quiet" onPress={() => Linking.openURL(manage)} testID="manage-premium" /> : null
      ) : (
        <Button label="Попробовать Премиум" onPress={() => router.push('/premium')} testID="open-premium" />
      )}
      {TEST_MODE ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T>Режим проверки: Премиум включён</T>
            <T size={13} tone="muted">Выключите, чтобы увидеть бесплатную версию глазами ученика</T>
          </View>
          <Switch value={testPremium} onValueChange={setTestPremium} trackColor={{ true: c.accent, false: c.line }} testID="test-premium-switch" />
        </View>
      ) : null}
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
      <T size={24} weight="bold" style={{ lineHeight: 32 }}>{progress.name}</T>
      <View style={{ gap: 6 }}>
        <T tone="muted" size={14}>Курс рассчитан на год при {LESSONS_PER_DAY} уроках в день</T>
        <ProgressBar value={doneCount} total={TOTAL_LESSONS} thick />
        <T size={13} tone="muted">Уроков пройдено: {doneCount} из {TOTAL_LESSONS}</T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat value={`🔥 ${liveStreak}`} label="дней подряд" />
        <Stat value={`🌟 ${progress.stars.length}`} label="звёзд из 5" />
        <Stat value={`${week} / ${ALL_WEEKS.length}`} label="неделя курса" />
        <Stat value={String(words)} label="знакомых элементов" />
      </View>
      <PremiumBlock />
      <SettingsBlock />
      <Button label="Изменить имя" kind="quiet" onPress={() => router.push('/welcome')} testID="change-name" />
      {Footer ? <Footer /> : null}
    </ScrollView>
  );
}

type TabKind = 'path' | 'letters' | 'practice' | 'tutor' | 'profile';

/** Простые значки вкладок, нарисованные без картинок: так они одинаково выглядят на всех телефонах */
function TabIcon({ kind, color, back }: { kind: TabKind; color: string; back: string }) {
  const box = { width: 26, height: 24, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (kind === 'path') return <View style={box}><Khatam size={20} fill={color} /></View>;
  if (kind === 'letters') {
    return (
      <View style={box}>
        <Text style={{ color, fontFamily: fonts.arabicBold, fontSize: 22, lineHeight: 30, marginTop: -6 }}>ب</Text>
      </View>
    );
  }
  if (kind === 'practice') {
    // Мишень
    return (
      <View style={box}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        </View>
      </View>
    );
  }
  if (kind === 'tutor') {
    // Облачко разговора
    return (
      <View style={box}>
        <View style={{ width: 22, height: 16, borderRadius: 6, backgroundColor: color, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5 }}>
          {[0, 1, 2].map((i) => <View key={i} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: back }} />)}
        </View>
        <View style={{ position: 'absolute', left: 5, bottom: 1, width: 0, height: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopColor: color, borderRightColor: 'transparent' }} />
      </View>
    );
  }
  // Профиль: голова и плечи
  return (
    <View style={[box, { justifyContent: 'flex-end', gap: 2 }]}>
      <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }} />
      <View style={{ width: 18, height: 8, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: color, marginBottom: 1 }} />
    </View>
  );
}

function TabButton({ label, active, onPress, id, kind }: { label: string; active: boolean; onPress: () => void; id: string; kind: TabKind }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={id}
      style={{ flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 }}
    >
      <TabIcon kind={kind} color={active ? c.accent : c.muted} back={c.surface} />
      <T size={11} weight={active ? 'bold' : 'medium'} tone={active ? 'accent' : 'muted'}>{label}</T>
    </Pressable>
  );
}

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { progress, isNewUser, liveStreak, todayCount } = useProgress();
  const [tab, setTab] = useState<Tab>('path');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="home">
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <T size={16} weight="bold" lines={1} style={{ flex: 1, minWidth: 0 }} testID="greeting">
            {isNewUser ? `Добро пожаловать, ${progress.name}` : `С возвращением, ${progress.name}`}
          </T>
          <T size={15} weight="bold" tone="accent" testID="today">{Math.min(todayCount, progress.settings.dailyGoal)}/{progress.settings.dailyGoal}</T>
          <T size={15} weight="bold" tone="bad" testID="streak">🔥 {liveStreak}</T>
          <T size={15} weight="bold" tone="gold" testID="stars">🌟 {progress.stars.length}</T>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'path' ? <PathTab /> : tab === 'letters' ? <LettersTab /> : tab === 'practice' ? <PracticeTab /> : <ProfileTab />}
      </View>
      <View style={{ paddingBottom: insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: c.surface }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row' }}>
          <TabButton id="tab-path" kind="path" label="Путь" active={tab === 'path'} onPress={() => setTab('path')} />
          <TabButton id="tab-letters" kind="letters" label="Буквы" active={tab === 'letters'} onPress={() => setTab('letters')} />
          <TabButton id="tab-practice" kind="practice" label="Тренировка" active={tab === 'practice'} onPress={() => setTab('practice')} />
          <TabButton id="tab-tutor" kind="tutor" label="Учитель" active={false} onPress={() => router.push('/tutor')} />
          <TabButton id="tab-profile" kind="profile" label="Профиль" active={tab === 'profile'} onPress={() => setTab('profile')} />
        </View>
      </View>
    </View>
  );
}
