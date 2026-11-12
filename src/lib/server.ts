import { Platform } from 'react-native';

// Адрес сервера «Алиф» (проверка голоса и ИИ-учитель) задаётся в .env приложения
export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL || process.env.EXPO_PUBLIC_VOICE_URL || '').replace(/\/+$/, '');
export const SERVER_TOKEN = (process.env.EXPO_PUBLIC_SERVER_TOKEN || process.env.EXPO_PUBLIC_VOICE_TOKEN || '').trim();
export const E2E = process.env.EXPO_PUBLIC_E2E === '1';
/** Режим проверки для автора: все уроки открыты. Включается строкой EXPO_PUBLIC_TEST_MODE=1 в .env, у учеников его нет */
export const TEST_MODE = process.env.EXPO_PUBLIC_TEST_MODE === '1';

/** Сервер доступен только из приложения на телефоне: страница внутри Claude не может к нему обращаться */
export const serverReady = Platform.OS !== 'web' && SERVER_URL.length > 0;

/** В автотесте ответы сервера подставляются из страницы */
export type TestWindow = { __voice?: unknown; __tutor?: string | null };
export const testWindow = (globalThis as unknown as { window?: TestWindow }).window;
