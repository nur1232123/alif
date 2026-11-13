import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Адрес сервера «Алиф» (проверка голоса и ИИ-учитель) задаётся в .env приложения
export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL || process.env.EXPO_PUBLIC_VOICE_URL || '').replace(/\/+$/, '');
export const SERVER_TOKEN = (process.env.EXPO_PUBLIC_SERVER_TOKEN || process.env.EXPO_PUBLIC_VOICE_TOKEN || '').trim();
export const E2E = process.env.EXPO_PUBLIC_E2E === '1';
/** Режим проверки для автора: все уроки открыты. Включается строкой EXPO_PUBLIC_TEST_MODE=1 в .env, у учеников его нет */
export const TEST_MODE = process.env.EXPO_PUBLIC_TEST_MODE === '1';

/** Сервер доступен только из приложения на телефоне: страница внутри Claude не может к нему обращаться */
export const serverReady = Platform.OS !== 'web' && SERVER_URL.length > 0;

/** Ключ проверяющего: с ним сервер не ограничивает учителя. Только в .env автора, у учеников его нет */
const TESTER_KEY = (process.env.EXPO_PUBLIC_TESTER_KEY || '').trim();

// Случайный номер телефона: по нему сервер считает бесплатные вопросы. Ничего личного в нём нет
const DEVICE_KEY = 'alif.device.v1';
let deviceId: string | null = null;
const randomId = () =>
  Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');

async function getDeviceId() {
  if (deviceId) return deviceId;
  const saved = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
  deviceId = saved ?? randomId();
  if (!saved) AsyncStorage.setItem(DEVICE_KEY, deviceId).catch(() => {});
  return deviceId;
}

// Номер покупателя в RevenueCat: по нему сервер сам проверяет Премиум
let rcUser = '';
export const setRcUser = (id: string) => {
  rcUser = id;
};

/** Заголовки для каждого запроса к серверу */
export async function serverHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'x-device-id': await getDeviceId() };
  if (SERVER_TOKEN) headers['x-app-token'] = SERVER_TOKEN;
  if (TESTER_KEY) headers['x-tester-key'] = TESTER_KEY;
  if (rcUser) headers['x-rc-user'] = rcUser;
  return headers;
}

/** В автотесте ответы сервера подставляются из страницы */
export type TestWindow = { __voice?: unknown; __tutor?: string | null };
export const testWindow = (globalThis as unknown as { window?: TestWindow }).window;
