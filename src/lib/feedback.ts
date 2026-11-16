import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { E2E, getDeviceId, testWindow } from './server';
import { supabase } from './supabase';

export type ReportKind = 'lesson' | 'tutor';

/** Сообщение об ошибке: уходит в базу, автор читает его в панели Supabase */
export async function sendReport(report: { kind: ReportKind; reason: string; message?: string; lessonId?: string; context?: Record<string, unknown> }) {
  if (E2E) {
    (testWindow as unknown as { __reports?: unknown[] } | undefined)?.__reports?.push(report);
    return true;
  }
  if (!supabase) return false;
  const { error } = await supabase.from('reports').insert({
    kind: report.kind,
    reason: report.reason.slice(0, 60),
    message: report.message?.trim().slice(0, 1000) || null,
    lesson_id: report.lessonId?.slice(0, 60) ?? null,
    context: { ...report.context, app: Constants.expoConfig?.version ?? null },
    device: await getDeviceId(),
  });
  return !error;
}

export type EventName = 'open' | 'lesson_start' | 'lesson_finish' | 'premium_view' | 'tutor_ask';

const OPEN_KEY = 'alif.opened.v1';

/**
 * Анонимный счётчик: случайный номер телефона и событие, без имени и почты.
 * Ничего не ждёт и не мешает работе: если нет интернета, событие просто теряется
 */
export function track(event: EventName, lessonId?: string, value?: number) {
  if (E2E || !supabase) return;
  void (async () => {
    try {
      // «Открыл приложение» считаем раз в день
      if (event === 'open') {
        const today = new Date().toISOString().slice(0, 10);
        if ((await AsyncStorage.getItem(OPEN_KEY)) === today) return;
        await AsyncStorage.setItem(OPEN_KEY, today);
      }
      await supabase?.from('events').insert({ device: await getDeviceId(), event, lesson_id: lessonId ?? null, value: value ?? null });
    } catch {
      // счётчик не важнее урока
    }
  })();
}
