import { router } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLesson } from '@/lib/plan';
import { FREE_TUTOR_PER_DAY, usePremium } from '@/lib/premium';
import { useProgress } from '@/lib/progress';
import { askTutor, TUTOR_ERRORS, TUTOR_LIMIT_TEXT, tutorEnabled, type TutorMessage } from '@/lib/tutor';
import { T, useSlow, WAKING_TEXT } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const SUGGESTIONS = ['Чем отличаются ح и ه?', 'Что такое танвин?', 'Когда «аль» не читается?', 'Как сказать «спасибо»?'];

/** Чат с ИИ-учителем: вопросы о буквах, словах и правилах на русском */
export default function TutorScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { progress, currentLessonId } = useProgress();
  const { tutorLeft, spendTutor } = usePremium();
  const limited = tutorLeft <= 0;
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const slow = useSlow(busy);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const lesson = currentLessonId ? getLesson(currentLessonId) : null;
  const context = lesson ? `неделя ${lesson.week.n} «${lesson.week.title}», урок «${lesson.title}»` : 'курс пройден';

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy || limited) return;
    const next: TutorMessage[] = [...messages, { role: 'user', text: question }];
    setMessages(next);
    setDraft('');
    setError(null);
    setBusy(true);
    const reply = await askTutor(next, context);
    setBusy(false);
    if (reply.ok) {
      setMessages([...next, { role: 'model', text: reply.text }]);
      spendTutor();
    }
    else {
      // Вопрос возвращается в поле ввода, чтобы его не набирать заново
      setMessages(messages);
      setDraft(question);
      setError(TUTOR_ERRORS[reply.reason]);
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const bubble = (mine: boolean) => ({
    alignSelf: mine ? ('flex-end' as const) : ('flex-start' as const),
    maxWidth: '88%' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomRightRadius: mine ? 4 : 16,
    borderBottomLeftRadius: mine ? 16 : 4,
    backgroundColor: mine ? c.accent : c.surface,
    borderWidth: mine ? 0 : 1,
    borderColor: c.line,
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="tutor">
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 10, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="close">
            <T size={22} weight="bold" tone="muted">✕</T>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={17} weight="bold">ИИ-учитель</T>
            <T size={12} tone="muted">
              {tutorLeft === Infinity ? 'Отвечает на вопросы об арабском по-русски' : `Бесплатно ${FREE_TUTOR_PER_DAY} вопроса в день, осталось ${tutorLeft}`}
            </T>
          </View>
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {!tutorEnabled ? (
          <View style={{ gap: 6, padding: 14, borderRadius: 14, backgroundColor: c.goldSoft }} testID="tutor-off">
            <T weight="bold">ИИ-учитель пока не подключён</T>
            <T size={14} tone="muted">
              Он работает в приложении на телефоне, когда запущен сервер «Алиф» с ключом Gemini. Как это сделать, написано в файле server/README.md.
            </T>
          </View>
        ) : null}
        <View style={bubble(false)}>
          <T style={{ lineHeight: 23 }}>
            Здравствуйте, {progress.name}! Я ИИ-учитель. Спросите что угодно про арабские буквы, слова и правила, отвечу коротко и по-русски.
          </T>
        </View>
        {messages.map((m, i) => (
          <View key={i} style={bubble(m.role === 'user')} testID={m.role === 'user' ? 'msg-user' : 'msg-tutor'}>
            <T style={{ lineHeight: 23, color: m.role === 'user' ? c.onAccent : c.ink }}>{m.text}</T>
          </View>
        ))}
        {busy ? (
          <View style={[bubble(false), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <ActivityIndicator color={c.accent} />
            <T tone="muted" style={{ flexShrink: 1 }}>{slow ? WAKING_TEXT : 'Учитель думает…'}</T>
          </View>
        ) : null}
        {messages.length === 0 && tutorEnabled && !limited ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                onPress={() => send(s)}
                style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 })}
                testID="suggestion"
              >
                <T size={14}>{s}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
        {error ? <T size={14} tone="bad" testID="tutor-error">{error}</T> : null}
        {limited && tutorEnabled ? (
          <View style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: c.goldSoft }} testID="tutor-limit">
            <T style={{ lineHeight: 22 }}>{TUTOR_LIMIT_TEXT}</T>
            <Pressable accessibilityRole="button" onPress={() => router.push('/premium')} style={{ minHeight: 36, justifyContent: 'center' }} testID="tutor-premium">
              <T weight="bold" tone="accent">Открыть Премиум</T>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: c.bg }}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              accessibilityLabel="Вопрос учителю"
              editable={tutorEnabled && !busy && !limited}
              multiline
              maxLength={600}
              onChangeText={setDraft}
              placeholder={tutorEnabled ? 'Ваш вопрос' : 'Учитель не подключён'}
              placeholderTextColor={c.muted}
              value={draft}
              testID="tutor-input"
              style={{ flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, color: c.ink, fontFamily: fonts.regular, fontSize: 16 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Отправить"
              disabled={!tutorEnabled || busy || limited || !draft.trim()}
              onPress={() => send(draft)}
              testID="tutor-send"
              style={({ pressed }) => ({ height: 48, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent, opacity: !tutorEnabled || busy || limited || !draft.trim() ? 0.4 : pressed ? 0.8 : 1 })}
            >
              <T weight="bold" style={{ color: c.onAccent }}>Отправить</T>
            </Pressable>
          </View>
          <T size={11} tone="muted">Вопросы отправляются в сервис Google Gemini. Не пишите личные данные. ИИ может ошибаться.</T>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
