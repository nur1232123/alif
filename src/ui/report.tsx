import { createContext, useContext, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendReport, type ReportKind } from '@/lib/feedback';
import { Button, T } from './kit';
import { fonts, useColors } from './theme';

const REASONS: Record<ReportKind, string[]> = {
  lesson: ['Ошибка в арабском', 'Неверный перевод', 'Неправильно проверило ответ', 'Нет звука или не тот звук', 'Другое'],
  tutor: ['Неверный ответ', 'Ответ не по теме', 'Грубый или вредный ответ', 'Другое'],
};

/** Что сейчас на экране урока: уходит вместе с сообщением об ошибке */
export const ReportContext = createContext<{ lessonId?: string; context?: Record<string, unknown> } | null>(null);

/** Окно «Сообщить об ошибке» снизу экрана */
export function ReportSheet({
  visible,
  onClose,
  kind,
  lessonId,
  context,
}: {
  visible: boolean;
  onClose: () => void;
  kind: ReportKind;
  lessonId?: string;
  context?: Record<string, unknown>;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const close = () => {
    onClose();
    setTimeout(() => {
      setReason(null);
      setMessage('');
      setState('idle');
    }, 300);
  };

  const send = async () => {
    if (!reason) return;
    setState('sending');
    const ok = await sendReport({ kind, reason, message, lessonId, context });
    setState(ok ? 'sent' : 'error');
    if (ok) setTimeout(close, 1400);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.35)' }} onPress={close} accessibilityLabel="Закрыть" />
        <View
          style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}
          testID="report-sheet"
        >
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 14 }}>
            <T size={20} weight="bold">{kind === 'tutor' ? 'Пожаловаться на ответ' : 'Сообщить об ошибке'}</T>
            {state === 'sent' ? (
              <T tone="good" style={{ lineHeight: 22 }} testID="report-sent">Спасибо! Мы проверим и исправим.</T>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REASONS[kind].map((r) => {
                    const on = reason === r;
                    return (
                      <Pressable
                        key={r}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => setReason(r)}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.soft : c.surface }}
                        testID={`report-reason-${REASONS[kind].indexOf(r)}`}
                      >
                        <T size={15} weight={on ? 'bold' : 'regular'}>{r}</T>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  accessibilityLabel="Что не так"
                  multiline
                  maxLength={1000}
                  onChangeText={setMessage}
                  placeholder="Что именно не так? (необязательно)"
                  placeholderTextColor={c.muted}
                  value={message}
                  testID="report-message"
                  style={{ minHeight: 80, maxHeight: 160, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.ink, fontFamily: fonts.medium, fontSize: 16, textAlignVertical: 'top' }}
                />
                {state === 'error' ? <T size={14} tone="bad">Не получилось отправить. Проверьте интернет и попробуйте ещё раз.</T> : null}
                {state === 'sending' ? (
                  <ActivityIndicator color={c.accent} style={{ height: 52 }} />
                ) : (
                  <Button label="Отправить" onPress={send} disabled={!reason} testID="report-send" />
                )}
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Флажок в шапке урока: открывает «Сообщить об ошибке» про текущее задание */
export function ReportButton() {
  const c = useColors();
  const info = useContext(ReportContext);
  const [open, setOpen] = useState(false);
  if (!info) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Сообщить об ошибке"
        hitSlop={12}
        onPress={() => setOpen(true)}
        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        testID="report-open"
      >
        <T size={20} style={{ color: c.muted, lineHeight: 24 }}>⚑</T>
      </Pressable>
      <ReportSheet visible={open} onClose={() => setOpen(false)} kind="lesson" lessonId={info.lessonId} context={info.context} />
    </>
  );
}
