import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

// Проверка новой сборки APK: сайт хранит version.json с версией нативной части.
// Если у телефона другая runtimeVersion, обновления по воздуху до него больше не дойдут — предлагаем скачать APK

export type AppRelease = { version: string; runtime: string; apk: string; notes: string[] };

const URL = 'https://alif.best/version.json';
const SNOOZE_KEY = 'alif.update.snooze.v1';

export async function checkAppUpdate(): Promise<AppRelease | null> {
  if (Platform.OS !== 'android') return null;
  const current = Updates.runtimeVersion;
  if (!current) return null;
  try {
    const until = Number(await AsyncStorage.getItem(SNOOZE_KEY)) || 0;
    if (Date.now() < until) return null;
    const res = await fetch(`${URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as AppRelease;
    if (!data.runtime || !data.apk || data.runtime === current) return null;
    return data;
  } catch {
    return null;
  }
}

/** «Потом»: не напоминать сутки */
export async function snoozeAppUpdate(hours = 24) {
  try { await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + hours * 3600_000)); } catch { /* не страшно */ }
}
