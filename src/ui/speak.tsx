import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { SpeakTask } from '@/lib/plan';
import { playSfx } from '@/lib/sfx';
import { checkVoice, type VoiceResult } from '@/lib/voice';
import { Ar, Button, T } from './kit';
import type { Slots } from './tasks';
import { useColors } from './theme';

const MAX_RECORD_MS = 4000;

type Phase = 'idle' | 'recording' | 'checking' | 'silent' | 'denied' | 'unavailable' | 'done';

export function useSpeak(task: SpeakTask, last: boolean, onDone: (correct: boolean) => void, onSkip: () => void): Slots {
  const c = useColors();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Extract<VoiceResult, { status: 'checked' }> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishRecording = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPhase('checking');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const checked = await checkVoice(recorder.uri ?? '', task.expected, task.isLetter ? [task.ar] : []);
      if (checked.status === 'checked') {
        playSfx(checked.correct ? 'right' : 'wrong');
        setResult(checked);
        setPhase('done');
      } else {
        setPhase(checked.status);
      }
    } catch {
      setPhase('unavailable');
    }
  };

  const start = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      timer.current = setTimeout(finishRecording, MAX_RECORD_MS);
    } catch {
      setPhase('unavailable');
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const busy = phase === 'checking';
  const recording = phase === 'recording';
  const message: Partial<Record<Phase, string>> = {
    idle: 'Нажмите, скажите вслух и нажмите ещё раз',
    recording: 'Говорите… Нажмите, когда закончите',
    checking: 'Проверяю произношение',
    silent: 'Голос не расслышан. Скажите громче и ближе к телефону.',
    denied: 'Нет доступа к микрофону. Разрешите его в настройках телефона.',
    unavailable: 'Сейчас не удалось проверить голос. Проверьте интернет.',
  };
  const canSkip = phase === 'denied' || phase === 'unavailable' || phase === 'idle' || phase === 'silent';

  return {
    body: (
      <View style={{ gap: 18, flex: 1 }}>
        <T size={20} weight="bold" style={{ lineHeight: 28 }}>
          {task.isLetter ? 'Скажите название этой буквы' : 'Прочитайте вслух'}
        </T>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Ar size={task.ar.length <= 4 ? 96 : task.ar.length <= 14 ? 52 : 32}>{task.ar}</Ar>
        </View>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Закончить запись' : 'Начать запись'}
            disabled={busy || phase === 'done'}
            onPress={recording ? finishRecording : start}
            testID="mic"
            style={({ pressed }) => ({
              width: 104,
              height: 104,
              borderRadius: 52,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: recording ? c.bad : c.accent,
              borderBottomWidth: pressed ? 0 : 6,
              borderBottomColor: c.ink + '33',
              opacity: phase === 'done' ? 0.4 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={c.onAccent} />
            ) : recording ? (
              <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: c.onAccent }} />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 22, height: 38, borderRadius: 11, backgroundColor: c.onAccent }} />
                <View style={{ width: 4, height: 8, backgroundColor: c.onAccent }} />
                <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: c.onAccent }} />
              </View>
            )}
          </Pressable>
          {message[phase] ? <T tone="muted" style={{ textAlign: 'center' }} testID={`speak-${phase}`}>{message[phase]}</T> : null}
        </View>
        <T size={12} tone="muted" style={{ textAlign: 'center', marginTop: 'auto' }}>
          Запись отправляется на проверку в сервис распознавания речи Microsoft и не хранится.
        </T>
      </View>
    ),
    footer:
      phase === 'done' && result ? (
        <View
          style={{ gap: 10, marginHorizontal: -20, marginBottom: -16, marginTop: -12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, backgroundColor: result.correct ? c.goodSoft : c.badSoft }}
          testID={result.correct ? 'feedback-right' : 'feedback-wrong'}
        >
          <T weight="bold" tone={result.correct ? 'good' : 'bad'} size={19}>{result.correct ? 'Правильно' : 'Неправильно'}</T>
          <T>{task.ru}</T>
          {result.heard ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
              <T size={14} tone="muted">Услышано:</T>
              <Ar size={22} style={{ lineHeight: 34 }}>{result.heard}</Ar>
            </View>
          ) : null}
          <Button label={last ? 'Завершить' : 'Дальше'} onPress={() => onDone(result.correct)} tone={result.correct ? 'good' : 'bad'} testID="next" />
        </View>
      ) : (
        <Button kind="quiet" label="Не могу говорить сейчас" onPress={onSkip} disabled={!canSkip} testID="skip-voice" />
      ),
  };
}
